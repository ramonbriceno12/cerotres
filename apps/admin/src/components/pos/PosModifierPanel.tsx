import { useMemo, useState } from 'react';
import { calculateLinePrice } from '@cerotres/shared';
import type { CatalogProduct } from '../../lib/adminOrderCatalog';
import { formatMoney } from '../../lib/orders';

type PosModifierPanelProps = {
  product: CatalogProduct;
  onConfirm: (qtyByOption: Record<string, number>) => void;
  onClose: () => void;
};

export function PosModifierPanel({ product, onConfirm, onClose }: PosModifierPanelProps) {
  const [qtyByOption, setQtyByOption] = useState<Record<string, number>>({});

  const previewCents = useMemo(() => {
    const selections = Object.entries(qtyByOption)
      .filter(([, qty]) => qty > 0)
      .map(([optionId, quantity]) => {
        const group = product.modifierGroups.find((g) => g.options.some((o) => o.id === optionId))!;
        const option = group.options.find((o) => o.id === optionId)!;
        return {
          optionId,
          groupId: group.id,
          name: option.name,
          priceDelta: option.priceDelta,
          quantity,
        };
      });
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
      selectedOptions: selections,
    }).lineTotalCents;
  }, [product, qtyByOption]);

  function toggleOption(group: CatalogProduct['modifierGroups'][number], optionId: string) {
    setQtyByOption((prev) => {
      if (group.selectionType === 'SINGLE') {
        const next: Record<string, number> = { ...prev };
        for (const opt of group.options) delete next[opt.id];
        if (!prev[optionId]) next[optionId] = 1;
        return next;
      }
      const current = prev[optionId] ?? 0;
      return {
        ...prev,
        [optionId]: current >= group.maxQtyPerOption ? 0 : current + 1,
      };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/60 p-4 sm:items-center">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-modifier-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            <p id="pos-modifier-title" className="text-lg font-semibold text-zinc-900">
              {product.name}
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">Base {formatMoney(product.priceCents)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
          >
            Cancelar
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {product.modifierGroups.map((group) => (
            <section key={group.id} className="mb-5 last:mb-0">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">{group.name}</h3>
                {group.freeQuantity > 0 && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {group.freeQuantity} incluido{group.freeQuantity > 1 ? 's' : ''}
                  </span>
                )}
                {group.minSelect > 0 && (
                  <span className="text-[11px] text-zinc-400">Mín. {group.minSelect}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const qty = qtyByOption[option.id] ?? 0;
                  const selected = qty > 0;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleOption(group, option.id)}
                      className={`inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white'
                      }`}
                    >
                      <span className="font-medium">{option.name}</span>
                      {option.priceDelta > 0 && (
                        <span className={selected ? 'text-zinc-300' : 'text-zinc-500'}>
                          +{formatMoney(option.priceDelta)}
                        </span>
                      )}
                      {qty > 1 && (
                        <span className="rounded bg-white/20 px-1.5 text-xs font-semibold">
                          ×{qty}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="flex items-center gap-3 border-t border-zinc-100 bg-zinc-50 px-5 py-4">
          <p className="flex-1 text-lg font-semibold tabular-nums text-zinc-900">
            {formatMoney(previewCents)}
          </p>
          <button
            type="button"
            onClick={() => onConfirm(qtyByOption)}
            className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Agregar al pedido
          </button>
        </footer>
      </div>
    </div>
  );
}
