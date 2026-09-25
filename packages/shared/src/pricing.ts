export type FreeStrategy = 'HIGHEST_PRICE_FIRST' | 'SELECTION_ORDER';

export type PricingGroup = {
  groupId: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  freeQuantity: number;
  freeStrategy: FreeStrategy;
};

export type SelectedOption = {
  optionId: string;
  groupId: string;
  name: string;
  priceDelta: number;
  quantity: number;
};

export type PricingInput = {
  productName: string;
  basePriceCents: number;
  quantity: number;
  groups: PricingGroup[];
  selectedOptions: SelectedOption[];
};

export type PricedOption = SelectedOption & {
  chargedUnitCents: number;
  chargedLineCents: number;
  wasFree: boolean;
};

export type PricingResult = {
  basePriceCents: number;
  modifiersTotalCents: number;
  unitTotalCents: number;
  lineTotalCents: number;
  options: PricedOption[];
};

export type PricingErrorCode =
  'MODIFIER_MIN_NOT_MET' | 'MODIFIER_MAX_EXCEEDED' | 'INVALID_QUANTITY' | 'UNKNOWN_GROUP';

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  readonly details: unknown;

  constructor(code: PricingErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
    this.details = details;
  }
}

function expandSelections(options: SelectedOption[]): SelectedOption[] {
  const expanded: SelectedOption[] = [];
  for (const option of options) {
    if (option.quantity < 1) {
      throw new PricingError('INVALID_QUANTITY', `Invalid quantity for ${option.name}`);
    }
    for (let i = 0; i < option.quantity; i += 1) {
      expanded.push({ ...option, quantity: 1 });
    }
  }
  return expanded;
}

function chargeGroup(
  group: PricingGroup,
  selections: SelectedOption[],
): { charged: PricedOption[]; modifiersTotalCents: number } {
  const count = selections.length;
  if (count < group.minSelect) {
    throw new PricingError(
      'MODIFIER_MIN_NOT_MET',
      `Group "${group.name}" requires at least ${group.minSelect} selection(s)`,
      { groupId: group.groupId, minSelect: group.minSelect, selected: count },
    );
  }
  if (group.maxSelect !== null && count > group.maxSelect) {
    throw new PricingError(
      'MODIFIER_MAX_EXCEEDED',
      `Group "${group.name}" allows at most ${group.maxSelect} selection(s)`,
      { groupId: group.groupId, maxSelect: group.maxSelect, selected: count },
    );
  }

  // Zero-delta options are always free and do not consume free quota.
  const freeAlways = selections.filter((s) => s.priceDelta === 0);
  const billable = selections.filter((s) => s.priceDelta !== 0);

  const ordered =
    group.freeStrategy === 'SELECTION_ORDER'
      ? [...billable]
      : [...billable].sort((a, b) => b.priceDelta - a.priceDelta);

  let freeRemaining = group.freeQuantity;
  const charged: PricedOption[] = [];

  for (const option of freeAlways) {
    charged.push({
      ...option,
      chargedUnitCents: 0,
      chargedLineCents: 0,
      wasFree: true,
    });
  }

  for (const option of ordered) {
    const isFree = freeRemaining > 0;
    if (isFree) freeRemaining -= 1;
    const chargedUnitCents = isFree ? 0 : option.priceDelta;
    charged.push({
      ...option,
      chargedUnitCents,
      chargedLineCents: chargedUnitCents,
      wasFree: isFree,
    });
  }

  const modifiersTotalCents = charged.reduce((sum, item) => sum + item.chargedLineCents, 0);
  return { charged, modifiersTotalCents };
}

/**
 * Line price in integer cents.
 * unit = base + charged modifiers; line = unit * quantity.
 * Rounding is not needed mid-flight because all inputs are already integers.
 */
export function calculateLinePrice(input: PricingInput): PricingResult {
  if (input.quantity < 1) {
    throw new PricingError('INVALID_QUANTITY', 'Line quantity must be at least 1');
  }

  const groupsById = new Map(input.groups.map((g) => [g.groupId, g]));
  const expanded = expandSelections(input.selectedOptions);
  const byGroup = new Map<string, SelectedOption[]>();

  for (const option of expanded) {
    if (!groupsById.has(option.groupId)) {
      throw new PricingError('UNKNOWN_GROUP', `Unknown modifier group ${option.groupId}`);
    }
    const list = byGroup.get(option.groupId) ?? [];
    list.push(option);
    byGroup.set(option.groupId, list);
  }

  let modifiersTotalCents = 0;
  const pricedOptions: PricedOption[] = [];

  for (const group of input.groups) {
    const selections = byGroup.get(group.groupId) ?? [];
    const { charged, modifiersTotalCents: groupTotal } = chargeGroup(group, selections);
    modifiersTotalCents += groupTotal;
    pricedOptions.push(...charged);
  }

  const unitTotalCents = input.basePriceCents + modifiersTotalCents;
  const lineTotalCents = unitTotalCents * input.quantity;

  return {
    basePriceCents: input.basePriceCents,
    modifiersTotalCents,
    unitTotalCents,
    lineTotalCents,
    options: pricedOptions,
  };
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
