import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useCurrency } from "../contexts/CurrencyContext";

const NAV = [
  { to: "/", label: "Inicio", end: true },
  { to: "/#menu", label: "Menú", hash: true },
  { to: "/pedido", label: "Rastrear", end: false },
];

export default function StoreLayout() {
  const { itemCount } = useCart();
  const { currency, setCurrency } = useCurrency();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className={`store-shell app-shell ${isHome ? "store-shell--home" : ""}`}>
      <header className="store-header">
        <div className="container store-header-inner">
          <Link to="/" className="store-logo" aria-label="Ir al inicio">
            <span className="store-logo__03">03</span>
            <span className="store-logo__slash">/</span>
            <span className="store-logo__name">cerotres</span>
          </Link>

          <nav className="store-nav-center" aria-label="Principal">
            {NAV.map((item) =>
              item.hash ? (
                <a key={item.to} href={item.to} className="store-nav-link">
                  {item.label}
                </a>
              ) : (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `store-nav-link ${isActive ? "is-active" : ""}`}>
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="store-nav-actions">
            <a href="#menu" className="store-icon-btn" aria-label="Buscar en menú">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
            </a>

            <Link to="/carrito" className="store-icon-btn store-icon-btn--bag" aria-label="Carrito">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 6h15l-1.5 9h-12z" />
                <path d="M6 6l-1-2H2" />
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="18" cy="20" r="1.5" />
              </svg>
              {itemCount > 0 && <span className="store-bag-badge">{itemCount}</span>}
            </Link>

            <select className="store-currency-select" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Moneda">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="VES">VES</option>
            </select>

            <Link to="/pedido" className="store-btn store-btn--ghost">
              Rastrear
            </Link>
            <Link to="/carrito" className="store-btn store-btn--solid">
              Carrito
            </Link>
          </div>
        </div>
      </header>

      <main className={`store-main ${isHome ? "store-main--flush" : ""}`}>
        {isHome ? <Outlet /> : (
          <div className="container store-page-wrap">
            <Outlet />
          </div>
        )}
      </main>

      {!isHome && (
        <footer className="store-footer">
          <div className="container store-footer-inner">
            <span className="store-footer-brand">03/cerotres</span>
            <span className="store-footer-dot">·</span>
            <a href="https://instagram.com/03__cerotres" target="_blank" rel="noreferrer">
              @03__cerotres
            </a>
            <span className="store-footer-dot">·</span>
            <Link to="/admin/login">Acceso administrativo</Link>
          </div>
        </footer>
      )}
    </div>
  );
}
