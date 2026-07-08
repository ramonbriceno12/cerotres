import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getExchangeRate, toUSD } from "../utils/currency.js";

// Purchases (compras a proveedores). A purchase starts as 'pending'; marking it
// 'received' moves inventory (creates inventory_movements) but does NOT touch
// cash - receiving stock and paying the supplier are different events. Paying
// (partially or in full) is tracked separately in purchase_payments, which is
// what CXP (cuentas por pagar) is built from. Editing items after receiving is
// blocked to keep the stock ledger consistent.
export const purchasesRouter = Router();
purchasesRouter.use(requireAuth, requireRole("admin", "manager"));

const SELECT =
  "*, supplier:suppliers(id, name), items:purchase_items(*, ingredient:ingredients(id, name, unit:units(abbreviation))), payments:purchase_payments(*)";

async function recomputePurchasePaymentStatus(purchaseId) {
  const { data: purchase } = await supabaseAdmin.from("purchases").select("total").eq("id", purchaseId).single();
  const { data: payments } = await supabaseAdmin.from("purchase_payments").select("amount").eq("purchase_id", purchaseId);
  const paidTotal = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  let paymentStatus = "pending";
  if (paidTotal >= Number(purchase.total) - 0.01) paymentStatus = "paid";
  else if (paidTotal > 0) paymentStatus = "partial";

  await supabaseAdmin.from("purchases").update({ payment_status: paymentStatus }).eq("id", purchaseId);
}

purchasesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("purchases").select(SELECT).order("purchase_date", { ascending: false });
    if (req.query.status) query = query.eq("status", req.query.status);
    if (req.query.supplier_id) query = query.eq("supplier_id", req.query.supplier_id);
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

purchasesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("purchases").select(SELECT).eq("id", req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, "No encontrado");
    res.json({ data });
  })
);

purchasesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { items, ...body } = req.body;
    if (!Array.isArray(items) || !items.length) throw new ApiError(400, "La compra debe tener al menos un item");

    const total = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_cost), 0);

    const { data: purchase, error } = await supabaseAdmin
      .from("purchases")
      .insert({ ...body, total, created_by: req.user.id })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);

    const { error: itemsError } = await supabaseAdmin
      .from("purchase_items")
      .insert(items.map((i) => ({ ...i, purchase_id: purchase.id })));
    if (itemsError) throw new ApiError(400, itemsError.message);

    const { data: fresh } = await supabaseAdmin.from("purchases").select(SELECT).eq("id", purchase.id).single();
    res.status(201).json({ data: fresh });
  })
);

purchasesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data: existing } = await supabaseAdmin.from("purchases").select("status").eq("id", req.params.id).single();
    if (existing?.status === "received") throw new ApiError(400, "No se puede editar una compra ya recibida");

    const { data, error } = await supabaseAdmin.from("purchases").update(req.body).eq("id", req.params.id).select("*").single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

purchasesRouter.post(
  "/:id/receive",
  asyncHandler(async (req, res) => {
    const { data: purchase, error } = await supabaseAdmin
      .from("purchases")
      .select("*, items:purchase_items(*)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!purchase) throw new ApiError(404, "No encontrado");
    if (purchase.status === "received") throw new ApiError(400, "Esta compra ya fue recibida");
    if (purchase.status === "cancelled") throw new ApiError(400, "Esta compra esta cancelada");

    for (const item of purchase.items) {
      const { error: moveError } = await supabaseAdmin.from("inventory_movements").insert({
        ingredient_id: item.ingredient_id,
        movement_type: "purchase_in",
        quantity: item.quantity,
        reference_type: "purchase",
        reference_id: purchase.id,
        notes: `Compra ${purchase.purchase_number}`,
        created_by: req.user.id,
      });
      if (moveError) throw new ApiError(400, moveError.message);

      // Update the ingredient's reference cost to the latest purchase cost.
      await supabaseAdmin.from("ingredients").update({ cost_per_unit: item.unit_cost }).eq("id", item.ingredient_id);
    }

    const { error: updateError } = await supabaseAdmin
      .from("purchases")
      .update({ status: "received", received_date: new Date().toISOString().slice(0, 10) })
      .eq("id", purchase.id);
    if (updateError) throw new ApiError(400, updateError.message);

    const { data: fresh } = await supabaseAdmin.from("purchases").select(SELECT).eq("id", purchase.id).single();
    res.json({ data: fresh });
  })
);

// Pay a supplier (partially or in full) for an already-received purchase.
// Booking a payment is what actually moves cash (cash_flow_entries) and
// what CXP (accounts payable) reports are computed from.
purchasesRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const { amount_currency, currency = "USD", method, account_id, reference } = req.body;
    if (!(Number(amount_currency) > 0) || !method) throw new ApiError(400, "amount_currency (> 0) y method son requeridos");

    const { data: purchase } = await supabaseAdmin.from("purchases").select("id, status, purchase_number").eq("id", req.params.id).maybeSingle();
    if (!purchase) throw new ApiError(404, "No encontrado");
    if (purchase.status !== "received") throw new ApiError(400, "Solo se puede pagar una compra ya recibida");

    const rate = await getExchangeRate(currency);
    const amountUsd = currency === "USD" ? Number(amount_currency) : toUSD(amount_currency, rate);

    const { data: payment, error } = await supabaseAdmin
      .from("purchase_payments")
      .insert({
        purchase_id: purchase.id,
        amount: amountUsd,
        currency,
        exchange_rate: rate,
        amount_currency,
        method,
        account_id,
        reference,
        created_by: req.user.id,
      })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);

    await recomputePurchasePaymentStatus(purchase.id);

    await supabaseAdmin.from("cash_flow_entries").insert({
      entry_type: "expense",
      category: "compras",
      amount: amountUsd,
      description: `Pago (${method}) compra ${purchase.purchase_number}`,
      entry_date: new Date().toISOString().slice(0, 10),
      related_purchase_id: purchase.id,
      account_id,
      created_by: req.user.id,
    });

    res.status(201).json({ data: payment });
  })
);

purchasesRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const { data: existing } = await supabaseAdmin.from("purchases").select("status").eq("id", req.params.id).single();
    if (existing?.status === "received") throw new ApiError(400, "No se puede cancelar una compra ya recibida");
    const { data, error } = await supabaseAdmin
      .from("purchases")
      .update({ status: "cancelled" })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);
