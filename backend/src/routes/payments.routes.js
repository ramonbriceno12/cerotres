import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getExchangeRate, toUSD } from "../utils/currency.js";

// Payments always keep two numbers: amount (USD, the accounting base used by
// every report) and amount_currency (what was actually handed over, in
// whatever currency/method the customer used), converted at the rate in
// effect when the payment was registered.
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireRole("admin", "manager", "delivery"));

async function recomputeOrderPaymentStatus(orderId) {
  const { data: order } = await supabaseAdmin.from("orders").select("total").eq("id", orderId).single();
  const { data: payments } = await supabaseAdmin.from("payments").select("amount, status").eq("order_id", orderId).eq("status", "paid");
  const paidTotal = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  let paymentStatus = "pending";
  if (paidTotal >= Number(order.total) - 0.01) paymentStatus = "paid";
  else if (paidTotal > 0) paymentStatus = "partial";

  await supabaseAdmin.from("orders").update({ payment_status: paymentStatus }).eq("id", orderId);
}

paymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("payments").select("*, order:orders(order_number)").order("paid_at", { ascending: false });
    if (req.query.order_id) query = query.eq("order_id", req.query.order_id);
    if (req.query.from) query = query.gte("paid_at", req.query.from);
    if (req.query.to) query = query.lte("paid_at", req.query.to);
    const { data, error } = await query.limit(200);
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

paymentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { order_id, method, currency = "USD", amount_currency, reference, account_id } = req.body;
    if (!order_id || !method || !(Number(amount_currency) > 0)) {
      throw new ApiError(400, "order_id, method y amount_currency (> 0) son requeridos");
    }

    const rate = await getExchangeRate(currency);
    const amountUsd = currency === "USD" ? Number(amount_currency) : toUSD(amount_currency, rate);

    const { data, error } = await supabaseAdmin
      .from("payments")
      .insert({
        order_id,
        method,
        currency,
        exchange_rate: rate,
        amount_currency,
        amount: amountUsd,
        reference,
        account_id,
        created_by: req.user.id,
      })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);

    await recomputeOrderPaymentStatus(order_id);

    await supabaseAdmin.from("cash_flow_entries").insert({
      entry_type: "income",
      category: "ventas",
      amount: amountUsd,
      description: `Pago (${method}) pedido`,
      related_order_id: order_id,
      account_id,
      created_by: req.user.id,
    });

    res.status(201).json({ data });
  })
);

paymentsRouter.post(
  "/:id/refund",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .update({ status: "refunded" })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);

    await recomputeOrderPaymentStatus(payment.order_id);

    await supabaseAdmin.from("cash_flow_entries").insert({
      entry_type: "expense",
      category: "reembolsos",
      amount: payment.amount,
      description: "Reembolso de pago",
      related_order_id: payment.order_id,
      created_by: req.user.id,
    });

    res.json({ data: payment });
  })
);
