import { useMemo, useState } from 'react';
import { calculateLinePrice } from '@cerotres/shared';
import type { CartSelection, MenuProduct } from '../lib/types';
import { formatMoney } from '../lib/types';
import { BrandIso } from './Brand';

type Props = {
  product: MenuProduct;
  onClose: () => void;
  onAdd: (selections: CartSelection[], lineTotalCents: number) => void;
};

type QtyMap = Record<string, number>;

export function ProductBuilderSheet({ product, onClose, onAdd }: Props) {
  const [qtyByOption, setQtyByOption] = useState<QtyMap>({});

  const selections: CartSelection[] = useMemo(() => {
    const list: CartSelection[] = [];
    for (const group of product.modifierGroups) {
      for (const option of group.options) {
        const qty = qtyByOption[option.id] ?? 0;
        if (qty > 0) {
          list.push({
            optionId: option.id,
            groupId: group.id,
            name: option.name,
            priceDelta: option.priceDelta,
            quantity: qty,
          });
        }
      }
    }
    return list;
  }, [product, qtyByOption]);

  const priced = useMemo(() => {
    try {
      return calculateLinePrice({
        productName: product.name,
        basePriceCents: product.priceCents,
        quantity: 1,
        groups: product.modifierGroups.map((g) => ({
          groupId: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          freeQuantity: g.freeQuantity,
          freeStrategy: g.freeStrategy,
        })),
        selectedOptions: selections.map((s) => ({
          optionId: s.optionId,
          groupId: s.groupId,
          name: s.name,
          priceDelta: s.priceDelta,
          quantity: s.quantity,
        })),
      });
    } catch {
      return null;
    }
  }, [product, selections]);

  function groupSelectedCount(groupId: string) {
    return selections.filter((s) => s.groupId === groupId).reduce((n, s) => n + s.quantity, 0);
  }

  function toggleOption(groupId: string, optionId: string, maxQty: number, selectionType: string) {
    setQtyByOption((prev) => {
      const current = prev[optionId] ?? 0;
      if (selectionType === 'SINGLE') {
        const next: QtyMap = { ...prev };
        for (const group of product.modifierGroups) {
          if (group.id !== groupId) continue;
          for (const opt of group.options) {
            if (opt.id !== optionId) delete next[opt.id];
          }
        }
        if (current > 0) {
          delete next[optionId];
        } else {
          next[optionId] = 1;
        }
        return next;
      }

      const nextQty = current >= maxQty ? 0 : current + 1;
      return { ...prev, [optionId]: nextQty };
    });
  }

  const selectedChips = priced?.options.filter((o) => o.priceDelta > 0 || o.name) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-surface text-cream"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-surface px-4 py-3">
          <button type="button" className="text-sm text-cream-dim" onClick={onClose}>
            Cerrar
          </button>
          <p className="font-display text-lg">{product.name}</p>
          <span className="w-12" />
        </div>

        <div className="relative h-44 overflow-hidden bg-surface-2">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-surface-2">
              <BrandIso className="h-20 w-20 opacity-90" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 p-3">
            {selectedChips.slice(0, 6).map((chip) => (
              <span
                key={`${chip.optionId}-${chip.name}`}
                className="rounded-pill bg-bg/80 px-2 py-1 text-xs backdrop-blur"
              >
                {chip.name}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-6 px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-cream-dim">{product.description}</p>
            </div>
            <p className="font-display text-3xl tabular-nums">
              {formatMoney(priced?.lineTotalCents ?? product.priceCents)}
            </p>
          </div>

          {product.modifierGroups.map((group) => {
            const selected = groupSelectedCount(group.id);
            const remaining = Math.max(0, group.freeQuantity - selected);
            return (
              <section key={group.id}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-medium">{group.name}</h3>
                  {group.freeQuantity > 0 && (
                    <p className="text-xs text-gold">
                      {remaining > 0
                        ? `${group.freeQuantity} incluidos · llevas ${selected}`
                        : `Cupo usado · extras en oro`}
                    </p>
                  )}
                </div>
                <ul className="space-y-2">
                  {group.options.map((option) => {
                    const qty = qtyByOption[option.id] ?? 0;
                    const wouldCharge =
                      group.freeQuantity > 0 &&
                      selected >= group.freeQuantity &&
                      qty === 0 &&
                      option.priceDelta > 0;
                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          onClick={() =>
                            toggleOption(
                              group.id,
                              option.id,
                              group.maxQtyPerOption,
                              group.selectionType,
                            )
                          }
                          className={`flex w-full items-center justify-between rounded-md px-3 py-3 text-left transition active:scale-[0.97] ${
                            qty > 0 ? 'bg-surface-2 ring-1 ring-cream/30' : 'bg-bg/40'
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-medium">
                              {option.name}
                              {qty > 1 ? ` ×${qty}` : ''}
                            </span>
                            {option.description && (
                              <span className="block text-xs text-cream-dim">
                                {option.description}
                              </span>
                            )}
                          </span>
                          <span
                            className={`font-display text-sm tabular-nums ${(() => {
                              const pricedOpt = priced?.options.find(
                                (o) => o.optionId === option.id,
                              );
                              if (pricedOpt && !pricedOpt.wasFree && pricedOpt.chargedLineCents > 0)
                                return 'text-gold';
                              if (wouldCharge) return 'text-gold';
                              return 'text-cream-dim';
                            })()}`}
                          >
                            {(() => {
                              const pricedOpt = priced?.options.find(
                                (o) => o.optionId === option.id,
                              );
                              if (pricedOpt) {
                                if (pricedOpt.wasFree || pricedOpt.chargedLineCents === 0) {
                                  return option.priceDelta === 0 ? 'INCLUIDO' : 'INCLUIDO';
                                }
                                return `+${formatMoney(pricedOpt.chargedLineCents)}`;
                              }
                              return option.priceDelta === 0
                                ? 'INCLUIDO'
                                : `+${formatMoney(option.priceDelta)}`;
                            })()}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div
          className="sticky bottom-0 border-t border-white/10 bg-surface p-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            disabled={!priced}
            onClick={() => {
              if (!priced) return;
              onAdd(selections, priced.lineTotalCents);
            }}
            className="w-full rounded-pill bg-brand py-3 font-medium text-cream transition active:scale-[0.97] disabled:opacity-50"
          >
            Agregar · {formatMoney(priced?.lineTotalCents ?? product.priceCents)}
          </button>
        </div>
      </div>
    </div>
  );
}
