import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import Modal from "./Modal";
import CrudForm from "./CrudForm";

/**
 * Generic list + create/edit modal + delete for simple reference-data
 * endpoints (units, categories, suppliers, ingredients, expenses...).
 */
export default function CrudPage({ title, subtitle, endpoint, columns, fields, searchable = true, canDelete = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const { data } = await api.get(`${endpoint}${query}`);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [endpoint, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (payload) => {
    await api.post(endpoint, payload);
    setShowForm(false);
    load();
  };

  const handleUpdate = async (payload) => {
    await api.patch(`${endpoint}/${editing.id}`, payload);
    setEditing(null);
    load();
  };

  const handleDelete = async (row) => {
    if (!confirm(`Eliminar "${row[columns[0].key]}"?`)) return;
    await api.delete(`${endpoint}/${row.id}`);
    load();
  };

  return (
    <div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}

      <div className="toolbar">
        {searchable && (
          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        )}
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nuevo
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 20 }}>Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="empty-state">Sin registros todavia.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
                  ))}
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(row)}>
                      Editar
                    </button>{" "}
                    {canDelete && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title={`Nuevo ${title}`} onClose={() => setShowForm(false)}>
          <CrudForm fields={fields} onSubmit={handleCreate} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Editar ${title}`} onClose={() => setEditing(null)}>
          <CrudForm fields={fields} initial={editing} onSubmit={handleUpdate} submitLabel="Actualizar" />
        </Modal>
      )}
    </div>
  );
}
