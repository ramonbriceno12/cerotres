import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "./asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

/**
 * Builds a generic REST CRUD router backed directly by a Supabase table.
 * Meant for simple reference/master-data tables (units, categories, suppliers,
 * customers, ingredients, expenses...). Modules with cross-table business logic
 * (orders, purchases, inventory, recipes) get their own hand-written routers.
 */
export function crudRouter({
  table,
  selectColumns = "*",
  searchColumn,
  defaultOrder = { column: "created_at", ascending: false },
  readRoles = ["admin", "manager", "kitchen", "delivery"],
  writeRoles = ["admin", "manager"],
  softDeleteColumn = "is_active",
  publicRead = false,
}) {
  const router = Router();
  const readGuard = publicRead ? [] : [requireAuth, requireRole(...readRoles)];

  router.get(
    "/",
    ...readGuard,
    asyncHandler(async (req, res) => {
      let query = supabaseAdmin.from(table).select(selectColumns).order(defaultOrder.column, { ascending: defaultOrder.ascending });

      if (searchColumn && req.query.search) {
        query = query.ilike(searchColumn, `%${req.query.search}%`);
      }
      if (req.query.activeOnly === "true" && softDeleteColumn) {
        query = query.eq(softDeleteColumn, true);
      }

      const { data, error } = await query;
      if (error) throw new ApiError(400, error.message);
      res.json({ data });
    })
  );

  router.get(
    "/:id",
    ...readGuard,
    asyncHandler(async (req, res) => {
      const { data, error } = await supabaseAdmin.from(table).select(selectColumns).eq("id", req.params.id).maybeSingle();
      if (error) throw new ApiError(400, error.message);
      if (!data) throw new ApiError(404, "No encontrado");
      res.json({ data });
    })
  );

  router.post(
    "/",
    requireAuth,
    requireRole(...writeRoles),
    asyncHandler(async (req, res) => {
      const { data, error } = await supabaseAdmin.from(table).insert(req.body).select(selectColumns).single();
      if (error) throw new ApiError(400, error.message);
      res.status(201).json({ data });
    })
  );

  router.patch(
    "/:id",
    requireAuth,
    requireRole(...writeRoles),
    asyncHandler(async (req, res) => {
      const { data, error } = await supabaseAdmin.from(table).update(req.body).eq("id", req.params.id).select(selectColumns).single();
      if (error) throw new ApiError(400, error.message);
      res.json({ data });
    })
  );

  router.delete(
    "/:id",
    requireAuth,
    requireRole(...writeRoles),
    asyncHandler(async (req, res) => {
      if (softDeleteColumn) {
        const { error } = await supabaseAdmin.from(table).update({ [softDeleteColumn]: false }).eq("id", req.params.id);
        if (error) throw new ApiError(400, error.message);
        return res.json({ data: { deactivated: true } });
      }
      const { error } = await supabaseAdmin.from(table).delete().eq("id", req.params.id);
      if (error) throw new ApiError(400, error.message);
      res.json({ data: { deleted: true } });
    })
  );

  return router;
}
