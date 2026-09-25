import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { orderStatusLabel, saveLastOrderCode } from '../lib/guestOrder';
import { formatMoney } from '../lib/types';
import { BrandLogo } from '../components/Brand';
import { BottomNav } from '../components/Shell';

type GuestMe = {
  orders: Array<{
    id: string;
    publicCode: string;
    status: string;
    totalCents: number;
    createdAt: string;
  }>;
  customer: { name: string; email: string | null } | null;
};

export function AccountPage() {
  const meQuery = useQuery({
    queryKey: ['guest-me'],
    queryFn: () => apiFetch<GuestMe>('/api/public/guest/me'),
    retry: false,
  });

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-bg px-4 pb-28 pt-6 text-cream">
      <BrandLogo className="mb-3 h-10 max-w-[9rem]" />
      <h1 className="font-display text-3xl font-bold">Cuenta</h1>
      <p className="mt-1 text-sm text-cream-dim">
        Historial de este dispositivo (sesión de invitado)
      </p>

      {meQuery.isError && (
        <div className="mt-6 rounded-md bg-surface p-4 text-sm text-cream-dim">
          Aún no hay pedidos en este dispositivo. Cuando confirmes uno, aparece aquí.
        </div>
      )}

      {meQuery.data && (
        <>
          {meQuery.data.customer && (
            <p className="mt-4 text-sm">
              Hola, <span className="font-medium">{meQuery.data.customer.name}</span>
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {meQuery.data.orders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/pedido/${order.publicCode}`}
                  onClick={() => saveLastOrderCode(order.publicCode)}
                  className="flex items-center justify-between rounded-md bg-surface px-3 py-3"
                >
                  <span>
                    <span className="block font-display">{order.publicCode}</span>
                    <span className="text-xs text-cream-dim">{orderStatusLabel(order.status)}</span>
                  </span>
                  <span className="font-display tabular-nums">{formatMoney(order.totalCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <BottomNav />
    </div>
  );
}
