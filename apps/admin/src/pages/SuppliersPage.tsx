import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
};

const emptyForm = {
  id: '' as string,
  name: '',
  phone: '',
  email: '',
  notes: '',
};

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiFetch<{ suppliers: Supplier[] }>('/api/admin/finance/suppliers'),
  });

  const saveMutation = useMutation({
    mutationFn: async () =>
      apiFetch('/api/admin/finance/suppliers', {
        method: 'POST',
        body: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
          isActive: true,
        },
      }),
    onSuccess: () => {
      setForm(emptyForm);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/admin/finance/suppliers/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  function startEdit(s: Supplier) {
    setForm({
      id: s.id,
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      notes: s.notes ?? '',
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Proveedores</h1>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="font-medium">{form.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Teléfono"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Notas"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!form.name.trim() || saveMutation.isPending}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => saveMutation.mutate()}
          >
            {form.id ? 'Guardar cambios' : 'Crear'}
          </button>
          {form.id && (
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm"
              onClick={() => setForm(emptyForm)}
            >
              Cancelar
            </button>
          )}
        </div>
      </section>

      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Teléfono</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Notas</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(listQuery.data?.suppliers ?? []).map((s) => (
              <tr key={s.id} className="border-t border-stone-100">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2">{s.phone ?? '—'}</td>
                <td className="px-3 py-2">{s.email ?? '—'}</td>
                <td className="px-3 py-2 text-stone-600">{s.notes ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="mr-3 text-xs underline"
                    onClick={() => startEdit(s)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    onClick={() => {
                      if (window.confirm(`¿Desactivar a ${s.name}?`)) {
                        deactivateMutation.mutate(s.id);
                      }
                    }}
                  >
                    Desactivar
                  </button>
                </td>
              </tr>
            ))}
            {(listQuery.data?.suppliers.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-stone-500">
                  Sin proveedores. Crea el primero arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
