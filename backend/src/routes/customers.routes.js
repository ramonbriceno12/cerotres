import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

export const customersRouter = Router();
customersRouter.use(requireAuth, requireRole("admin", "manager", "delivery"));

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("customers").select("*, addresses:customer_addresses(*)").order("created_at", { ascending: false });
    if (req.query.search) {
      query = query.or(
        `full_name.ilike.%${req.query.search}%,phone.ilike.%${req.query.search}%,email.ilike.%${req.query.search}%,cedula.ilike.%${req.query.search}%`
      );
    }
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

customersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("*, addresses:customer_addresses(*)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, "No encontrado");

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, status, total, placed_at")
      .eq("customer_id", req.params.id)
      .order("placed_at", { ascending: false })
      .limit(20);

    res.json({ data: { ...data, recent_orders: orders || [] } });
  })
);

customersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { addresses, ...body } = req.body;
    const { data, error } = await supabaseAdmin.from("customers").insert(body).select("*").single();
    if (error) throw new ApiError(400, error.message);

    if (Array.isArray(addresses) && addresses.length) {
      await supabaseAdmin.from("customer_addresses").insert(addresses.map((a) => ({ ...a, customer_id: data.id })));
    }
    res.status(201).json({ data });
  })
);

customersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { addresses, ...body } = req.body;
    const { data, error } = await supabaseAdmin.from("customers").update(body).eq("id", req.params.id).select("*").single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

customersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("customers").update({ is_active: false }).eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deactivated: true } });
  })
);

// --- addresses ---
customersRouter.post(
  "/:id/addresses",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("customer_addresses")
      .insert({ ...req.body, customer_id: req.params.id })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.status(201).json({ data });
  })
);

customersRouter.patch(
  "/:id/addresses/:addressId",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("customer_addresses")
      .update(req.body)
      .eq("id", req.params.addressId)
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

customersRouter.delete(
  "/:id/addresses/:addressId",
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("customer_addresses").delete().eq("id", req.params.addressId);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deleted: true } });
  })
);
