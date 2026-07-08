import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function SalesReportPage() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState(null);

  const load = () => api.get(`/reports/sales?from=${from}&to=${to}`).then(({ data }) => setReport(data));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="page-title">Reporte de ventas</h1>

      <div className="toolbar">
        <input className="input" type="date" style={{ maxWidth: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input" type="date" style={{ maxWidth: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={load}>
          Aplicar
        </button>
      </div>

      {report && (
        <>
          <div className="grid grid-3" style={{ marginBottom: 20 }}>
            <div className="stat-tile">
              <div className="stat-label">Ingresos</div>
              <div className="stat-value">${report.revenue.toFixed(2)}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">Pedidos</div>
              <div className="stat-value">{report.order_count}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">Ticket promedio</div>
              <div className="stat-value">${report.average_ticket.toFixed(2)}</div>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Por dia</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_day.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>${d.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Por producto</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_product.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>${p.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
