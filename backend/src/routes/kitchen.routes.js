import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { transitionOrderStatus } from "../utils/orderStatus.js";

// Kitchen Display System: the board of orders currently being prepared,
// plus per-item prep status so the kitchen can track what's cooking vs ready.
export const kitchenRouter = Router();
kitchenRouter.use(requireAuth, requireRole("admin", "manager", "kitchen"));

kitchenRouter.get(
  "/queue",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, order_type, notes, placed_at, confirmed_at, estimated_ready_at, customer:customers(full_name, phone), items:order_items(id, quantity, notes, kitchen_status, product:products(id, name), options:order_item_options(name))"
      )
      .in("status", ["confirmed", "in_kitchen"])
      .order("placed_at", { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

kitchenRouter.patch(
  "/items/:itemId",
  asyncHandler(async (req, res) => {
    const { kitchen_status } = req.body;
    if (!["pending", "preparing", "ready"].includes(kitchen_status)) throw new ApiError(400, "kitchen_status invalido");

    const { data: item, error } = await supabaseAdmin
      .from("order_items")
      .update({ kitchen_status })
      .eq("id", req.params.itemId)
      .select("*, order:orders(id, status)")
      .single();
    if (error) throw new ApiError(400, error.message);

    // Auto-advance the order: confirmed -> in_kitchen as soon as prep starts,
    // and -> ready once every item in it is ready.
    const orderId = item.order.id;
    if (item.order.status === "confirmed" && kitchen_status !== "pending") {
      await transitionOrderStatus(orderId, "in_kitchen", { userId: req.user.id });
    }

    const { data: siblings } = await supabaseAdmin.from("order_items").select("kitchen_status").eq("order_id", orderId);
    const allReady = siblings.every((s) => s.kitchen_status === "ready");
    if (allReady && item.order.status !== "ready") {
      await transitionOrderStatus(orderId, "ready", { userId: req.user.id });
    }

    res.json({ data: item });
  })
);
