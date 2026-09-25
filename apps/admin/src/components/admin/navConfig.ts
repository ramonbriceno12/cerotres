import type { NavIconName } from './NavIcon';

export type NavItem = {
  to: string;
  label: string;
  icon: NavIconName;
  end?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'ops',
    label: 'Operación',
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/orders', label: 'Pedidos', icon: 'orders' },
      { to: '/pos', label: 'Punto de venta', icon: 'pos' },
      { to: '/orders/text', label: 'Pedido por texto', icon: 'text' },
      { to: '/kitchen', label: 'Cocina (KDS)', icon: 'kitchen' },
      { to: '/cash', label: 'Cierre de caja', icon: 'cash' },
    ],
  },
  {
    id: 'channels',
    label: 'Canales',
    items: [
      { to: '/channels', label: 'Canales', icon: 'channels' },
      { to: '/channels/platform-orders', label: 'Apps (PY / Yummy)', icon: 'platform' },
      { to: '/channels/settlements', label: 'Liquidaciones', icon: 'settlements' },
      { to: '/channels/reports', label: 'Comisiones', icon: 'reports' },
    ],
  },
  {
    id: 'finance',
    label: 'Finanzas',
    items: [
      { to: '/finance', label: 'Reportes', icon: 'finance' },
      { to: '/finance/ingredients', label: 'Insumos', icon: 'ingredients' },
      { to: '/finance/recipes', label: 'Recetas', icon: 'recipes' },
      { to: '/finance/purchases', label: 'Compras', icon: 'purchases' },
      { to: '/finance/suppliers', label: 'Proveedores', icon: 'suppliers' },
      { to: '/finance/exchange-rate', label: 'Tasa USD/Bs', icon: 'exchange' },
    ],
  },
  {
    id: 'catalog',
    label: 'Catálogo',
    items: [{ to: '/catalog/products', label: 'Productos', icon: 'catalog' }],
  },
];

const FLAT_NAV = NAV_GROUPS.flatMap((g) => g.items);

export function pageTitleForPath(pathname: string): string {
  if (pathname.startsWith('/orders/new')) return 'Alta manual';
  if (pathname.startsWith('/orders/text')) return 'Pedido por texto';
  if (pathname.startsWith('/pos')) return 'Punto de venta';
  if (pathname.startsWith('/orders/') && pathname !== '/orders') return 'Detalle de pedido';

  const sorted = [...FLAT_NAV].sort((a, b) => b.to.length - a.to.length);
  const match = sorted.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  return match?.label ?? 'Admin';
}
