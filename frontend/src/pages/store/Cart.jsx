import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../contexts/CartContext";
import { useCurrency } from "../../contexts/CurrencyContext";

export default function Cart() {
  const { lines, updateQuantity, removeItem, subtotal } = useCart();
  const { format } = useCurrency();
  const navigate = useNavigate();

  if (lines.length === 0) {
    return (
      <div className="store-page">
        <div className="store-page__banner">
          <h1>Tu carrito</h1>
          <p>Aún no has agregado nada. Explora el menú y arma tu pedido.</p>
        </div>
        <div className="store-card empty-state">
          <p>Tu carrito está vacío.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
            Ver menú
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="store-page">
      <div className="store-page__banner">
        <h1>Tu carrito</h1>
        <p>{lines.length} producto{lines.length !== 1 ? "s" : ""} · Revisa y continúa al pago</p>
      </div>

      <div className="store-card">
        {lines.map((line) => (
          <div key={line.key} className="cart-line">
            <div className="cart-thumb" aria-hidden="true">
              {line.image_url ? <img src={line.image_url} alt="" loading="lazy" /> : null}
            </div>

            <div className="cart-meta">
              <div className="cart-title">
                <span>{line.name}</span>
                <span>{format(line.unit_price * line.quantity)}</span>
              </div>

              {line.selected_options?.length > 0 ? <div className="cart-sub">{line.selected_options.map((o) => o.name).join(", ")}</div> : null}
              {line.notes ? <div className="cart-sub">Nota: {line.notes}</div> : null}
              <div className="cart-sub">{format(line.unit_price)} c/u</div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
                <div className="qty-stepper" aria-label="Cantidad">
                  <button type="button" onClick={() => updateQuantity(line.key, line.quantity - 1)} aria-label="Disminuir">
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateQuantity(line.key, Number(e.target.value))}
                    aria-label="Cantidad"
                  />
                  <button type="button" onClick={() => updateQuantity(line.key, line.quantity + 1)} aria-label="Aumentar">
                    +
                  </button>
                </div>

                <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeItem(line.key)}>
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="cart-total">
          <span>Subtotal</span>
          <span>{format(subtotal)}</span>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 20, width: "100%", padding: "14px 20px", fontSize: 15 }} onClick={() => navigate("/checkout")}>
          Continuar al pago
        </button>
      </div>
    </div>
  );
}
