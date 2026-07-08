import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import CrudForm from "../../../components/CrudForm";

const METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "pago_movil", label: "Pago movil" },
  { value: "zelle", label: "Zelle" },
  { value: "other", label: "Otro" },
];

export default function PurchaseDetail() {
  const { id } = useParams();
  const [purchase, setPurchase] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [showPay, setShowPay] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get(`/purchases/${id}`);
    setPurchase(data);
  }, [id]);

  useEffect(() => {
    load();
    api.get("/accounts").then(({ data }) => setAccounts(data));
  }, [load]);

  if (!purchase) return <p>Cargando...</p>;

  const balance = Number(purchase.total) - (purchase.payments || []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div>
      <h1 className="page-title">Compra {purchase.purchase_number}</h1>
      <div className="grid grid-2">
        <div className="card">
          <p>
            <strong>Proveedor:</strong> {purchase.supplier?.name}
          </p>
          <p>
            <strong>Estado:</strong> <span className="badge">{purchase.status}</span>
          </p>
          <p>
            <strong>Total:</strong> ${Number(purchase.total).toFixed(2)}
          </p>
          <p>
            <strong>Saldo pendiente:</strong> ${balance.toFixed(2)}
          </p>

          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th>Cant.</th>
                <th>Costo/u</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.ingredient?.name}</td>
                  <td>
                    {i.quantity} {i.ingredient?.unit?.abbreviation}
                  </td>
                  <td>${Number(i.unit_cost).toFixed(4)}</td>
                  <td>${Number(i.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            {purchase.status === "pending" && (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await api.post(`/purchases/${id}/receive`);
                  load();
                }}
              >
                Marcar como recibida
              </button>
            )}
            {purchase.status === "received" && balance > 0.01 && (
              <button className="btn btn-primary" onClick={() => setShowPay(true)}>
                Registrar pago
              </button>
            )}
            {purchase.status === "pending" && (
              <button
                className="btn btn-outline"
                onClick={async () => {
                  await api.post(`/purchases/${id}/cancel`);
                  load();
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pagos al proveedor</h3>
          {(purchase.payments || []).length === 0 ? (
            <p className="empty-state">Sin pagos registrados.</p>
          ) : (
            purchase.payments.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{p.method}</span>
                <span>
                  {Number(p.amount_currency).toFixed(2)} {p.currency}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {showPay && (
        <Modal title="Registrar pago a proveedor" onClose={() => setShowPay(false)}>
          <CrudForm
            fields={[
              {
                key: "currency",
                label: "Moneda",
                type: "select",
                default: "USD",
                options: [
                  { value: "USD", label: "USD" },
                  { value: "EUR", label: "EUR" },
                  { value: "VES", label: "Bs." },
                ],
              },
              { key: "amount_currency", label: "Monto", type: "number", step: "0.01", required: true },
              { key: "method", label: "Metodo", type: "select", required: true, options: METHODS },
              { key: "account_id", label: "Cuenta", type: "select", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
              { key: "reference", label: "Referencia" },
            ]}
            onSubmit={async (payload) => {
              await api.post(`/purchases/${id}/payments`, payload);
              setShowPay(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
