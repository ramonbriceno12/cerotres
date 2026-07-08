import { supabaseAdmin } from "../config/supabaseClient.js";
import { notifyOrderEvent } from "./notifications.js";
import { ApiError } from "../middleware/errorHandler.js";

const NOTIFICATION_BY_STATUS = {
  confirmed: "order_confirmed",
  in_kitchen: "order_in_kitchen",
  ready: "order_ready",
  out_for_delivery: "order_out_for_delivery",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

const TIMESTAMP_COLUMN_BY_STATUS = {
  confirmed: "confirmed_at",
  ready: "ready_at",
  delivered: "delivered_at",
  cancelled: "cancelled_at",
};

export const VALID_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_kitchen", "cancelled"],
  in_kitchen: ["ready", "cancelled"],
  ready: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const STOCK_DEDUCTED_AT = new Set(["confirmed", "in_kitchen", "ready", "out_for_delivery", "delivered"]);

async function deductStockForOrder(order, userId) {
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("*, product:products(track_inventory), options:order_item_options(*)")
    .eq("order_id", order.id);

  for (const item of items || []) {
    if (item.product?.track_inventory) {
      const { data: recipe } = await supabaseAdmin
        .from("recipes")
        .select("*, ingredients:recipe_ingredients(*)")
        .eq("product_id", item.product_id)
        .maybeSingle();

      for (const ri of recipe?.ingredients || []) {
        const quantityNeeded = (Number(ri.quantity) * Number(item.quantity)) / Number(recipe.yield_quantity || 1);
        await supabaseAdmin.from("inventory_movements").insert({
          ingredient_id: ri.ingredient_id,
          movement_type: "sale_out",
          quantity: quantityNeeded,
          reference_type: "order",
          reference_id: order.id,
          notes: `Venta ${order.order_number} (receta)`,
          created_by: userId,
        });
      }
    }

    // Extras/opciones that themselves consume an ingredient (e.g. "Tocineta").
    for (const opt of item.options || []) {
      if (!opt.option_item_id) continue;
      const { data: optionItem } = await supabaseAdmin
        .from("option_items")
        .select("ingredient_id, ingredient_quantity")
        .eq("id", opt.option_item_id)
        .maybeSingle();
      if (!optionItem?.ingredient_id || !optionItem.ingredient_quantity) continue;

      await supabaseAdmin.from("inventory_movements").insert({
        ingredient_id: optionItem.ingredient_id,
        movement_type: "sale_out",
        quantity: Number(optionItem.ingredient_quantity) * Number(item.quantity),
        reference_type: "order",
        reference_id: order.id,
        notes: `Venta ${order.order_number} (extra: ${opt.name})`,
        created_by: userId,
      });
    }
  }
}

async function restockForOrder(order, userId) {
  const { data: movements } = await supabaseAdmin
    .from("inventory_movements")
    .select("*")
    .eq("reference_type", "order")
    .eq("reference_id", order.id)
    .eq("movement_type", "sale_out");

  for (const m of movements || []) {
    await supabaseAdmin.from("inventory_movements").insert({
      ingredient_id: m.ingredient_id,
      movement_type: "adjustment_in",
      quantity: m.quantity,
      reference_type: "order_cancelled",
      reference_id: order.id,
      notes: `Reverso por cancelacion ${order.order_number}`,
      created_by: userId,
    });
  }
}

/**
 * Moves an order to a new status, enforcing the allowed state machine,
 * deducting/restoring ingredient stock, recording history and notifying
 * the customer by email. Returns the updated order row.
 */
export async function transitionOrderStatus(orderId, newStatus, { userId, notes, cancelReason } = {}) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*, customer:customers(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!order) throw new ApiError(404, "Pedido no encontrado");

  const allowed = VALID_TRANSITIONS[order.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(400, `No se puede pasar de '${order.status}' a '${newStatus}'`);
  }

  const patch = { status: newStatus };
  if (TIMESTAMP_COLUMN_BY_STATUS[newStatus]) patch[TIMESTAMP_COLUMN_BY_STATUS[newStatus]] = new Date().toISOString();
  if (newStatus === "cancelled" && cancelReason) patch.cancel_reason = cancelReason;

  if (newStatus === "confirmed") {
    await deductStockForOrder(order, userId);
  }
  if (newStatus === "cancelled" && STOCK_DEDUCTED_AT.has(order.status) && order.status !== "pending") {
    await restockForOrder(order, userId);
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("*, customer:customers(*)")
    .single();
  if (updateError) throw new ApiError(400, updateError.message);

  await supabaseAdmin.from("order_status_history").insert({
    order_id: orderId,
    status: newStatus,
    changed_by: userId || null,
    notes,
  });

  const notificationType = NOTIFICATION_BY_STATUS[newStatus];
  if (notificationType) {
    notifyOrderEvent(notificationType, updated, updated.customer).catch((err) => console.error("notify error", err));
  }

  return updated;
}
