import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

// Inventory movements (Kardex) + manual adjustments / waste. Stock deduction from
// sales happens automatically in orders.routes.js when an order is confirmed.
export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, requireRole("admin", "manager", "kitchen"));

inventoryRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from("inventory_movements")
      .select("*, ingredient:ingredients(id, name, unit:units(abbreviation))")
      .order("created_at", { ascending: false })
      .limit(200);
    if (req.query.ingredient_id) query = query.eq("ingredient_id", req.query.ingredient_id);
    if (req.query.movement_type) query = query.eq("movement_type", req.query.movement_type);
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

inventoryRouter.get(
  "/low-stock",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("ingredients")
      .select("*, unit:units(abbreviation)")
      .eq("is_active", true)
      .filter("current_stock", "lte", "min_stock")
      .order("name", { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

inventoryRouter.post(
  "/adjustments",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { ingredient_id, movement_type, quantity, notes } = req.body;
    if (!["adjustment_in", "adjustment_out", "waste"].includes(movement_type)) {
      throw new ApiError(400, "movement_type invalido para un ajuste manual");
    }
    if (!(Number(quantity) > 0)) throw new ApiError(400, "quantity debe ser mayor a 0");

    const { data, error } = await supabaseAdmin
      .from("inventory_movements")
      .insert({
        ingredient_id,
        movement_type,
        quantity,
        reference_type: "manual_adjustment",
        notes,
        created_by: req.user.id,
      })
      .select("*, ingredient:ingredients(id, name, current_stock)")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.status(201).json({ data });
  })
);
