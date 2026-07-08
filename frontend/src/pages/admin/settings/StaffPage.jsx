import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import CrudForm from "../../../components/CrudForm";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "manager", label: "Gerente" },
  { value: "kitchen", label: "Cocina" },
  { value: "delivery", label: "Delivery" },
];

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.get("/settings/staff");
    setStaff(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Personal</h1>
      <p className="page-subtitle">Cuentas del equipo (administracion, gerencia, cocina, delivery).</p>

      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nuevo usuario
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
                <th>Rol</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.full_name}</td>
                  <td>{ROLES.find((r) => r.value === s.role)?.label || s.role}</td>
                  <td>{s.is_active ? "Si" : "No"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(s)}>
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
        <Modal title="Nuevo usuario" onClose={() => setShowForm(false)}>
          <CrudForm
            fields={[
              { key: "full_name", label: "Nombre completo", required: true },
              { key: "email", label: "Correo", type: "email", required: true },
              { key: "password", label: "Contrasena inicial", type: "password", required: true },
              { key: "phone", label: "Telefono" },
              { key: "role", label: "Rol", type: "select", required: true, options: ROLES },
            ]}
            onSubmit={async (payload) => {
              await api.post("/settings/staff", payload);
              setShowForm(false);
              load();
            }}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar usuario" onClose={() => setEditing(null)}>
          <CrudForm
            fields={[
              { key: "full_name", label: "Nombre completo", required: true },
              { key: "phone", label: "Telefono" },
              { key: "role", label: "Rol", type: "select", required: true, options: ROLES },
              { key: "is_active", label: "Activo", type: "checkbox" },
            ]}
            initial={editing}
            submitLabel="Actualizar"
            onSubmit={async (payload) => {
              await api.patch(`/settings/staff/${editing.id}`, payload);
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
