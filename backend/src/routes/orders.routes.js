import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { transitionOrderStatus } from "../utils/orderStatus.js";
import { getExchangeRate, fromUSD } from "../utils/currency.js";
import { PRODUCT_SELECT, normalizeProduct } from "../utils/catalog.js";
import { buildCustomerReceipt, buildKitchenTicket } from "../utils/thermalPdf.js";

export const ordersRouter = Router();

const FULL_SELECT = `*,
  customer:customers(*),
  delivery_address:customer_addresses(*),
  items:order_items(*, product:products(id, name, image_url), options:order_item_options(*)),
  payments(*),
  status_history:order_status_history(*)`;

// Prices every line server-side from the live catalog (never trust client
// prices) and validates the chosen options against each product's option
// groups (required/single/multiple), Subway-builder style.
async function priceAndValidateItems(items) {
  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: rawProducts, error } = await supabaseAdmin.from("products").select(PRODUCT_SELECT).in("id", productIds);
  if (error) throw new ApiError(400, error.message);
  const products = rawProducts.map(normalizeProduct);

  return items.map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    if (!product || !product.is_active) throw new ApiError(400, `Producto no disponible: ${item.product_id}`);

    const selectedIds = new Set(item.selected_options || []);
    const resolvedOptions = [];

    for (const group of product.option_groups) {
      const groupItemIds = new Set(group.items.map((i) => i.id));
      const chosenInGroup = group.items.filter((i) => selectedIds.has(i.id));

      if (group.is_required && chosenInGroup.length === 0) {
        throw new ApiError(400, `Debes elegir una opcion de "${group.name}" para ${product.name}`);
      }
      if (group.selection_type === "single" && chosenInGroup.length > 1) {
        throw new ApiError(400, `Solo puedes elegir una opcion de "${group.name}" para ${product.name}`);
      }
      if (group.max_select && chosenInGroup.length > group.max_select) {
        throw new ApiError(400, `Maximo ${group.max_select} opciones en "${group.name}" para ${product.name}`);
      }
      chosenInGroup.forEach((opt) => resolvedOptions.push(opt));
      chosenInGroup.forEach((opt) => selectedIds.delete(opt.id));
      void groupItemIds;
    }

    if (selectedIds.size > 0) {
      throw new ApiError(400, `Alguna opcion seleccionada no aplica a ${product.name}`);
    }

    const unitPrice = Number(product.base_price) + resolvedOptions.reduce((sum, o) => sum + Number(o.price_modifier), 0);

    return {
      product_id: item.product_id,
      quantity: item.quantity,
      notes: item.notes,
      unit_price: unitPrice,
      options: resolvedOptions.map((o) => ({ option_item_id: o.id, name: o.name, price_modifier: o.price_modifier })),
    };
  });
}

// ---------- Checkout: used by both the storefront (anonymous) and the
// admin "Nuevo pedido" screen (authenticated, sets created_by). ----------
ordersRouter.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { customer, address, order_type = "delivery", items, payment_method, notes, currency = "USD" } = req.body;

    if (!customer?.full_name || !customer?.phone || !customer?.cedula || !customer?.email) {
      throw new ApiError(400, "Nombre, cedula, correo y telefono del cliente son requeridos");
    }
    if (!Array.isArray(items) || !items.length) throw new ApiError(400, "El pedido debe tener al menos un producto");
    if (!address?.address_line) throw new ApiError(400, "La direccion del cliente es requerida");

    // find or create the customer by cedula (falls back to phone for legacy rows without cedula)
    let { data: existingCustomer } = await supabaseAdmin
      .from("customers")
      .select("*")
      .or(`cedula.eq.${customer.cedula},phone.eq.${customer.phone}`)
      .maybeSingle();
    let customerRow = existingCustomer;
    if (!customerRow) {
      const { data: created, error: customerError } = await supabaseAdmin
        .from("customers")
        .insert({
          full_name: customer.full_name,
          phone: customer.phone,
          email: customer.email,
          cedula: customer.cedula,
          instagram_handle: customer.instagram_handle,
        })
        .select("*")
        .single();
      if (customerError) throw new ApiError(400, customerError.message);
      customerRow = created;
    } else {
      await supabaseAdmin
        .from("customers")
        .update({ full_name: customer.full_name, email: customer.email, cedula: customer.cedula })
        .eq("id", customerRow.id);
    }

    const { data: addressRow, error: addressError } = await supabaseAdmin
      .from("customer_addresses")
      .insert({ ...address, customer_id: customerRow.id })
      .select("*")
      .single();
    if (addressError) throw new ApiError(400, addressError.message);
    const deliveryAddressId = addressRow.id;

    const priced = await priceAndValidateItems(items);

    const subtotal = priced.reduce((sum, i) => sum + i.unit_price * Number(i.quantity), 0);
    const { data: settings } = await supabaseAdmin.from("business_settings").select("default_delivery_fee").eq("id", true).single();
    const deliveryFee = order_type === "delivery" ? Number(settings?.default_delivery_fee || 0) : 0;
    const total = subtotal + deliveryFee;

    const exchangeRate = await getExchangeRate(currency);
    const totalCurrency = fromUSD(total, exchangeRate);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: customerRow.id,
        order_type,
        delivery_address_id: deliveryAddressId,
        subtotal,
        delivery_fee: deliveryFee,
        total,
        currency,
        exchange_rate: exchangeRate,
        total_currency: totalCurrency,
        payment_method,
        notes,
        created_by: req.user?.id || null,
      })
      .select("*")
      .single();
    if (orderError) throw new ApiError(400, orderError.message);

    const { data: insertedItems, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .insert(
        priced.map((i) => ({
          order_id: order.id,
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          notes: i.notes,
        }))
      )
      .select("id");
    if (itemsError) throw new ApiError(400, itemsError.message);

    const optionRows = [];
    insertedItems.forEach((row, idx) => {
      for (const opt of priced[idx].options) {
        optionRows.push({ order_item_id: row.id, ...opt });
      }
    });
    if (optionRows.length) {
      const { error: optionsError } = await supabaseAdmin.from("order_item_options").insert(optionRows);
      if (optionsError) throw new ApiError(400, optionsError.message);
    }

    await supabaseAdmin.from("order_status_history").insert({ order_id: order.id, status: "pending", changed_by: req.user?.id || null });

    const { data: fresh } = await supabaseAdmin.from("orders").select(FULL_SELECT).eq("id", order.id).single();
    res.status(201).json({ data: fresh });
  })
);

