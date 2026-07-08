import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import CrudForm from "../../../components/CrudForm";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    const { data } = await api.get(`/customers${query}`);
    setCustomers(data);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const fields = [
    { key: "full_name", label: "Nombre completo", required: true },
    { key: "cedula", label: "Cedula" },
    { key: "phone", label: "Telefono", required: true },
    { key: "email", label: "Correo", type: "email" },
    { key: "instagram_handle", label: "Instagram" },
    { key: "notes", label: "Notas", type: "textarea" },
  ];

  return (
    <div>
      <h1 className="page-title">Clientes</h1>

      <div className="toolbar">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar por nombre, telefono, cedula..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nuevo cliente
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 20 }}>Cargando...</p>
        ) : customers.length === 0 ? (
          <p className="empty-state">Sin clientes todavia.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cedula</th>
                <th>Telefono</th>
                <th>Correo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/admin/ventas?customer_id=${c.id}`}>{c.full_name}</Link>
                  </td>
                  <td>{c.cedula}</td>
                  <td>{c.phone}</td>
                  <td>{c.email}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(c)}>
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
        <Modal title="Nuevo cliente" onClose={() => setShowForm(false)}>
          <CrudForm
            fields={fields}
            onSubmit={async (payload) => {
              await api.post("/customers", payload);
              setShowForm(false);
              load();
            }}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar cliente" onClose={() => setEditing(null)}>
          <CrudForm
            fields={fields}
            initial={editing}
            submitLabel="Actualizar"
            onSubmit={async (payload) => {
              await api.patch(`/customers/${editing.id}`, payload);
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
