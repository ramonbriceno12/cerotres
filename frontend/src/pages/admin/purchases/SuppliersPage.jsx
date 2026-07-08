import CrudPage from "../../../components/CrudPage";

export default function SuppliersPage() {
  return (
    <CrudPage
      title="Proveedores"
      endpoint="/suppliers"
      columns={[
        { key: "name", label: "Nombre" },
        { key: "contact_name", label: "Contacto" },
        { key: "phone", label: "Telefono" },
        { key: "email", label: "Correo" },
      ]}
      fields={[
        { key: "name", label: "Nombre", required: true },
        { key: "contact_name", label: "Persona de contacto" },
        { key: "phone", label: "Telefono" },
        { key: "email", label: "Correo", type: "email" },
        { key: "address", label: "Direccion" },
        { key: "notes", label: "Notas", type: "textarea" },
      ]}
    />
  );
}
