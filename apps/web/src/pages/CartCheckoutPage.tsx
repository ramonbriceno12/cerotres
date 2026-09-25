import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../lib/api';
import { useCart } from '../contexts/CartContext';
import { saveLastOrderCode } from '../lib/guestOrder';
import { formatMoney } from '../lib/types';
import { BrandLogo } from '../components/Brand';
import { BottomNav } from '../components/Shell';

type Meta = {
  zones: Array<{ id: string; name: string; feeCents: number; estimatedMinutes: number | null }>;
  store: { isOpen: boolean; nextOpenLabel: string | null };
  paymentMethods: Array<{ code: string; label: string }>;
};

type PaymentDraft = {
  method: string;
  amount: string;
  reference: string;
};

function centsFromInput(value: string): number {
  const n = Number(value.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

export function CartCheckoutPage() {
  const { items, subtotalCents, updateQuantity, removeItem, clear } = useCart();
  const navigate = useNavigate();
  const metaQuery = useQuery({
    queryKey: ['public-meta'],
    queryFn: () => apiFetch<Meta>('/api/public/meta'),
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [payments, setPayments] = useState<PaymentDraft[]>([
    { method: 'PAGO_MOVIL', amount: '', reference: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const storeClosed = metaQuery.data?.store.isOpen === false;

  const zone = metaQuery.data?.zones.find((z) => z.id === zoneId);
  const deliveryFee = fulfillment === 'DELIVERY' ? (zone?.feeCents ?? 0) : 0;
  const totalCents = subtotalCents + deliveryFee;

  const paidCents = useMemo(
    () => payments.reduce((sum, p) => sum + centsFromInput(p.amount), 0),
    [payments],
  );
  const remainingCents = totalCents - paidCents;

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length !== 1) return prev;
      const only = prev[0]!;
      if (only.amount !== '' && centsFromInput(only.amount) > 0) return prev;
      return [{ ...only, amount: (totalCents / 100).toFixed(2) }];
    });
  }, [totalCents]);

  const upsell = useMemo(() => {
    const hasPapas = items.some((i) => i.productName.toLowerCase().includes('papa'));
    const hasDrink = items.some(
      (i) =>
        i.productName.toLowerCase().includes('agua') ||
        i.productName.toLowerCase().includes('refresco'),
    );
    return { suggestPapas: !hasPapas, suggestDrink: !hasDrink };
  }, [items]);

  function updatePayment(index: number, patch: Partial<PaymentDraft>) {
    setPayments((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function fillRemaining(index: number) {
    const others = payments.reduce(
      (sum, p, i) => (i === index ? sum : sum + centsFromInput(p.amount)),
      0,
    );
    const fill = Math.max(0, totalCents - others);
    updatePayment(index, { amount: (fill / 100).toFixed(2) });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const paymentLines = payments
        .map((p) => ({
          method: p.method,
          amountCents: centsFromInput(p.amount),
          reference: p.reference.trim() || undefined,
        }))
        .filter((p) => p.amountCents > 0);

      if (paymentLines.length === 0) {
        setError('Indica al menos un pago');
        setSubmitting(false);
        return;
      }
      if (paymentLines.reduce((s, p) => s + p.amountCents, 0) !== totalCents) {
        setError(
          `Los pagos deben sumar el total (${formatMoney(totalCents)}). Faltan ${formatMoney(Math.max(0, remainingCents))}.`,
        );
        setSubmitting(false);
        return;
      }

      const payload = {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        fulfillmentType: fulfillment,
        deliveryZoneId: fulfillment === 'DELIVERY' ? zoneId : undefined,
        addressLine1: fulfillment === 'DELIVERY' ? address : undefined,
        addressReference: fulfillment === 'DELIVERY' ? reference : undefined,
        notes: notes || undefined,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        payments: paymentLines,
        clientTotalCents: totalCents,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          clientLineTotalCents: item.lineTotalCents,
          options: item.selections.map((s) => ({
            optionId: s.optionId,
            quantity: s.quantity,
          })),
        })),
      };

      const result = await apiFetch<{
        order: { publicCode: string };
        trackingPath: string;
      }>('/api/public/orders', {
        method: 'POST',
        body: payload,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });

      clear();
      saveLastOrderCode(result.order.publicCode);
      navigate(result.trackingPath);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRICE_MISMATCH') {
        setError('Los precios cambiaron. Revisa tu pedido e intenta de nuevo.');
      } else if (err instanceof ApiError && err.code === 'PAYMENT_MISMATCH') {
        setError('Los montos de pago no coinciden con el total.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo crear el pedido');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const methods = metaQuery.data?.paymentMethods ?? [];

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-bg px-4 pb-28 pt-6 text-cream">
      <BrandLogo className="mb-3 h-10 max-w-[9rem]" />
      <h1 className="font-display text-3xl font-bold">Pedido</h1>

      {items.length === 0 ? (
        <div className="mt-8 rounded-md bg-surface p-4">
          <p className="text-cream-dim">Tu carrito está vacío.</p>
          <Link to="/" className="mt-3 inline-block text-brand underline">
            Ir al menú
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item.key} className="rounded-md bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {item.quantity}× {item.productName}
                    </p>
                    {item.selections.length > 0 && (
                      <p className="mt-1 text-sm text-cream-dim">
                        {item.selections.map((s) => s.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <p className="font-display tabular-nums">{formatMoney(item.lineTotalCents)}</p>
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => updateQuantity(item.key, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => updateQuantity(item.key, item.quantity + 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="ml-auto text-danger underline"
                    onClick={() => removeItem(item.key)}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {(upsell.suggestPapas || upsell.suggestDrink) && (
            <p className="mt-4 text-sm text-cream-dim">
              {upsell.suggestPapas && '¿Sumas papas? '}
              {upsell.suggestDrink && '¿Y una bebida?'}
            </p>
          )}

          <form className="mt-6 space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <input
              required
              placeholder="Nombre"
              className="w-full rounded-md border-0 bg-surface px-3 py-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              required
              type="email"
              placeholder="Email"
              className="w-full rounded-md border-0 bg-surface px-3 py-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              required
              placeholder="Teléfono"
              className="w-full rounded-md border-0 bg-surface px-3 py-3"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-md py-3 ${fulfillment === 'PICKUP' ? 'bg-brand' : 'bg-surface'}`}
                onClick={() => setFulfillment('PICKUP')}
              >
                Retiro
              </button>
              <button
                type="button"
                className={`rounded-md py-3 ${fulfillment === 'DELIVERY' ? 'bg-brand' : 'bg-surface'}`}
                onClick={() => setFulfillment('DELIVERY')}
              >
                Delivery
              </button>
            </div>

            {fulfillment === 'DELIVERY' && (
              <>
                <select
                  required
                  className="w-full rounded-md border-0 bg-surface px-3 py-3"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                >
                  <option value="">Zona de delivery</option>
                  {metaQuery.data?.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · {formatMoney(z.feeCents)}
                    </option>
                  ))}
                </select>
                <input
                  required
                  placeholder="Dirección"
                  className="w-full rounded-md border-0 bg-surface px-3 py-3"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <input
                  placeholder="Referencia"
                  className="w-full rounded-md border-0 bg-surface px-3 py-3"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </>
            )}

            {storeClosed && (
              <label className="block text-sm text-cream-dim">
                Tienda cerrada. Programa tu pedido
                <input
                  required
                  type="datetime-local"
                  className="mt-1 w-full rounded-md border-0 bg-surface px-3 py-3 text-cream"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </label>
            )}

            <div className="rounded-md bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">¿Cómo pagas?</p>
                <button
                  type="button"
                  className="text-sm text-gold underline"
                  onClick={() =>
                    setPayments((prev) => [
                      ...prev,
                      {
                        method: methods[0]?.code ?? 'PAGO_MOVIL',
                        amount: remainingCents > 0 ? (remainingCents / 100).toFixed(2) : '',
                        reference: '',
                      },
                    ])
                  }
                >
                  + Otro método
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {payments.map((row, index) => (
                  <div key={index} className="space-y-2 rounded-md bg-bg/40 p-3">
                    <div className="flex gap-2">
                      <select
                        className="min-w-0 flex-1 rounded-md border-0 bg-bg px-3 py-2"
                        value={row.method}
                        onChange={(e) => updatePayment(index, { method: e.target.value })}
                      >
                        {methods.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      {payments.length > 1 && (
                        <button
                          type="button"
                          className="text-sm text-danger underline"
                          onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        inputMode="decimal"
                        placeholder="Monto $"
                        className="min-w-0 flex-1 rounded-md border-0 bg-bg px-3 py-2 tabular-nums"
                        value={row.amount}
                        onChange={(e) => updatePayment(index, { amount: e.target.value })}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-cream/20 px-3 text-xs"
                        onClick={() => fillRemaining(index)}
                      >
                        Completar
                      </button>
                    </div>
                    {row.method !== 'CASH' && (
                      <input
                        placeholder="Referencia (opcional)"
                        className="w-full rounded-md border-0 bg-bg px-3 py-2"
                        value={row.reference}
                        onChange={(e) => updatePayment(index, { reference: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p
                className={`mt-3 text-sm ${
                  remainingCents === 0
                    ? 'text-gold'
                    : remainingCents > 0
                      ? 'text-cream-dim'
                      : 'text-danger'
                }`}
              >
                {remainingCents === 0
                  ? 'Listo: los pagos cubren el total'
                  : remainingCents > 0
                    ? `Faltan ${formatMoney(remainingCents)}`
                    : `Te pasaste por ${formatMoney(-remainingCents)}`}
              </p>
            </div>

            <textarea
              placeholder="Notas del pedido"
              className="w-full rounded-md border-0 bg-surface px-3 py-3"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="rounded-md bg-surface p-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-display tabular-nums">{formatMoney(subtotalCents)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="mt-1 flex justify-between text-cream-dim">
                  <span>Delivery</span>
                  <span className="font-display tabular-nums">{formatMoney(deliveryFee)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between text-base">
                <span>Total</span>
                <span className="font-display text-xl tabular-nums">{formatMoney(totalCents)}</span>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting || remainingCents !== 0}
              className="w-full rounded-pill bg-brand py-3 font-medium disabled:opacity-60"
            >
              {submitting ? 'Confirmando…' : 'Confirmar pedido'}
            </button>
          </form>
        </>
      )}
      <BottomNav />
    </div>
  );
}
