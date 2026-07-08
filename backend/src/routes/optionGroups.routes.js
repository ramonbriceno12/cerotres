import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

// Modifier groups for the product builder (e.g. "Tamano" single-select,
// "Salsas" multi-select). Public read so the storefront can render the
// builder; writes are admin/manager only.
export const optionGroupsRouter = Router();

const SELECT = "*, items:option_items(*, ingredient:ingredients(id, name))";

optionGroupsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("option_groups").select(SELECT).order("display_order", { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

optionGroupsRouter.use(requireAuth, requireRole("admin", "manager"));

optionGroupsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { items, ...body } = req.body;
    const { data, error } = await supabaseAdmin.from("option_groups").insert(body).select("*").single();
    if (error) throw new ApiError(400, error.message);

    if (Array.isArray(items) && items.length) {
      await supabaseAdmin.from("option_items").insert(items.map((i) => ({ ...i, option_group_id: data.id })));
    }

    const { data: fresh } = await supabaseAdmin.from("option_groups").select(SELECT).eq("id", data.id).single();
    res.status(201).json({ data: fresh });
  })
);

optionGroupsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { items, ...body } = req.body;
    const { error } = await supabaseAdmin.from("option_groups").update(body).eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);

    const { data: fresh } = await supabaseAdmin.from("option_groups").select(SELECT).eq("id", req.params.id).single();
    res.json({ data: fresh });
  })
);

optionGroupsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("option_groups").update({ is_active: false }).eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deactivated: true } });
  })
);

// --- items within a group ---
optionGroupsRouter.post(
  "/:id/items",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("option_items")
      .insert({ ...req.body, option_group_id: req.params.id })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.status(201).json({ data });
  })
);

optionGroupsRouter.patch(
  "/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("option_items").update(req.body).eq("id", req.params.itemId).select("*").single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

optionGroupsRouter.delete(
  "/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("option_items").update({ is_active: false }).eq("id", req.params.itemId);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deactivated: true } });
  })
);
