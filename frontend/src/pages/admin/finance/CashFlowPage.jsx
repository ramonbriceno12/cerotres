import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import CrudForm from "../../../components/CrudForm";

export default function CashFlowPage() {
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.get("/cash-flow-entries");
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalIncome = entries.filter((e) => e.entry_type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = entries.filter((e) => e.entry_type === "expense").reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <h1 className="page-title">Cash Flow</h1>
      <p className="page-subtitle">Libro de caja: todo el dinero que entra y sale del negocio.</p>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-tile">
          <div className="stat-label">Ingresos</div>
          <div className="stat-value" style={{ color: "var(--success)" }}>
            ${totalIncome.toFixed(2)}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Egresos</div>
          <div className="stat-value" style={{ color: "var(--danger)" }}>
            ${totalExpense.toFixed(2)}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Neto</div>
          <div className="stat-value">${(totalIncome - totalExpense).toFixed(2)}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Movimiento manual
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 20 }}>Cargando...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th>Descripcion</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.entry_date}</td>
                  <td>
                    <span className={`badge ${e.entry_type === "income" ? "badge-success" : "badge-danger"}`}>
                      {e.entry_type === "income" ? "Ingreso" : "Egreso"}
                    </span>
                  </td>
                  <td>{e.category}</td>
                  <td>{e.description}</td>
                  <td>${Number(e.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title="Movimiento manual de caja" onClose={() => setShowForm(false)}>
          <CrudForm
            fields={[
              {
                key: "entry_type",
                label: "Tipo",
                type: "select",
                required: true,
                options: [
                  { value: "income", label: "Ingreso" },
                  { value: "expense", label: "Egreso" },
                ],
              },
              { key: "category", label: "Categoria", required: true },
              { key: "description", label: "Descripcion" },
              { key: "amount", label: "Monto (USD)", type: "number", step: "0.01", required: true },
              { key: "entry_date", label: "Fecha", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
            ]}
            onSubmit={async (payload) => {
              await api.post("/cash-flow-entries", payload);
              setShowForm(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
