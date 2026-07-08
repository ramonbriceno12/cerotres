import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";

function ProductForm({ initial, categories, optionGroups, onSubmit, onCancel }) {
  const [values, setValues] = useState(
    initial || { name: "", description: "", category_id: "", base_price: 0, image_url: "", track_inventory: false, is_active: true }
  );
  const [selectedGroups, setSelectedGroups] = useState(new Set((initial?.option_groups || []).map((g) => g.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setValues((v) => ({ ...v, [key]: val }));

  const toggleGroup = (id) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({ ...values, base_price: Number(values.base_price), option_group_ids: [...selectedGroups] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label className="label">Nombre *</label>
        <input className="input" required value={values.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Descripcion</label>
        <textarea className="input" rows={2} value={values.description || ""} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Categoria</label>
        <select className="input" value={values.category_id || ""} onChange={(e) => set("category_id", e.target.value)}>
          <option value="">Sin categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label">Precio base (USD) *</label>
        <input className="input" type="number" step="0.01" required value={values.base_price} onChange={(e) => set("base_price", e.target.value)} />
      </div>
      <div className="field">
        <label className="label">URL de imagen</label>
        <input className="input" value={values.image_url || ""} onChange={(e) => set("image_url", e.target.value)} />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={!!values.track_inventory} onChange={(e) => set("track_inventory", e.target.checked)} /> Descontar
          inventario segun receta
        </label>
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={!!values.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Activo en el menu
        </label>
      </div>

      <div className="field">
        <label className="label">Grupos de opciones (tamano, extras, salsas...)</label>
        {optionGroups.map((g) => (
          <label key={g.id} style={{ display: "block", padding: "4px 0" }}>
            <input type="checkbox" checked={selectedGroups.has(g.id)} onChange={() => toggleGroup(g.id)} /> {g.name}
          </label>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Guardar"}
      </button>
      {onCancel && (
        <button type="button" className="btn btn-outline" style={{ marginLeft: 8 }} onClick={onCancel}>
          Cancelar
        </button>
      )}
    </form>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [optionGroups, setOptionGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c, g] = await Promise.all([api.get("/products"), api.get("/categories"), api.get("/option-groups")]);
    setProducts(p.data);
    setCategories(c.data);
    setOptionGroups(g.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Productos</h1>
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nuevo producto
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 20 }}>Cargando...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoria</th>
                <th>Precio base</th>
                <th>Opciones</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category?.name}</td>
                  <td>${Number(p.base_price).toFixed(2)}</td>
                  <td>{p.option_groups?.map((g) => g.name).join(", ")}</td>
                  <td>{p.is_active ? "Si" : "No"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(p)}>
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
        <Modal title="Nuevo producto" onClose={() => setShowForm(false)} width={560}>
          <ProductForm
            categories={categories}
            optionGroups={optionGroups}
            onSubmit={async (payload) => {
              await api.post("/products", payload);
              setShowForm(false);
              load();
            }}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar producto" onClose={() => setEditing(null)} width={560}>
          <ProductForm
            initial={editing}
            categories={categories}
            optionGroups={optionGroups}
            onSubmit={async (payload) => {
              await api.patch(`/products/${editing.id}`, payload);
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
