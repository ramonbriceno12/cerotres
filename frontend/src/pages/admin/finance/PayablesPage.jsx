import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";

export default function PayablesPage() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    api.get("/reports/payables").then(({ data, total_payable }) => setReport({ data, total_payable }));
  }, []);

  if (!report) return <p>Cargando...</p>;

  return (
    <div>
      <h1 className="page-title">Cuentas por pagar</h1>
      <p className="page-subtitle">Compras recibidas que aun debemos pagar a proveedores.</p>

      <div className="stat-tile" style={{ maxWidth: 240, marginBottom: 20 }}>
        <div className="stat-label">Total por pagar</div>
        <div className="stat-value">${report.total_payable.toFixed(2)}</div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {report.data.length === 0 ? (
          <p className="empty-state">Todo esta al dia.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Compra</th>
                <th>Proveedor</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {report.data.map((r) => (
                <tr key={r.purchase_id}>
                  <td>
                    <Link to={`/admin/compras/${r.purchase_id}`}>{r.purchase_number}</Link>
                  </td>
                  <td>{r.supplier?.name}</td>
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
