import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../contexts/CartContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { api } from "../../lib/api";

const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "pago_movil", label: "Pago móvil" },
  { value: "zelle", label: "Zelle" },
  { value: "other", label: "Otro" },
];

export default function Checkout() {
  const { lines, subtotal, clear } = useCart();
  const { currency, format } = useCurrency();
  const navigate = useNavigate();

  const [orderType, setOrderType] = useState("delivery");
  const [form, setForm] = useState({
    full_name: "",
    cedula: "",
    phone: "",
    email: "",
    address_line: "",
    reference: "",
    city: "",
    payment_method: "cash",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        customer: { full_name: form.full_name, cedula: form.cedula, phone: form.phone, email: form.email },
        order_type: orderType,
        address: { address_line: form.address_line, reference: form.reference, city: form.city },
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          notes: l.notes,
          selected_options: l.selected_options.map((o) => o.option_item_id),
        })),
        payment_method: form.payment_method,
        currency,
        notes: form.notes,
      };
      const { data } = await api.post("/orders", payload, { auth: false });
      clear();
      navigate(`/pedido?order=${data.order_number}&phone=${encodeURIComponent(form.phone)}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="store-page">
        <div className="store-page__banner">
          <h1>Finalizar pedido</h1>
        </div>
        <p className="empty-state">Tu carrito está vacío.</p>
      </div>
    );
  }

  return (
    <div className="store-page" style={{ maxWidth: 1000 }}>
      <div className="store-page__banner">
        <h1>Finalizar pedido</h1>
        <p>Completa tus datos y confirma. Te llevamos el pedido o lo recoges en tienda.</p>
      </div>

      <div className="grid grid-2">
        <form className="store-card" onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Nombre completo *</label>
            <input className="input" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Cédula *</label>
            <input className="input" required value={form.cedula} onChange={(e) => set("cedula", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Teléfono *</label>
            <input className="input" required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Correo *</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>

          <div className="field">
            <label className="label">Tipo de pedido</label>
            <div className="pill-row">
              <button type="button" className={`pill ${orderType === "delivery" ? "pill-active" : ""}`} onClick={() => setOrderType("delivery")}>
                Delivery
              </button>
              <button type="button" className={`pill ${orderType === "pickup" ? "pill-active" : ""}`} onClick={() => setOrderType("pickup")}>
                Retiro en tienda
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label">Dirección *</label>
            <input
              className="input"
              required
              value={form.address_line}
              onChange={(e) => set("address_line", e.target.value)}
              placeholder={orderType === "pickup" ? "Retiro en tienda" : ""}
            />
          </div>
          {orderType === "delivery" && (
            <>
              <div className="field">
                <label className="label">Punto de referencia</label>
                <input className="input" value={form.reference} onChange={(e) => set("reference", e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Ciudad</label>
                <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
            </>
          )}

          <div className="field">
            <label className="label">Método de pago</label>
            <select className="input" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, marginBottom: 0 }}>
              Pagando en <strong>{currency}</strong>. El pago se confirma al recibir el pedido.
            </p>
          </div>

          <div className="field">
            <label className="label">Observaciones</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Instrucciones especiales para tu pedido" />
          </div>

          {error && <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", padding: "14px 20px", fontSize: 15 }}>
            {submitting ? "Enviando..." : `Confirmar pedido — ${format(subtotal)}`}
          </button>
        </form>

        <div className="store-card" style={{ alignSelf: "start", position: "sticky", top: 100 }}>
          <h3 style={{ margin: "0 0 6px", fontFamily: "var(--store-display)", fontWeight: 800 }}>Resumen</h3>
          <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 13 }}>
            {lines.reduce((s, l) => s + l.quantity, 0)} artículos en tu pedido
          </p>
          {lines.map((l) => (
            <div key={l.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>
                  {l.quantity}× {l.name}
                </span>
                <strong>{format(l.unit_price * l.quantity)}</strong>
              </div>
              {l.selected_options?.length > 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{l.selected_options.map((o) => o.name).join(", ")}</div>}
            </div>
          ))}
          <div className="cart-total" style={{ marginTop: 8 }}>
            <span>Subtotal</span>
            <span>{format(subtotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
