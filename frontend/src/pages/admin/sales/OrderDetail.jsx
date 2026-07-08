import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import CrudForm from "../../../components/CrudForm";
import { VALID_NEXT_STATUSES, STATUS_LABELS } from "../../../lib/orderStatuses";

const METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "pago_movil", label: "Pago movil" },
  { value: "zelle", label: "Zelle" },
  { value: "other", label: "Otro" },
];

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [showPay, setShowPay] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get(`/orders/${id}`);
    setOrder(data);
  }, [id]);

  useEffect(() => {
    load();
    api.get("/accounts").then(({ data }) => setAccounts(data));
  }, [load]);

  if (!order) return <p>Cargando...</p>;

  const balance = Number(order.total) - (order.payments || []).filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const nextStatuses = VALID_NEXT_STATUSES[order.status] || [];

  const changeStatus = async (status) => {
    setError("");
    try {
      await api.post(`/orders/${id}/status`, { status });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1 className="page-title">Pedido {order.order_number}</h1>

      <div className="toolbar">
        {nextStatuses.map((s) => (
          <button key={s} className="btn btn-primary btn-sm" onClick={() => changeStatus(s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        {order.status !== "delivered" && order.status !== "cancelled" && (
          <button className="btn btn-outline btn-sm" onClick={() => changeStatus("cancelled")}>
            Cancelar pedido
          </button>
        )}
        <div className="spacer" />
        <button className="btn btn-outline btn-sm" onClick={() => api.openFile(`/orders/${id}/receipt.pdf`)}>
          Imprimir recibo
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => api.openFile(`/orders/${id}/kitchen-ticket.pdf`)}>
          Imprimir comanda
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid grid-2">
        <div className="card">
          <p>
            <strong>Estado:</strong> <span className="badge">{STATUS_LABELS[order.status]}</span>
          </p>
          <p>
            <strong>Cliente:</strong> {order.customer?.full_name} ({order.customer?.phone})
          </p>
          <p>
            <strong>Cedula:</strong> {order.customer?.cedula}
          </p>
          <p>
            <strong>Correo:</strong> {order.customer?.email}
          </p>
          <p>
            <strong>Tipo:</strong> {order.order_type === "delivery" ? "Delivery" : "Retiro"}
          </p>
          {order.delivery_address && (
            <p>
              <strong>Direccion:</strong> {order.delivery_address.address_line} {order.delivery_address.reference}
            </p>
          )}
          {order.notes && (
            <p>
              <strong>Observaciones:</strong> {order.notes}
            </p>
          )}

          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.product?.name}
                    {item.options?.length > 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>{item.options.map((o) => o.name).join(", ")}</div>}
                    {item.notes && <div style={{ fontSize: 12, color: "var(--gray)", fontStyle: "italic" }}>{item.notes}</div>}
                  </td>
                  <td>{item.quantity}</td>
                  <td>${Number(item.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <div>Subtotal: ${Number(order.subtotal).toFixed(2)}</div>
            {Number(order.discount) > 0 && <div>Descuento: -${Number(order.discount).toFixed(2)}</div>}
            {Number(order.delivery_fee) > 0 && <div>Delivery: ${Number(order.delivery_fee).toFixed(2)}</div>}
            <div style={{ fontWeight: 700, fontSize: 18 }}>Total: ${Number(order.total).toFixed(2)}</div>
            {order.currency !== "USD" && (
              <div style={{ color: "var(--gray)" }}>
                {Number(order.total_currency).toFixed(2)} {order.currency} (tasa {order.exchange_rate})
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Pagos</h3>
            {balance > 0.01 && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowPay(true)}>
                + Registrar pago
              </button>
            )}
          </div>
          <p style={{ color: "var(--gray)", fontSize: 14 }}>Saldo pendiente: ${balance.toFixed(2)}</p>

          {(order.payments || []).length === 0 ? (
            <p className="empty-state">Sin pagos registrados. Se puede pagar con multiples metodos.</p>
          ) : (
            order.payments.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span>
                  {p.method} <span className="badge badge-gray">{p.status}</span>
                </span>
                <span>
                  {Number(p.amount_currency).toFixed(2)} {p.currency}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {showPay && (
        <Modal title="Registrar pago" onClose={() => setShowPay(false)}>
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
              { key: "amount_currency", label: "Monto (en la moneda elegida)", type: "number", step: "0.01", required: true, default: balance.toFixed(2) },
              { key: "method", label: "Metodo", type: "select", required: true, options: METHODS },
              { key: "account_id", label: "Cuenta", type: "select", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
              { key: "reference", label: "Referencia" },
            ]}
            onSubmit={async (payload) => {
              await api.post("/payments", { ...payload, order_id: id });
              setShowPay(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
