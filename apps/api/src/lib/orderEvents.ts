import { EventEmitter } from 'node:events';

export type OrderEvent = {
  type: string;
  status?: string;
  publicCode?: string;
  orderId?: string;
  at?: string;
};

class OrderEventBus {
  private readonly bus = new EventEmitter();
  private readonly kitchen = new EventEmitter();

  constructor() {
    this.bus.setMaxListeners(200);
    this.kitchen.setMaxListeners(50);
  }

  publish(publicCode: string, event: OrderEvent) {
    const payload = { ...event, publicCode, at: new Date().toISOString() };
    this.bus.emit(publicCode, payload);
    this.kitchen.emit('kitchen', payload);
  }

  subscribe(publicCode: string, listener: (event: OrderEvent) => void) {
    this.bus.on(publicCode, listener);
    return () => this.bus.off(publicCode, listener);
  }

  subscribeKitchen(listener: (event: OrderEvent) => void) {
    this.kitchen.on('kitchen', listener);
    return () => this.kitchen.off('kitchen', listener);
  }
}

export const orderEvents = new OrderEventBus();
