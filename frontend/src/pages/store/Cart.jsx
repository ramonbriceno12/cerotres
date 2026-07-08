import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../contexts/CartContext";
import { useCurrency } from "../../contexts/CurrencyContext";

export default function Cart() {
  const { lines, updateQuantity, removeItem, subtotal } = useCart();
  const { format } = useCurrency();
  const navigate = useNavigate();

  if (lines.length === 0) {
    return (
      <div className="empty-state">
        <p>Tu carrito esta vacio.</p>
        <Link to="/" className="btn btn-primary">
          Ver menu
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Tu carrito</h1>
      <div className="card">
        {lines.map((line) => (
          <div key={line.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <strong>{line.name}</strong>
              {line.selected_options?.length > 0 && (
                <div style={{ color: "var(--gray)", fontSize: 13 }}>{line.selected_options.map((o) => o.name).join(", ")}</div>
              )}
              {line.notes && <div style={{ color: "var(--gray)", fontSize: 12, fontStyle: "italic" }}>Nota: {line.notes}</div>}
              <div style={{ fontSize: 13, color: "var(--gray)" }}>{format(line.unit_price)} c/u</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                className="input"
                type="number"
                min={1}
                style={{ width: 60 }}
                value={line.quantity}
                onChange={(e) => updateQuantity(line.key, Number(e.target.value))}
              />
              <strong>{format(line.unit_price * line.quantity)}</strong>
              <button className="btn btn-outline btn-sm" onClick={() => removeItem(line.key)}>
                Quitar
              </button>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 18 }}>
          <strong>Subtotal</strong>
          <strong>{format(subtotal)}</strong>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} onClick={() => navigate("/checkout")}>
          Continuar al pago
        </button>
      </div>
    </div>
  );
}
