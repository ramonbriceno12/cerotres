import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import CrudForm from "../../../components/CrudForm";

const MOVEMENT_LABELS = {
  purchase_in: "Entrada por compra",
  sale_out: "Salida por venta",
  adjustment_in: "Ajuste (entrada)",
  adjustment_out: "Ajuste (salida)",
  waste: "Merma",
  production_in: "Entrada por produccion",
  production_out: "Salida por produccion",
};

export default function InventoryPage() {
  const [movements, setMovements] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, l, i] = await Promise.all([api.get("/inventory/movements"), api.get("/inventory/low-stock"), api.get("/ingredients")]);
    setMovements(m.data);
    setLowStock(l.data);
    setIngredients(i.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Inventario</h1>
      <p className="page-subtitle">Movimientos de stock (Kardex) y ajustes manuales.</p>

      {lowStock.length > 0 && (
        <div className="card" style={{ marginBottom: 20, background: "#fbe9c8", borderColor: "#f0cf8a" }}>
          <strong>Stock bajo minimo:</strong> {lowStock.map((i) => i.name).join(", ")}
        </div>
      )}

      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Ajuste manual
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
                <th>Ingrediente</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Stock resultante</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleString("es-VE")}</td>
                  <td>{m.ingredient?.name}</td>
                  <td>{MOVEMENT_LABELS[m.movement_type] || m.movement_type}</td>
                  <td>
                    {m.quantity} {m.ingredient?.unit?.abbreviation}
                  </td>
                  <td>{m.resulting_stock}</td>
                  <td>{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title="Ajuste manual de inventario" onClose={() => setShowForm(false)}>
          <CrudForm
            fields={[
              { key: "ingredient_id", label: "Ingrediente", type: "select", required: true, options: ingredients.map((i) => ({ value: i.id, label: i.name })) },
              {
                key: "movement_type",
                label: "Tipo de ajuste",
                type: "select",
                required: true,
                options: [
                  { value: "adjustment_in", label: "Entrada (correccion)" },
                  { value: "adjustment_out", label: "Salida (correccion)" },
                  { value: "waste", label: "Merma / desperdicio" },
                ],
              },
              { key: "quantity", label: "Cantidad", type: "number", step: "0.001", required: true },
              { key: "notes", label: "Motivo", type: "textarea" },
            ]}
            onSubmit={async (payload) => {
              await api.post("/inventory/adjustments", payload);
              setShowForm(false);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
