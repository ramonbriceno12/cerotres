import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";

const STATUS_LABELS = { pending: "Pendiente", received: "Recibida", cancelled: "Cancelada" };
const PAY_LABELS = { pending: "Sin pagar", partial: "Pago parcial", paid: "Pagada" };

function NewPurchaseForm({ suppliers, ingredients, onSubmit, onClose }) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [rows, setRows] = useState([{ ingredient_id: "", quantity: "", unit_cost: "" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateRow = (idx, key, val) => setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
  const addRow = () => setRows((r) => [...r, { ingredient_id: "", quantity: "", unit_cost: "" }]);

  const total = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        supplier_id: supplierId,
        invoice_number: invoiceNumber,
        items: rows
          .filter((r) => r.ingredient_id && r.quantity && r.unit_cost)
          .map((r) => ({ ...r, quantity: Number(r.quantity), unit_cost: Number(r.unit_cost) })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label className="label">Proveedor *</label>
        <select className="input" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">N. de factura</label>
        <input className="input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
      </div>

      <label className="label">Items</label>
      {rows.map((row, idx) => (
        <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <select className="input" value={row.ingredient_id} onChange={(e) => updateRow(idx, "ingredient_id", e.target.value)}>
            <option value="">Ingrediente...</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input className="input" style={{ width: 90 }} type="number" step="0.001" placeholder="Cant." value={row.quantity} onChange={(e) => updateRow(idx, "quantity", e.target.value)} />
          <input className="input" style={{ width: 100 }} type="number" step="0.0001" placeholder="Costo/u" value={row.unit_cost} onChange={(e) => updateRow(idx, "unit_cost", e.target.value)} />
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={addRow}>
        + Item
      </button>

      <p style={{ marginTop: 12, fontWeight: 700 }}>Total: ${total.toFixed(2)}</p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Crear orden de compra"}
      </button>
    </form>
  );
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, i] = await Promise.all([api.get("/purchases"), api.get("/suppliers"), api.get("/ingredients")]);
    setPurchases(p.data);
    setSuppliers(s.data);
    setIngredients(i.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Compras</h1>
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nueva compra
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 20 }}>Cargando...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>N. compra</th>
                <th>Proveedor</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Pago</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/admin/compras/${p.id}`}>{p.purchase_number}</Link>
                  </td>
                  <td>{p.supplier?.name}</td>
                  <td>{p.purchase_date}</td>
                  <td>${Number(p.total).toFixed(2)}</td>
                  <td>
                    <span className="badge">{STATUS_LABELS[p.status]}</span>
                  </td>
                  <td>
                    <span className={`badge ${p.payment_status === "paid" ? "badge-success" : "badge-warning"}`}>{PAY_LABELS[p.payment_status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title="Nueva compra" onClose={() => setShowForm(false)} width={560}>
          <NewPurchaseForm
            suppliers={suppliers}
            ingredients={ingredients}
            onSubmit={async (payload) => {
              await api.post("/purchases", payload);
              setShowForm(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
