import { Link } from 'react-router-dom';
import { NavIcon } from '../components/admin/NavIcon';
import { NAV_GROUPS } from '../components/admin/navConfig';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="admin-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Bienvenido
        </p>
        <h1 className="mt-1">Centro de operaciones</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Gestiona pedidos, cocina, canales y finanzas desde un solo panel. Usa el menú lateral o
          los accesos rápidos de abajo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {NAV_GROUPS.flatMap((group) =>
          group.items.slice(0, group.id === 'ops' ? 3 : 1).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="admin-card group flex items-start gap-4 p-5 transition-shadow hover:shadow-md"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white transition-transform group-hover:scale-105">
                <NavIcon name={item.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-900">{item.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{group.label}</span>
              </span>
            </Link>
          )),
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="admin-card p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Operación diaria</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                to="/orders"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Revisar pedidos activos
              </Link>
            </li>
            <li>
              <Link
                to="/kitchen"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Abrir pantalla de cocina (KDS)
              </Link>
            </li>
            <li>
              <Link
                to="/pos"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Abrir punto de venta (POS)
              </Link>
            </li>
            <li>
              <Link
                to="/orders/text"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Crear pedido por texto (Claude)
              </Link>
            </li>
            <li>
              <Link
                to="/orders/new"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Registrar pedido manual (formulario)
              </Link>
            </li>
          </ul>
        </div>
        <div className="admin-card p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Finanzas</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                to="/finance"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Ver P&amp;L y flujo de caja
              </Link>
            </li>
            <li>
              <Link
                to="/finance/purchases"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Registrar compras
              </Link>
            </li>
            <li>
              <Link
                to="/finance/ingredients"
                className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Actualizar insumos
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
