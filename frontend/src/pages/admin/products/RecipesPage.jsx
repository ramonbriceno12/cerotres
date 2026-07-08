import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";

function RecipeForm({ initial, products, units, ingredients, onSubmit, onClose }) {
  const [productId, setProductId] = useState(initial?.product_id || "");
  const [name, setName] = useState(initial?.name || "");
  const [yieldQty, setYieldQty] = useState(initial?.yield_quantity || 1);
  const [rows, setRows] = useState(
    initial?.ingredients?.map((i) => ({ ingredient_id: i.ingredient_id, quantity: i.quantity, unit_id: i.unit_id })) || [
      { ingredient_id: "", quantity: "", unit_id: "" },
    ]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateRow = (idx, key, val) => setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
  const addRow = () => setRows((r) => [...r, { ingredient_id: "", quantity: "", unit_id: "" }]);
  const removeRow = (idx) => setRows((r) => r.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        product_id: productId,
        name,
        yield_quantity: Number(yieldQty),
        ingredients: rows.filter((r) => r.ingredient_id && r.quantity).map((r) => ({ ...r, quantity: Number(r.quantity) })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label className="label">Producto *</label>
        <select className="input" required value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">Nombre de la receta *</label>
        <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Rinde (unidades de producto)</label>
        <input className="input" type="number" step="0.01" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} />
      </div>

      <label className="label">Ingredientes</label>
      {rows.map((row, idx) => (
        <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <select className="input" value={row.ingredient_id} onChange={(e) => updateRow(idx, "ingredient_id", e.target.value)}>
            <option value="">Ingrediente...</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 90 }}
            type="number"
            step="0.001"
            placeholder="Cant."
            value={row.quantity}
            onChange={(e) => updateRow(idx, "quantity", e.target.value)}
          />
          <select className="input" style={{ width: 90 }} value={row.unit_id} onChange={(e) => updateRow(idx, "unit_id", e.target.value)}>
            <option value="">Unidad</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.abbreviation}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => removeRow(idx)}>
            X
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={addRow}>
        + Ingrediente
      </button>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar receta"}
        </button>
      </div>
    </form>
  );
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, p, u, i] = await Promise.all([api.get("/recipes"), api.get("/products"), api.get("/units"), api.get("/ingredients")]);
    setRecipes(r.data);
    setProducts(p.data);
    setUnits(u.data);
    setIngredients(i.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Recetas</h1>
      <p className="page-subtitle">Bill of materials por producto - alimenta el costo y el descuento de inventario.</p>

      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nueva receta
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 20 }}>Cargando...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Receta</th>
                <th>Costo estimado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <tr key={r.id}>
                  <td>{r.product?.name}</td>
                  <td>{r.name}</td>
                  <td>${r.estimated_cost.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(r)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title="Nueva receta" onClose={() => setShowForm(false)} width={560}>
          <RecipeForm
            products={products}
            units={units}
            ingredients={ingredients}
            onSubmit={async (payload) => {
              await api.post("/recipes", payload);
              setShowForm(false);
              load();
            }}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar receta" onClose={() => setEditing(null)} width={560}>
          <RecipeForm
            initial={editing}
            products={products}
            units={units}
            ingredients={ingredients}
            onSubmit={async (payload) => {
              await api.patch(`/recipes/${editing.id}`, payload);
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
