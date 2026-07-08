import { supabaseAdmin } from "../config/supabaseClient.js";
import { sendEmail } from "./resend.js";

const TEMPLATES = {
  order_confirmed: (order) => ({
    subject: `Confirmamos tu pedido ${order.order_number} - 03/cerotres`,
    html: `<p>Hola ${order.customer_name},</p><p>Tu pedido <strong>${order.order_number}</strong> fue confirmado y ya lo estamos preparando.</p><p>Total: $${order.total}</p><p>Gracias por tu compra en 03/cerotres.</p>`,
  }),
  order_in_kitchen: (order) => ({
    subject: `Tu pedido ${order.order_number} esta en cocina`,
    html: `<p>Hola ${order.customer_name},</p><p>Estamos preparando tu pedido <strong>${order.order_number}</strong>.</p>`,
  }),
  order_ready: (order) => ({
    subject: `Tu pedido ${order.order_number} esta listo`,
    html: `<p>Hola ${order.customer_name},</p><p>Tu pedido <strong>${order.order_number}</strong> esta listo${
      order.order_type === "delivery" ? " y saldra en camino." : " para retirar."
    }</p>`,
  }),
  order_out_for_delivery: (order) => ({
    subject: `Tu pedido ${order.order_number} va en camino`,
    html: `<p>Hola ${order.customer_name},</p><p>Tu pedido <strong>${order.order_number}</strong> va en camino a tu direccion.</p>`,
  }),
  order_delivered: (order) => ({
    subject: `Tu pedido ${order.order_number} fue entregado`,
    html: `<p>Hola ${order.customer_name},</p><p>Tu pedido <strong>${order.order_number}</strong> fue entregado. Gracias por elegir 03/cerotres!</p>`,
  }),
  order_cancelled: (order) => ({
    subject: `Tu pedido ${order.order_number} fue cancelado`,
    html: `<p>Hola ${order.customer_name},</p><p>Tu pedido <strong>${order.order_number}</strong> fue cancelado.${
      order.cancel_reason ? ` Motivo: ${order.cancel_reason}` : ""
    }</p>`,
  }),
};

/**
 * Sends (best-effort) a transactional email for an order event and always
 * writes a row to notifications_log, whether the send succeeded or not.
 */
export async function notifyOrderEvent(notificationType, order, customer) {
  if (!customer?.email) return;
  const template = TEMPLATES[notificationType];
  if (!template) return;

  const { subject, html } = template({ ...order, customer_name: customer.full_name });
  const result = await sendEmail({ to: customer.email, subject, html });

  await supabaseAdmin.from("notifications_log").insert({
    customer_id: customer.id,
    order_id: order.id,
    channel: "email",
    notification_type: notificationType,
    recipient: customer.email,
    subject,
    status: result.sent ? "sent" : "failed",
    error_message: result.error || null,
    sent_at: result.sent ? new Date().toISOString() : null,
  });
}
