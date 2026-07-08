import PDFDocument from "pdfkit";

const WIDTH = 227; // ~80mm thermal roll

function newDoc() {
  return new PDFDocument({ size: [WIDTH, 900], margin: 10, autoFirstPage: true });
}

function divider(doc) {
  doc.moveDown(0.3);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .dash(1, { space: 1 })
    .stroke();
  doc.undash();
  doc.moveDown(0.3);
}

function row(doc, left, right, opts = {}) {
  const y = doc.y;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.fontSize(opts.size || 9).font(opts.bold ? "Helvetica-Bold" : "Helvetica");
  doc.text(left, doc.page.margins.left, y, { width: w * 0.6, continued: false });
  doc.text(right, doc.page.margins.left + w * 0.6, y, { width: w * 0.4, align: "right" });
}

function header(doc, title) {
  doc.font("Helvetica-Bold").fontSize(14).text("03/cerotres", { align: "center" });
  doc.font("Helvetica").fontSize(8).text("@03__cerotres", { align: "center" });
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(11).text(title, { align: "center" });
  divider(doc);
}

/** Customer-facing receipt: full prices, totals, payment info. */
export function buildCustomerReceipt(order) {
  const doc = newDoc();
  header(doc, "RECIBO DE PEDIDO");

  doc.fontSize(9).font("Helvetica");
  doc.text(`Pedido: ${order.order_number}`);
  doc.text(`Fecha: ${new Date(order.placed_at).toLocaleString("es-VE")}`);
  doc.text(`Cliente: ${order.customer?.full_name || ""}`);
  doc.text(`Telefono: ${order.customer?.phone || ""}`);
  if (order.customer?.cedula) doc.text(`Cedula: ${order.customer.cedula}`);
  doc.text(`Tipo: ${order.order_type === "delivery" ? "Delivery" : "Retiro en tienda"}`);
  if (order.delivery_address) doc.text(`Direccion: ${order.delivery_address.address_line}`);
  divider(doc);

  for (const item of order.items || []) {
    row(doc, `${item.quantity}x ${item.product?.name || "Producto"}`, `$${Number(item.subtotal).toFixed(2)}`, { bold: true });
    for (const opt of item.options || []) {
      doc.fontSize(8).font("Helvetica").text(`   + ${opt.name}`, { continued: false });
    }
    if (item.notes) doc.fontSize(8).font("Helvetica-Oblique").text(`   Nota: ${item.notes}`);
    doc.moveDown(0.2);
  }

  divider(doc);
  row(doc, "Subtotal", `$${Number(order.subtotal).toFixed(2)}`);
  if (Number(order.discount) > 0) row(doc, "Descuento", `-$${Number(order.discount).toFixed(2)}`);
  if (Number(order.delivery_fee) > 0) row(doc, "Delivery", `$${Number(order.delivery_fee).toFixed(2)}`);
  row(doc, "TOTAL", `$${Number(order.total).toFixed(2)}`, { bold: true, size: 11 });
  if (order.currency !== "USD") {
    row(doc, `Total (${order.currency})`, `${Number(order.total_currency).toFixed(2)}`, { bold: true });
    doc.fontSize(7).text(`Tasa: ${order.exchange_rate} ${order.currency}/USD`);
  }
  divider(doc);

  if (order.payments?.length) {
    doc.font("Helvetica-Bold").fontSize(9).text("Pagos");
    for (const p of order.payments) {
      row(doc, p.method, `${Number(p.amount_currency).toFixed(2)} ${p.currency}`);
    }
    divider(doc);
  }

  if (order.notes) {
    doc.fontSize(8).font("Helvetica-Oblique").text(`Observaciones: ${order.notes}`);
    divider(doc);
  }

  doc.fontSize(8).font("Helvetica").text("Gracias por tu compra!", { align: "center" });
  doc.end();
  return doc;
}

/** Kitchen ticket: no prices, just what to make. */
export function buildKitchenTicket(order) {
  const doc = newDoc();
  header(doc, "COMANDA DE COCINA");

  doc.fontSize(10).font("Helvetica-Bold").text(`Pedido: ${order.order_number}`);
  doc.fontSize(9).font("Helvetica").text(`Hora: ${new Date(order.placed_at).toLocaleTimeString("es-VE")}`);
  doc.text(`Tipo: ${order.order_type === "delivery" ? "Delivery" : "Retiro"}`);
  divider(doc);

  for (const item of order.items || []) {
    doc.fontSize(11).font("Helvetica-Bold").text(`${item.quantity}x ${item.product?.name || "Producto"}`);
    for (const opt of item.options || []) {
      doc.fontSize(9).font("Helvetica").text(`   + ${opt.name}`);
    }
    if (item.notes) doc.fontSize(9).font("Helvetica-Oblique").text(`   Nota: ${item.notes}`);
    doc.moveDown(0.3);
  }

  if (order.notes) {
    divider(doc);
    doc.fontSize(9).font("Helvetica-Oblique").text(`Observaciones generales: ${order.notes}`);
  }

  doc.end();
  return doc;
}
