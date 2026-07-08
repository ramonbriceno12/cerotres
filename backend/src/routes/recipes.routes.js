import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

// Recipes = bill of materials per product (base recipe only; extras chosen
// via option-group items can carry their own ingredient consumption).
// Cost is derived, never stored, so it always reflects the ingredients'
// current cost_per_unit (feeds the Costos module).
export const recipesRouter = Router();
recipesRouter.use(requireAuth, requireRole("admin", "manager", "kitchen"));

const SELECT =
  "*, product:products(id, name), ingredients:recipe_ingredients(*, ingredient:ingredients(id, name, cost_per_unit, unit:units(id, name, abbreviation)))";

function withCost(recipe) {
  const cost = (recipe.ingredients || []).reduce((sum, ri) => sum + Number(ri.quantity) * Number(ri.ingredient?.cost_per_unit || 0), 0);
  return { ...recipe, estimated_cost: Number(cost.toFixed(4)) };
}

recipesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("recipes").select(SELECT).order("name", { ascending: true });
    if (req.query.product_id) query = query.eq("product_id", req.query.product_id);
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);
    res.json({ data: (data || []).map(withCost) });
  })
);

recipesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("recipes").select(SELECT).eq("id", req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, "No encontrado");
    res.json({ data: withCost(data) });
  })
);

recipesRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { ingredients, ...body } = req.body;
    const { data, error } = await supabaseAdmin.from("recipes").insert(body).select("*").single();
    if (error) throw new ApiError(400, error.message);

    if (Array.isArray(ingredients) && ingredients.length) {
      const { error: riError } = await supabaseAdmin
        .from("recipe_ingredients")
        .insert(ingredients.map((i) => ({ ...i, recipe_id: data.id })));
      if (riError) throw new ApiError(400, riError.message);
    }

    const { data: fresh } = await supabaseAdmin.from("recipes").select(SELECT).eq("id", data.id).single();
    res.status(201).json({ data: withCost(fresh) });
  })
);

recipesRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { ingredients, ...body } = req.body;
    const { error } = await supabaseAdmin.from("recipes").update(body).eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);

    if (Array.isArray(ingredients)) {
      await supabaseAdmin.from("recipe_ingredients").delete().eq("recipe_id", req.params.id);
      if (ingredients.length) {
        const { error: riError } = await supabaseAdmin
          .from("recipe_ingredients")
          .insert(ingredients.map((i) => ({ ...i, recipe_id: req.params.id })));
        if (riError) throw new ApiError(400, riError.message);
      }
    }

    const { data: fresh } = await supabaseAdmin.from("recipes").select(SELECT).eq("id", req.params.id).single();
    res.json({ data: withCost(fresh) });
  })
);

recipesRouter.delete(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("recipes").delete().eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deleted: true } });
  })
);
