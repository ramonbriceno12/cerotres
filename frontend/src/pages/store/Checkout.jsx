import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../contexts/CartContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import { api } from "../../lib/api";

const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "pago_movil", label: "Pago movil" },
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
    return <p className="empty-state">Tu carrito esta vacio.</p>;
  }

  return (
    <div>
      <h1 className="page-title">Finalizar pedido</h1>
      <div className="grid grid-2">
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Nombre completo *</label>
            <input className="input" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Cedula *</label>
            <input className="input" required value={form.cedula} onChange={(e) => set("cedula", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Telefono *</label>
            <input className="input" required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Correo *</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>

          <div className="field">
            <label className="label">Tipo de pedido</label>
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <button type="button" className={`btn ${orderType === "delivery" ? "btn-primary" : "btn-outline"} btn-sm`} onClick={() => setOrderType("delivery")}>
                Delivery
              </button>
              <button type="button" className={`btn ${orderType === "pickup" ? "btn-primary" : "btn-outline"} btn-sm`} onClick={() => setOrderType("pickup")}>
                Retiro en tienda
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label">Direccion *</label>
            <input className="input" required value={form.address_line} onChange={(e) => set("address_line", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Punto de referencia</label>
            <input className="input" value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Ciudad</label>
            <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>

          <div className="field">
            <label className="label">Metodo de pago</label>
            <select className="input" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>Pagando en {currency}. El pago se confirma al recibir el pedido.</p>
          </div>

          <div className="field">
            <label className="label">Observaciones</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Instrucciones especiales para tu pedido" />
          </div>

          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Enviando..." : `Confirmar pedido - ${format(subtotal)}`}
          </button>
        </form>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Resumen</h3>
          {lines.map((l) => (
            <div key={l.key} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {l.quantity}x {l.name}
                </span>
                <span>{format(l.unit_price * l.quantity)}</span>
              </div>
              {l.selected_options?.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--gray)" }}>{l.selected_options.map((o) => o.name).join(", ")}</div>
              )}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 700 }}>
            <span>Subtotal</span>
            <span>{format(subtotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