// Public order tracking: order number + phone, no auth (customer might not have an account).
ordersRouter.get(
  "/track/:orderNumber",
  asyncHandler(async (req, res) => {
    const { phone } = req.query;
    if (!phone) throw new ApiError(400, "phone es requerido");

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("order_number, status, order_type, total, placed_at, estimated_ready_at, customer:customers!inner(phone)")
      .eq("order_number", req.params.orderNumber)
      .eq("customer.phone", phone)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, "Pedido no encontrado");
    res.json({ data });
  })
);

// ---------- Staff ----------
ordersRouter.use(requireAuth);

ordersRouter.get(
  "/",
  requireRole("admin", "manager", "kitchen", "delivery"),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("orders").select(FULL_SELECT).order("placed_at", { ascending: false });
    if (req.query.status) query = query.eq("status", req.query.status);
    if (req.query.order_type) query = query.eq("order_type", req.query.order_type);
    if (req.query.from) query = query.gte("placed_at", req.query.from);
    if (req.query.to) query = query.lte("placed_at", req.query.to);
    if (req.query.customer_id) query = query.eq("customer_id", req.query.customer_id);
    const { data, error } = await query.limit(200);
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

ordersRouter.get(
  "/:id",
  requireRole("admin", "manager", "kitchen", "delivery"),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("orders").select(FULL_SELECT).eq("id", req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, "No encontrado");
    res.json({ data });
  })
);

ordersRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { data: existing } = await supabaseAdmin.from("orders").select("status").eq("id", req.params.id).single();
    if (existing?.status !== "pending") throw new ApiError(400, "Solo se pueden editar pedidos en estado pendiente");

    const allowedFields = ["notes", "discount", "delivery_fee", "payment_method"];
    const body = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowedFields.includes(k)));

    if (body.discount !== undefined || body.delivery_fee !== undefined) {
      const { data: current } = await supabaseAdmin
        .from("orders")
        .select("subtotal, discount, delivery_fee, exchange_rate")
        .eq("id", req.params.id)
        .single();
      const discount = body.discount !== undefined ? Number(body.discount) : Number(current.discount);
      const deliveryFee = body.delivery_fee !== undefined ? Number(body.delivery_fee) : Number(current.delivery_fee);
      body.total = Number(current.subtotal) - discount + deliveryFee;
      body.total_currency = fromUSD(body.total, current.exchange_rate);
    }

    const { data, error } = await supabaseAdmin.from("orders").update(body).eq("id", req.params.id).select(FULL_SELECT).single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

ordersRouter.get(
  "/:id/receipt.pdf",
  requireRole("admin", "manager", "delivery"),
  asyncHandler(async (req, res) => {
    const { data: order, error } = await supabaseAdmin.from("orders").select(FULL_SELECT).eq("id", req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!order) throw new ApiError(404, "No encontrado");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${order.order_number}-recibo.pdf"`);
    buildCustomerReceipt(order).pipe(res);
  })
);

ordersRouter.get(
  "/:id/kitchen-ticket.pdf",
  requireRole("admin", "manager", "kitchen"),
  asyncHandler(async (req, res) => {
    const { data: order, error } = await supabaseAdmin.from("orders").select(FULL_SELECT).eq("id", req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!order) throw new ApiError(404, "No encontrado");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${order.order_number}-comanda.pdf"`);
    buildKitchenTicket(order).pipe(res);
  })
);

ordersRouter.post(
  "/:id/status",
  requireRole("admin", "manager", "kitchen", "delivery"),
  asyncHandler(async (req, res) => {
    const { status, notes, cancel_reason } = req.body;
    const updated = await transitionOrderStatus(req.params.id, status, { userId: req.user.id, notes, cancelReason: cancel_reason });
    res.json({ data: updated });
  })
);
