import { describe, expect, it } from 'vitest';
import { FulfillmentType, OrderStatus } from '@prisma/client';
import {
  assertTransition,
  getAllowedTransitions,
  getNextStatus,
  InvalidTransitionError,
} from '../services/orderStatusMachine.js';

describe('orderStatusMachine', () => {
  it('advances pickup one step at a time', () => {
    expect(getNextStatus(OrderStatus.RECEIVED, FulfillmentType.PICKUP)).toBe(OrderStatus.CONFIRMED);
    expect(getNextStatus(OrderStatus.READY, FulfillmentType.PICKUP)).toBe(OrderStatus.DELIVERED);
    expect(getNextStatus(OrderStatus.READY, FulfillmentType.PICKUP)).not.toBe(
      OrderStatus.ON_THE_WAY,
    );
  });

  it('includes ON_THE_WAY only for delivery', () => {
    expect(getNextStatus(OrderStatus.READY, FulfillmentType.DELIVERY)).toBe(OrderStatus.ON_THE_WAY);
    expect(getAllowedTransitions(OrderStatus.READY, FulfillmentType.PICKUP)).toEqual([
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ]);
  });

  it('rejects skipping RECEIVED to DELIVERED', () => {
    expect(() =>
      assertTransition({
        from: OrderStatus.RECEIVED,
        to: OrderStatus.DELIVERED,
        fulfillmentType: FulfillmentType.PICKUP,
      }),
    ).toThrow(InvalidTransitionError);
  });

  it('requires cancel reason', () => {
    expect(() =>
      assertTransition({
        from: OrderStatus.CONFIRMED,
        to: OrderStatus.CANCELLED,
        fulfillmentType: FulfillmentType.PICKUP,
        cancelReason: '  ',
      }),
    ).toThrow(/Cancel reason/);
  });

  it('allows cancel with reason from mid-flow', () => {
    expect(() =>
      assertTransition({
        from: OrderStatus.IN_PREPARATION,
        to: OrderStatus.CANCELLED,
        fulfillmentType: FulfillmentType.DELIVERY,
        cancelReason: 'Cliente canceló',
      }),
    ).not.toThrow();
  });

  it('blocks transitions from terminal states', () => {
    expect(getAllowedTransitions(OrderStatus.DELIVERED, FulfillmentType.PICKUP)).toEqual([]);
    expect(getAllowedTransitions(OrderStatus.CANCELLED, FulfillmentType.DELIVERY)).toEqual([]);
  });
});
