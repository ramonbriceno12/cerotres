import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getExchangeRate, fromUSD } from "../utils/currency.js";
import { PRODUCT_SELECT as SELECT, normalizeProduct } from "../utils/catalog.js";

export const productsRouter = Router();

function withDisplayPrices(product, currency, rate) {
  if (!currency || currency === "USD") return product;
  return {
    ...product,
    display_currency: currency,
    display_price: fromUSD(product.base_price, rate),
    option_groups: product.option_groups.map((g) => ({
      ...g,
      items: g.items.map((i) => ({ ...i, display_price_modifier: fromUSD(i.price_modifier, rate) })),
    })),
  };
}

// Public read (storefront menu) - no auth required, only active items.
// Pass ?currency=EUR|VES to also get display_price converted at the current rate.
productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isPublic = req.query.public === "true";
    let query = supabaseAdmin.from("products").select(SELECT).order("display_order", { ascending: true });
    if (isPublic) query = query.eq("is_active", true);
    if (req.query.category_id) query = query.eq("category_id", req.query.category_id);
    if (req.query.search) query = query.ilike("name", `%${req.query.search}%`);
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);

    const normalized = data.map(normalizeProduct);
    if (req.query.currency && req.query.currency !== "USD") {
      const rate = await getExchangeRate(req.query.currency);
      return res.json({ data: normalized.map((p) => withDisplayPrices(p, req.query.currency, rate)), exchange_rate: rate });
    }
    res.json({ data: normalized });
  })
);

productsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("products").select(SELECT).eq("id", req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, "No encontrado");
    res.json({ data: normalizeProduct(data) });
  })
);

productsRouter.use(requireAuth);

productsRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { option_group_ids, ...body } = req.body;
    const { data, error } = await supabaseAdmin.from("products").insert(body).select("*").single();
    if (error) throw new ApiError(400, error.message);

    if (Array.isArray(option_group_ids) && option_group_ids.length) {
      await supabaseAdmin
        .from("product_option_groups")
        .insert(option_group_ids.map((id, idx) => ({ product_id: data.id, option_group_id: id, display_order: idx })));
    }

    const { data: fresh } = await supabaseAdmin.from("products").select(SELECT).eq("id", data.id).single();
    res.status(201).json({ data: normalizeProduct(fresh) });
  })
);

productsRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { option_group_ids, ...body } = req.body;

    if (body.base_price !== undefined) {
      const { data: current } = await supabaseAdmin.from("products").select("base_price").eq("id", req.params.id).single();
      if (current && Number(current.base_price) !== Number(body.base_price)) {
        await supabaseAdmin.from("price_history").insert({
          product_id: req.params.id,
          old_price: current.base_price,
          new_price: body.base_price,
          changed_by: req.user.id,
        });
      }
    }

    const { error } = await supabaseAdmin.from("products").update(body).eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);

    if (Array.isArray(option_group_ids)) {
      await supabaseAdmin.from("product_option_groups").delete().eq("product_id", req.params.id);
      if (option_group_ids.length) {
        await supabaseAdmin
          .from("product_option_groups")
          .insert(option_group_ids.map((id, idx) => ({ product_id: req.params.id, option_group_id: id, display_order: idx })));
      }
    }

    const { data: fresh } = await supabaseAdmin.from("products").select(SELECT).eq("id", req.params.id).single();
    res.json({ data: normalizeProduct(fresh) });
  })
);

productsRouter.delete(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("products").update({ is_active: false }).eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deactivated: true } });
  })
);
