import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FulfillmentType, PaymentMethod } from '@prisma/client';

/** 58mm thermal roll ≈ 164 points usable width at 72dpi (58mm ≈ 164.4pt). */
const WIDTH = 164;
const MARGIN = 8;
const CONTENT = WIDTH - MARGIN * 2;

export type TicketOrder = {
  publicCode: string;
  placedAt: Date | null;
  fulfillmentType: FulfillmentType;
  customerName: string;
  customerPhone: string | null;
  notes: string | null;
  channelName: string;
  deliveryZoneName: string | null;
  addressLine1: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  exchangeRateBolivarsPerUsd: number | null;
  items: Array<{
    quantity: number;
    productName: string;
    notes: string | null;
    unitPriceCents: number;
    lineTotalCents: number;
    options: Array<{ optionName: string; quantity: number; wasFree: boolean }>;
  }>;
  payments: Array<{ method: PaymentMethod; amountCents: number; reference: string | null }>;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function moneyBs(usdCents: number, rate: number | null) {
  if (rate == null || !(rate > 0)) return null;
  const bs = Math.round(usdCents * rate) / 100;
  return `Bs. ${bs.toFixed(2)}`;
}

function resolveLogoPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../../assets/img/logo.png'),
    path.resolve(process.cwd(), '../../assets/img/logo.png'),
    path.resolve(process.cwd(), 'assets/img/logo.png'),
    path.resolve(here, '../../../admin/public/assets/img/logo.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function drawWrapped(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  opts: { bold?: boolean; size?: number; align?: 'left' | 'center' } = {},
) {
  doc
    .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opts.size ?? 8)
    .text(text, MARGIN, doc.y, { width: CONTENT, align: opts.align ?? 'left' });
}

function hr(doc: InstanceType<typeof PDFDocument>) {
  const y = doc.y + 2;
  doc
    .moveTo(MARGIN, y)
    .lineTo(WIDTH - MARGIN, y)
    .dash(2, { space: 2 })
    .stroke()
    .undash();
  doc.moveDown(0.4);
}

function formatWhen(date: Date | null) {
  if (!date) return '—';
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function buildPdf(draw: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [WIDTH, 800],
    margin: MARGIN,
    autoFirstPage: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  draw(doc);
  doc.end();
  return done;
}

/** Kitchen ticket: what to cook — no prices. */
export async function buildKitchenTicketPdf(order: TicketOrder): Promise<Buffer> {
  return buildPdf((doc) => {
    drawWrapped(doc, 'COCINA', { bold: true, size: 11, align: 'center' });
    drawWrapped(doc, order.publicCode, { bold: true, size: 14, align: 'center' });
    drawWrapped(doc, formatWhen(order.placedAt), { size: 7, align: 'center' });
    drawWrapped(doc, `${order.fulfillmentType} · ${order.channelName}`, {
      size: 8,
      align: 'center',
    });
    hr(doc);
    drawWrapped(doc, order.customerName, { bold: true, size: 9 });
    if (order.customerPhone) drawWrapped(doc, order.customerPhone, { size: 8 });
    if (order.fulfillmentType === 'DELIVERY') {
      if (order.deliveryZoneName) drawWrapped(doc, `Zona: ${order.deliveryZoneName}`, { size: 8 });
      if (order.addressLine1) drawWrapped(doc, order.addressLine1, { size: 8 });
    }
    hr(doc);
    for (const item of order.items) {
      drawWrapped(doc, `${item.quantity}x ${item.productName}`, { bold: true, size: 9 });
      for (const opt of item.options) {
        const qty = opt.quantity > 1 ? ` x${opt.quantity}` : '';
        drawWrapped(doc, `  + ${opt.optionName}${qty}`, { size: 8 });
      }
      if (item.notes) drawWrapped(doc, `  Nota: ${item.notes}`, { size: 7 });
      doc.moveDown(0.2);
    }
    if (order.notes) {
      hr(doc);
      drawWrapped(doc, `Nota pedido: ${order.notes}`, { size: 8 });
    }
    doc.moveDown(1);
    drawWrapped(doc, '***', { align: 'center', size: 8 });
  });
}

/** Customer receipt with brand logo and prices. */
export async function buildCustomerReceiptPdf(order: TicketOrder): Promise<Buffer> {
  return buildPdf((doc) => {
    const logo = resolveLogoPath();
    if (logo) {
      try {
        doc.image(logo, (WIDTH - 48) / 2, doc.y, { width: 48 });
        doc.moveDown(3.2);
      } catch {
        // skip broken image
      }
    }
    drawWrapped(doc, 'CERO TRES', { bold: true, size: 11, align: 'center' });
    drawWrapped(doc, order.publicCode, { bold: true, size: 12, align: 'center' });
    drawWrapped(doc, formatWhen(order.placedAt), { size: 7, align: 'center' });
    hr(doc);
    drawWrapped(doc, order.customerName, { bold: true, size: 8 });
    if (order.customerPhone) drawWrapped(doc, order.customerPhone, { size: 7 });
    drawWrapped(doc, `${order.fulfillmentType} · ${order.channelName}`, { size: 7 });
    hr(doc);
    for (const item of order.items) {
      drawWrapped(doc, `${item.quantity}x ${item.productName}`, { bold: true, size: 8 });
      drawWrapped(doc, money(item.lineTotalCents), { size: 8 });
      const bsLine = moneyBs(item.lineTotalCents, order.exchangeRateBolivarsPerUsd);
      if (bsLine) drawWrapped(doc, bsLine, { size: 7 });
      for (const opt of item.options) {
        const free = opt.wasFree ? ' (incl.)' : '';
        drawWrapped(doc, `  + ${opt.optionName}${free}`, { size: 7 });
      }
      doc.moveDown(0.15);
    }
    hr(doc);
    drawWrapped(doc, `Subtotal ${money(order.subtotalCents)}`, { size: 8 });
    if (order.deliveryFeeCents > 0) {
      drawWrapped(doc, `Delivery ${money(order.deliveryFeeCents)}`, { size: 8 });
    }
    drawWrapped(doc, `TOTAL ${money(order.totalCents)}`, { bold: true, size: 10 });
    const bsTotal = moneyBs(order.totalCents, order.exchangeRateBolivarsPerUsd);
    if (bsTotal) {
      drawWrapped(doc, bsTotal, { bold: true, size: 9 });
      if (order.exchangeRateBolivarsPerUsd) {
        drawWrapped(doc, `Tasa ${order.exchangeRateBolivarsPerUsd.toFixed(2)} Bs/$`, {
          size: 6,
        });
      }
    }
    if (order.payments.length) {
      hr(doc);
      for (const p of order.payments) {
        const ref = p.reference ? ` · ${p.reference}` : '';
        drawWrapped(doc, `${p.method} ${money(p.amountCents)}${ref}`, { size: 7 });
      }
    }
    doc.moveDown(0.8);
    drawWrapped(doc, 'Gracias por tu pedido', { align: 'center', size: 8 });
    drawWrapped(doc, '***', { align: 'center', size: 8 });
  });
}
