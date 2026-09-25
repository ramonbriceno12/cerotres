import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import {
  buildCustomerReceiptPdf,
  buildKitchenTicketPdf,
  type TicketOrder,
} from './thermalTickets.js';

async function loadTicketOrder(orderId: string): Promise<TicketOrder> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      channel: true,
      deliveryZone: true,
      items: { include: { options: true }, orderBy: { createdAt: 'asc' } },
      payments: true,
      address: true,
    },
  });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');

  return {
    publicCode: order.publicCode,
    placedAt: order.placedAt,
    fulfillmentType: order.fulfillmentType,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    notes: order.notes,
    channelName: order.channel.name,
    deliveryZoneName: order.deliveryZone?.name ?? null,
    addressLine1: order.address?.line1 ?? null,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    exchangeRateBolivarsPerUsd: order.exchangeRateBolivarsPerUsd
      ? Number(order.exchangeRateBolivarsPerUsd.toString())
      : null,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      productName: item.productName,
      notes: item.notes,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      options: item.options.map((opt) => ({
        optionName: opt.optionName,
        quantity: opt.quantity,
        wasFree: opt.wasFree,
      })),
    })),
    payments: order.payments.map((p) => ({
      method: p.method,
      amountCents: p.amountCents,
      reference: p.reference,
    })),
  };
}

export async function sendKitchenTicketPdf(orderId: string, res: Response) {
  const order = await loadTicketOrder(orderId);
  const pdf = await buildKitchenTicketPdf(order);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${order.publicCode}-comanda.pdf"`);
  res.send(pdf);
}

export async function sendCustomerReceiptPdf(orderId: string, res: Response) {
  const order = await loadTicketOrder(orderId);
  const pdf = await buildCustomerReceiptPdf(order);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${order.publicCode}-recibo.pdf"`);
  res.send(pdf);
}
