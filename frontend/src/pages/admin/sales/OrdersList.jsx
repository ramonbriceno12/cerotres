import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../../lib/api";

const STATUS_LABELS = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  in_kitchen: "En preparacion",
  ready: "Preparado",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (params.get("customer_id")) query.set("customer_id", params.get("customer_id"));
    const { data } = await api.get(`/orders?${query.toString()}`);
    setOrders(data);
    setLoading(false);
  }, [status, params]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Ventas</h1>

      <div className="toolbar">
        <select className="input" style={{ maxWidth: 200 }} value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <Link to="/admin/ventas/nuevo" className="btn btn-primary">
          + Nuevo pedido
        </Link>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 20 }}>Cargando...</p>
        ) : orders.length === 0 ? (
          <p className="empty-state">Sin pedidos.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Pago</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/admin/ventas/${o.id}`}>{o.order_number}</Link>
                  </td>
                  <td>{o.customer?.full_name}</td>
                  <td>{new Date(o.placed_at).toLocaleString("es-VE")}</td>
                  <td>${Number(o.total).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${o.payment_status === "paid" ? "badge-success" : "badge-warning"}`}>{o.payment_status}</span>
                  </td>
                  <td>
                    <span className="badge">{STATUS_LABELS[o.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
