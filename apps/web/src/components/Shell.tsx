import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { formatMoney } from '../lib/types';
import { BrandIso } from './Brand';

const linkClass = (active: boolean) =>
  `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${
    active ? 'text-cream' : 'text-cream-dim'
  }`;

export function BottomNav() {
  const location = useLocation();
  const trackActive =
    location.pathname.startsWith('/seguimiento') || /^\/pedido\/[^/]+/.test(location.pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-bg/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-lg">
        <NavLink to="/" end className={({ isActive }) => linkClass(isActive)}>
          <BrandIso className="h-5 w-5" />
          Menú
        </NavLink>
        <NavLink to="/pedido" end className={({ isActive }) => linkClass(isActive && !trackActive)}>
          <span className="font-display text-base leading-none">◎</span>
          Pedido
        </NavLink>
        <NavLink to="/seguimiento" className={() => linkClass(trackActive)}>
          <span className="font-display text-base leading-none">◉</span>
          Seguimiento
        </NavLink>
        <NavLink to="/cuenta" className={({ isActive }) => linkClass(isActive)}>
          <span className="font-display text-base leading-none">☺</span>
          Cuenta
        </NavLink>
      </div>
    </nav>
  );
}

export function CartFloatingBar() {
  const { itemCount, subtotalCents } = useCart();
  if (itemCount === 0) return null;

  return (
    <div
      className="fixed inset-x-0 z-30 px-4"
      style={{ bottom: 'calc(4.25rem + env(safe-area-inset-bottom))' }}
    >
      <Link
        to="/pedido"
        className="mx-auto flex max-w-lg items-center justify-between rounded-pill bg-brand px-5 py-3 text-cream shadow-lg transition active:scale-[0.97]"
      >
        <span className="text-sm font-medium">Ver pedido · {itemCount}</span>
        <span className="font-display text-lg tabular-nums">{formatMoney(subtotalCents)}</span>
      </Link>
    </div>
  );
}
