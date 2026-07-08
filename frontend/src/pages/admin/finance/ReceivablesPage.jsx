import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";

export default function ReceivablesPage() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    api.get("/reports/receivables").then(({ data, total_receivable }) => setReport({ data, total_receivable }));
  }, []);

  if (!report) return <p>Cargando...</p>;

  return (
    <div>
      <h1 className="page-title">Cuentas por cobrar</h1>
      <p className="page-subtitle">Pedidos que el cliente aun no ha pagado por completo.</p>

      <div className="stat-tile" style={{ maxWidth: 240, marginBottom: 20 }}>
        <div className="stat-label">Total por cobrar</div>
        <div className="stat-value">${report.total_receivable.toFixed(2)}</div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {report.data.length === 0 ? (
          <p className="empty-state">Todo esta al dia.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {report.data.map((r) => (
                <tr key={r.order_id}>
                  <td>
                    <Link to={`/admin/ventas/${r.order_id}`}>{r.order_number}</Link>
                  </td>
                  <td>{r.customer?.full_name}</td>
                  <td>${r.total.toFixed(2)}</td>
                  <td>${r.paid.toFixed(2)}</td>
                  <td style={{ fontWeight: 700 }}>${r.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
