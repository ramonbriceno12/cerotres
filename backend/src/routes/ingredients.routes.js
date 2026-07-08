import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

// Ingredients (raw materials). current_stock is read-only here on purpose:
// it only changes through inventory_movements (purchases, adjustments, recipes),
// so the stock ledger (Kardex) stays trustworthy.
export const ingredientsRouter = Router();
ingredientsRouter.use(requireAuth);

const SELECT = "*, unit:units(id, name, abbreviation), default_supplier:suppliers(id, name)";

ingredientsRouter.get(
  "/",
  requireRole("admin", "manager", "kitchen"),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("ingredients").select(SELECT).order("name", { ascending: true });
    if (req.query.search) query = query.ilike("name", `%${req.query.search}%`);
    if (req.query.lowStock === "true") query = query.filter("current_stock", "lte", "min_stock");
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

ingredientsRouter.get(
  "/:id",
  requireRole("admin", "manager", "kitchen"),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("ingredients").select(SELECT).eq("id", req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, "No encontrado");
    res.json({ data });
  })
);

ingredientsRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { initial_stock, ...body } = req.body;
    delete body.current_stock;
    const { data, error } = await supabaseAdmin.from("ingredients").insert(body).select(SELECT).single();
    if (error) throw new ApiError(400, error.message);

    if (initial_stock && Number(initial_stock) > 0) {
      const { error: moveError } = await supabaseAdmin.from("inventory_movements").insert({
        ingredient_id: data.id,
        movement_type: "adjustment_in",
        quantity: Number(initial_stock),
        reference_type: "initial_stock",
        notes: "Stock inicial",
        created_by: req.user.id,
      });
      if (moveError) throw new ApiError(400, moveError.message);
    }

    const { data: fresh } = await supabaseAdmin.from("ingredients").select(SELECT).eq("id", data.id).single();
    res.status(201).json({ data: fresh });
  })
);

ingredientsRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    delete body.current_stock;
    delete body.initial_stock;
    const { data, error } = await supabaseAdmin.from("ingredients").update(body).eq("id", req.params.id).select(SELECT).single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

ingredientsRouter.delete(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("ingredients").update({ is_active: false }).eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deactivated: true } });
  })
);
