import { FulfillmentType, OrderStatus } from '@prisma/client';

export class InvalidTransitionError extends Error {
  code = 'INVALID_TRANSITION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

const PICKUP_FLOW: OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PREPARATION,
  OrderStatus.READY,
  OrderStatus.DELIVERED,
];

const DELIVERY_FLOW: OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PREPARATION,
  OrderStatus.READY,
  OrderStatus.ON_THE_WAY,
  OrderStatus.DELIVERED,
];

export function getStatusFlow(fulfillmentType: FulfillmentType): OrderStatus[] {
  return fulfillmentType === FulfillmentType.DELIVERY ? [...DELIVERY_FLOW] : [...PICKUP_FLOW];
}

export function getNextStatus(
  current: OrderStatus,
  fulfillmentType: FulfillmentType,
): OrderStatus | null {
  if (current === OrderStatus.CANCELLED || current === OrderStatus.DRAFT) return null;
  const flow = getStatusFlow(fulfillmentType);
  const idx = flow.indexOf(current);
  if (idx < 0 || idx >= flow.length - 1) return null;
  return flow[idx + 1]!;
}

export function getAllowedTransitions(
  current: OrderStatus,
  fulfillmentType: FulfillmentType,
): OrderStatus[] {
  if (current === OrderStatus.CANCELLED || current === OrderStatus.DELIVERED) {
    return [];
  }
  if (current === OrderStatus.DRAFT) {
    return [OrderStatus.RECEIVED, OrderStatus.CANCELLED];
  }

  const next = getNextStatus(current, fulfillmentType);
  const allowed: OrderStatus[] = [];
  if (next) allowed.push(next);
  allowed.push(OrderStatus.CANCELLED);
  return allowed;
}

export function assertTransition(input: {
  from: OrderStatus;
  to: OrderStatus;
  fulfillmentType: FulfillmentType;
  cancelReason?: string | null | undefined;
}): void {
  const { from, to, fulfillmentType, cancelReason } = input;

  if (from === to) {
    throw new InvalidTransitionError('Status is already set to that value');
  }

  const allowed = getAllowedTransitions(from, fulfillmentType);
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(
      `Cannot transition from ${from} to ${to} for ${fulfillmentType}`,
    );
  }

  if (to === OrderStatus.CANCELLED) {
    const reason = cancelReason?.trim();
    if (!reason) {
      throw new InvalidTransitionError('Cancel reason is required');
    }
  }
}
