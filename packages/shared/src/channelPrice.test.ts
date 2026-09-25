import { describe, expect, it } from 'vitest';
import { resolveChannelPriceCents } from './channelPrice';

describe('resolveChannelPriceCents', () => {
  it('uses the catalog price when there is no override', () => {
    expect(resolveChannelPriceCents(650, null)).toBe(650);
    expect(resolveChannelPriceCents(650, undefined)).toBe(650);
  });

  it('uses the channel override, including zero', () => {
    expect(resolveChannelPriceCents(650, 890)).toBe(890);
    expect(resolveChannelPriceCents(650, 0)).toBe(0);
  });
});
