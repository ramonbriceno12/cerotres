import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";

const KITCHEN_STATUS_CYCLE = { pending: "preparing", preparing: "ready", ready: "ready" };
const KITCHEN_STATUS_LABEL = { pending: "Pendiente", preparing: "Preparando", ready: "Listo" };

export default function KitchenBoard() {
  const [orders, setOrders] = useState([]);

  const load = useCallback(async () => {
    const { data } = await api.get("/kitchen/queue");
    setOrders(data);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const advanceItem = async (itemId, currentStatus) => {
    const next = KITCHEN_STATUS_CYCLE[currentStatus];
    await api.patch(`/kitchen/items/${itemId}`, { kitchen_status: next });
    load();
  };

  return (
    <div>
      <h1 className="page-title">Cocina</h1>
      <p className="page-subtitle">Pedidos confirmados en preparacion. Se actualiza automaticamente.</p>

      {orders.length === 0 ? (
        <p className="empty-state">No hay pedidos en cocina ahora mismo.</p>
      ) : (
        <div className="grid grid-3">
          {orders.map((order) => (
            <div className="card" key={order.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{order.order_number}</strong>
                <span className="badge">{order.order_type === "delivery" ? "Delivery" : "Retiro"}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--gray)" }}>{new Date(order.placed_at).toLocaleTimeString("es-VE")}</p>

              {order.items.map((item) => (
                <div key={item.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>
                      {item.quantity}x {item.product?.name}
                    </strong>
                    <button
                      className="btn btn-sm"
                      style={{ background: item.kitchen_status === "ready" ? "var(--success)" : "var(--coral)" }}
                      disabled={item.kitchen_status === "ready"}
                      onClick={() => advanceItem(item.id, item.kitchen_status)}
                    >
                      {KITCHEN_STATUS_LABEL[item.kitchen_status]}
                    </button>
                  </div>
                  {item.options?.length > 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>{item.options.map((o) => o.name).join(", ")}</div>}
                  {item.notes && <div style={{ fontSize: 12, fontStyle: "italic" }}>{item.notes}</div>}
                </div>
              ))}
              {order.notes && <p style={{ fontSize: 12, fontStyle: "italic", marginTop: 8 }}>Nota general: {order.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
