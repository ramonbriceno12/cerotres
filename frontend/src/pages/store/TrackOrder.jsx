import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

const STATUS_LABELS = {
  pending: "Pendiente de confirmación",
  confirmed: "Confirmado",
  in_kitchen: "En cocina",
  ready: "Listo",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_STEPS = [
  { key: "pending", label: STATUS_LABELS.pending, help: "Te confirmamos en breve" },
  { key: "confirmed", label: STATUS_LABELS.confirmed, help: "Pedido en cola" },
  { key: "in_kitchen", label: STATUS_LABELS.in_kitchen, help: "Preparando" },
  { key: "ready", label: STATUS_LABELS.ready, help: "Listo para salir" },
  { key: "out_for_delivery", label: STATUS_LABELS.out_for_delivery, help: "En ruta" },
  { key: "delivered", label: STATUS_LABELS.delivered, help: "¡Buen provecho!" },
];

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

  const currentIndex = order ? STATUS_STEPS.findIndex((s) => s.key === order.status) : -1;

  return (
    <div className="store-page">
      <div className="store-page__banner">
        <h1>Rastrear pedido</h1>
        <p>Ingresa tu número de pedido y teléfono para ver el estado en tiempo real.</p>
      </div>

      <form className="store-card" onSubmit={search} style={{ maxWidth: 440 }}>
        <div className="field">
          <label className="label">Número de pedido</label>
          <input className="input" required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="ORD-000001" />
        </div>
        <div className="field">
          <label className="label">Teléfono usado en el pedido</label>
          <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Buscando..." : "Buscar pedido"}
        </button>
        {error && <p style={{ color: "var(--danger)", marginBottom: 0 }}>{error}</p>}
      </form>

      {order && (
        <div className="store-card" style={{ marginTop: 20, maxWidth: 520 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontFamily: "var(--store-display)", fontWeight: 800 }}>{order.order_number}</h3>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                Pedido el {new Date(order.placed_at).toLocaleString("es-VE")}
              </p>
            </div>
            <span className={`badge ${order.status === "cancelled" ? "badge-danger" : "badge-success"}`}>{STATUS_LABELS[order.status] || order.status}</span>
          </div>

          <p style={{ margin: "16px 0 0", fontSize: 18, fontFamily: "var(--store-display)", fontWeight: 800 }}>
            Total: ${order.total}
          </p>

          {order.status !== "cancelled" && (
            <div className="order-steps" aria-label="Progreso del pedido">
              {STATUS_STEPS.map((s, idx) => {
                const isDone = currentIndex >= 0 && idx < currentIndex;
                const isActive = currentIndex >= 0 && idx === currentIndex;
                return (
                  <div key={s.key} className={`order-step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}>
                    <span className="step-dot" aria-hidden="true" />
                    <span className="step-label">{s.label}</span>
                    <span className="step-help">{s.help}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
