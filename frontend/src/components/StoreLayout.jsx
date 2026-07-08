import { Link, Outlet } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useCurrency } from "../contexts/CurrencyContext";

export default function StoreLayout() {
  const { itemCount } = useCart();
  const { currency, setCurrency } = useCurrency();

  return (
    <div className="app-shell">
      <header className="store-header">
        <Link to="/" className="logo">
          03/cerotres
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <select className="input" style={{ width: 90 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
            <option value="VES">Bs.</option>
          </select>
          <Link to="/pedido" style={{ textDecoration: "none", color: "inherit", fontWeight: 700 }}>
            Rastrear pedido
          </Link>
          <Link to="/carrito" className="btn btn-primary btn-sm">
            Carrito ({itemCount})
          </Link>
        </div>
      </header>
      <main style={{ flex: 1, padding: "24px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <Outlet />
      </main>
      <footer style={{ textAlign: "center", padding: 20, color: "var(--gray)", fontSize: 13 }}>
        03/cerotres · @03__cerotres · <Link to="/admin/login">Acceso administrativo</Link>
      </footer>
    </div>
  );
}
