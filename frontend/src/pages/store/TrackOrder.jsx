import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

const STATUS_LABELS = {
  pending: "Pendiente de confirmacion",
  confirmed: "Confirmado",
  in_kitchen: "En cocina",
  ready: "Listo",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export default function TrackOrder() {
  const [params] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get("order") || "");
  const [phone, setPhone] = useState(params.get("phone") || "");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const { data } = await api.get(`/orders/track/${encodeURIComponent(orderNumber)}?phone=${encodeURIComponent(phone)}`, { auth: false });
      setOrder(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.get("order") && params.get("phone")) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="page-title">Rastrear pedido</h1>
      <form className="card" onSubmit={search} style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="field">
          <label className="label">Numero de pedido</label>
          <input className="input" required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="ORD-000001" />
        </div>
        <div className="field">
          <label className="label">Telefono usado en el pedido</label>
          <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Buscando..." : "Buscar"}
        </button>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      </form>

      {order && (
        <div className="card" style={{ marginTop: 20, maxWidth: 420 }}>
          <h3 style={{ marginTop: 0 }}>{order.order_number}</h3>
          <p>
            Estado: <span className="badge">{STATUS_LABELS[order.status] || order.status}</span>
          </p>
          <p>Total: ${order.total}</p>
          <p style={{ color: "var(--gray)", fontSize: 13 }}>Pedido el {new Date(order.placed_at).toLocaleString("es-VE")}</p>
        </div>
      )}
    </div>
  );
}
