import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import CrudForm from "../../../components/CrudForm";

export default function OptionGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [addingItemTo, setAddingItemTo] = useState(null);
  const [ingredients, setIngredients] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.get("/option-groups");
    setGroups(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    api.get("/ingredients").then(({ data }) => setIngredients(data));
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Opciones y extras</h1>
      <p className="page-subtitle">Grupos de opciones para armar productos (tamano, extras, salsas...), estilo Subway.</p>

      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowGroupForm(true)}>
          + Nuevo grupo
        </button>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((g) => (
            <div className="card" key={g.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{g.name}</strong>{" "}
                  <span className="badge badge-gray">{g.selection_type === "single" ? "Seleccion unica" : "Seleccion multiple"}</span>{" "}
                  {g.is_required && <span className="badge">Obligatorio</span>}
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setAddingItemTo(g)}>
                  + Opcion
                </button>
              </div>
              <table className="table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Opcion</th>
                    <th>Precio adicional</th>
                    <th>Ingrediente consumido</th>
                  </tr>
                </thead>
                <tbody>
                  {(g.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{Number(item.price_modifier) > 0 ? `+$${Number(item.price_modifier).toFixed(2)}` : "Gratis"}</td>
                      <td>{item.ingredient?.name ? `${item.ingredient.name} (${item.ingredient_quantity})` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {showGroupForm && (
        <Modal title="Nuevo grupo de opciones" onClose={() => setShowGroupForm(false)}>
          <CrudForm
            fields={[
              { key: "name", label: "Nombre (ej: Tamano, Salsas)", required: true },
              {
                key: "selection_type",
                label: "Tipo de seleccion",
                type: "select",
                required: true,
                default: "single",
                options: [
                  { value: "single", label: "Unica (radio)" },
                  { value: "multiple", label: "Multiple (checkbox)" },
                ],
              },
              { key: "is_required", label: "Obligatorio", type: "checkbox" },
              { key: "max_select", label: "Maximo de opciones (solo multiple)", type: "number" },
              { key: "display_order", label: "Orden", type: "number", default: 0 },
            ]}
            onSubmit={async (payload) => {
              await api.post("/option-groups", payload);
              setShowGroupForm(false);
              load();
            }}
          />
        </Modal>
      )}

      {addingItemTo && (
        <Modal title={`Nueva opcion en "${addingItemTo.name}"`} onClose={() => setAddingItemTo(null)}>
          <CrudForm
            fields={[
              { key: "name", label: "Nombre", required: true },
              { key: "price_modifier", label: "Precio adicional (USD)", type: "number", step: "0.01", default: 0 },
              {
                key: "ingredient_id",
                label: "Ingrediente que consume (opcional)",
                type: "select",
                options: ingredients.map((i) => ({ value: i.id, label: i.name })),
              },
              { key: "ingredient_quantity", label: "Cantidad consumida", type: "number", step: "0.001" },
              { key: "display_order", label: "Orden", type: "number", default: 0 },
            ]}
            onSubmit={async (payload) => {
              await api.post(`/option-groups/${addingItemTo.id}/items`, payload);
              setAddingItemTo(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
