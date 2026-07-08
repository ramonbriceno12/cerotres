import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/reports/dashboard").then(({ data }) => setStats(data));
  }, []);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Resumen del dia.</p>

      {!stats ? (
        <p>Cargando...</p>
      ) : (
        <div className="grid grid-4">
          <div className="stat-tile">
            <div className="stat-label">Ventas de hoy</div>
            <div className="stat-value">${stats.today_revenue.toFixed(2)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Pedidos de hoy</div>
            <div className="stat-value">{stats.today_order_count}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Pedidos activos</div>
            <div className="stat-value">{stats.active_orders}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Stock bajo</div>
            <div className="stat-value" style={{ color: stats.low_stock_count > 0 ? "var(--danger)" : undefined }}>
              {stats.low_stock_count}
            </div>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 24 }}>
        <Link to="/admin/ventas/nuevo" className="btn btn-primary">
          + Nuevo pedido
        </Link>
        <Link to="/admin/cocina" className="btn btn-outline">
          Ver cocina
        </Link>
        <Link to="/admin/inventario" className="btn btn-outline">
          Ver inventario
        </Link>
      </div>
    </div>
  );
}
