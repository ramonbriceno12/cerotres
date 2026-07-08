import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("business_settings").select("*").eq("id", true).single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

settingsRouter.patch(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("business_settings").update(req.body).eq("id", true).select("*").single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

// Staff management (create/list/update staff accounts). Admin only.
settingsRouter.get(
  "/staff",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .neq("role", "customer")
      .order("full_name", { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

settingsRouter.post(
  "/staff",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { email, password, full_name, phone, role } = req.body;
    if (!email || !password || !full_name || !role) throw new ApiError(400, "email, password, full_name y role son requeridos");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone, role },
    });
    if (error) throw new ApiError(400, error.message);
    res.status(201).json({ data: { id: created.user.id, email: created.user.email } });
  })
);

settingsRouter.patch(
  "/staff/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { full_name, phone, role, is_active } = req.body;
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name, phone, role, is_active })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);
