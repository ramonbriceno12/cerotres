import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import ProductBuilderModal from "../../../components/ProductBuilderModal";

const PAYMENT_METHODS = ["cash", "card", "transfer", "pago_movil", "zelle", "other"];

export default function NewOrder() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [building, setBuilding] = useState(null);
  const [lines, setLines] = useState([]);
  const [orderType, setOrderType] = useState("delivery");
  const [currency, setCurrency] = useState("USD");
  const [form, setForm] = useState({ full_name: "", cedula: "", phone: "", email: "", address_line: "", reference: "", city: "", payment_method: "cash", notes: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(data.filter((p) => p.is_active)));
  }, []);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const addLine = (product, options, quantity, notes) => {
    const unitPrice = Number(product.base_price) + options.reduce((s, o) => s + Number(o.price_modifier), 0);
    setLines((l) => [...l, { product, options, quantity, notes, unitPrice }]);
    setBuilding(null);
  };

  const removeLine = (idx) => setLines((l) => l.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lines.length === 0) return setError("Agrega al menos un producto");
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        customer: { full_name: form.full_name, cedula: form.cedula, phone: form.phone, email: form.email },
        order_type: orderType,
        address: { address_line: form.address_line, reference: form.reference, city: form.city },
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          notes: l.notes,
          selected_options: l.options.map((o) => o.id),
        })),
        payment_method: form.payment_method,
        currency,
        notes: form.notes,
      };
      const { data } = await api.post("/orders", payload);
      navigate(`/admin/ventas/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Nuevo pedido</h1>

      <div className="grid grid-2">
        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Productos</h3>
            <div className="grid grid-2">
              {products.map((p) => (
                <button key={p.id} type="button" className="btn btn-outline" style={{ justifyContent: "space-between" }} onClick={() => setBuilding(p)}>
                  {p.name} <span>${Number(p.base_price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Items del pedido</h3>
            {lines.length === 0 ? (
              <p className="empty-state">Agrega productos arriba.</p>
            ) : (
              lines.map((l, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <strong>
                      {l.quantity}x {l.product.name}
                    </strong>
                    {l.options.length > 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>{l.options.map((o) => o.name).join(", ")}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span>${(l.unitPrice * l.quantity).toFixed(2)}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => removeLine(idx)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontWeight: 700 }}>
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <form className="card" onSubmit={handleSubmit}>
          <h3 style={{ marginTop: 0 }}>Datos del cliente</h3>
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
                Retiro
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label">Direccion *</label>
            <input className="input" required value={form.address_line} onChange={(e) => set("address_line", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Referencia</label>
            <input className="input" value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>

          <div className="field">
            <label className="label">Moneda</label>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="VES">Bs.</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Metodo de pago</label>
            <select className="input" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Observaciones</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Creando..." : "Crear pedido"}
          </button>
        </form>
      </div>

      {building && (
        <ProductBuilderModal product={building} onClose={() => setBuilding(null)} onAdd={(options, quantity, notes) => addLine(building, options, quantity, notes)} />
      )}
    </div>
  );
}
