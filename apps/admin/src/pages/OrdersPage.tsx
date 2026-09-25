import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { apiFetch, getAccessToken } from '../lib/api';
import { formatMoney, STATUS_LABEL, type AdminOrderListItem } from '../lib/orders';

type Meta = {
  channels: Array<{ id: string; code: string; name: string }>;
  statuses: string[];
};

export function OrdersPage() {
  const [status, setStatus] = useState('');
  const [channelId, setChannelId] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const metaQuery = useQuery({
    queryKey: ['orders-meta'],
    queryFn: () => apiFetch<Meta>('/api/admin/orders/meta'),
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (status) params.set('status', status);
    if (channelId) params.set('channelId', channelId);
    if (fulfillmentType) params.set('fulfillmentType', fulfillmentType);
    if (q.trim()) params.set('q', q.trim());
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
    return params.toString();
  }, [page, status, channelId, fulfillmentType, q, from, to]);

  const listQuery = useQuery({
    queryKey: ['admin-orders', queryString],
    queryFn: () =>
      apiFetch<{ total: number; page: number; pageSize: number; orders: AdminOrderListItem[] }>(
        `/api/admin/orders?${queryString}`,
      ),
  });

  function exportCsv() {
    const token = getAccessToken();
    const url = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/admin/orders/export.csv?${queryString}`;
    void fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((res) => res.blob())
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = 'orders.csv';
        a.click();
        URL.revokeObjectURL(href);
      });
  }

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.total ?? 0) / (listQuery.data?.pageSize ?? 20)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Pedidos</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/pos"
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Punto de venta
          </Link>
          <Link
            to="/orders/text"
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50"
          >
            Por texto
          </Link>
          <Link
            to="/orders/new"
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50"
          >
            Alta manual
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid gap-2 rounded border border-stone-200 bg-white p-3 md:grid-cols-3 lg:grid-cols-6">
        <input
          className="rounded border border-stone-300 px-2 py-1.5"
          placeholder="Buscar código, cliente…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="rounded border border-stone-300 px-2 py-1.5"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Todos los estados</option>
          {(metaQuery.data?.statuses ?? []).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-stone-300 px-2 py-1.5"
          value={channelId}
          onChange={(e) => {
            setPage(1);
            setChannelId(e.target.value);
          }}
        >
          <option value="">Todos los canales</option>
          {(metaQuery.data?.channels ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-stone-300 px-2 py-1.5"
          value={fulfillmentType}
          onChange={(e) => {
            setPage(1);
            setFulfillmentType(e.target.value);
          }}
        >
          <option value="">Pickup + Delivery</option>
          <option value="PICKUP">Pickup</option>
          <option value="DELIVERY">Delivery</option>
        </select>
        <input
          type="date"
          className="rounded border border-stone-300 px-2 py-1.5"
          value={from}
          onChange={(e) => {
            setPage(1);
            setFrom(e.target.value);
          }}
        />
        <input
          type="date"
          className="rounded border border-stone-300 px-2 py-1.5"
          value={to}
          onChange={(e) => {
            setPage(1);
            setTo(e.target.value);
          }}
        />
      </div>

      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(listQuery.data?.orders ?? []).map((order) => (
              <tr key={order.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-3 py-2 font-medium">
                  <Link to={`/orders/${order.id}`} className="text-stone-900 underline">
                    {order.publicCode}
                  </Link>
                </td>
                <td className="px-3 py-2">{STATUS_LABEL[order.status] ?? order.status}</td>
                <td className="px-3 py-2">{order.channel.name}</td>
                <td className="px-3 py-2">{order.customerName}</td>
                <td className="px-3 py-2">{order.fulfillmentType}</td>
                <td className="px-3 py-2 tabular-nums">{formatMoney(order.totalCents)}</td>
                <td className="px-3 py-2 text-stone-500">
                  {order.placedAt ? new Date(order.placedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listQuery.isLoading && <p className="p-4 text-stone-500">Cargando…</p>}
        {!listQuery.isLoading && (listQuery.data?.orders.length ?? 0) === 0 && (
          <p className="p-4 text-stone-500">Sin pedidos con estos filtros.</p>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-stone-500">{listQuery.data?.total ?? 0} pedidos</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            className="rounded border px-3 py-1 disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            className="rounded border px-3 py-1 disabled:opacity-40"
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
