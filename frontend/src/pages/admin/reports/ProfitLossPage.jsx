import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function ProfitLossPage() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState(null);

  const load = () => api.get(`/reports/profit-loss?from=${from}&to=${to}`).then(({ data }) => setReport(data));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="page-title">Perdidas y ganancias</h1>

      <div className="toolbar">
        <input className="input" type="date" style={{ maxWidth: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input" type="date" style={{ maxWidth: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={load}>
          Aplicar
        </button>
      </div>

      {report && (
        <div className="card" style={{ maxWidth: 480 }}>
          <Row label="Ingresos" value={report.revenue} />
          <Row label="Costo de ventas (COGS)" value={-report.cogs} />
          <Row label="Utilidad bruta" value={report.gross_profit} bold />
          <Row label="Gastos operativos" value={-report.operating_expenses} />
          <hr />
          <Row label="Utilidad neta" value={report.net_profit} bold big />
          <p style={{ color: "var(--gray)" }}>Margen: {report.margin_pct}%</p>

          {report.expenses_by_category.length > 0 && (
            <>
              <h4>Gastos por categoria</h4>
              {report.expenses_by_category.map((e) => (
                <Row key={e.category} label={e.category} value={-e.total} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, big }) {
  const color = value < 0 ? "var(--danger)" : "var(--success)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontWeight: bold ? 700 : 400, fontSize: big ? 18 : 14 }}>
      <span>{label}</span>
      <span style={{ color }}>${value.toFixed(2)}</span>
    </div>
  );
}
