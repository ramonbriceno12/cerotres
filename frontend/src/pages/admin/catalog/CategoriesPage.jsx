import CrudPage from "../../../components/CrudPage";

export default function CategoriesPage() {
  return (
    <CrudPage
      title="Categorias"
      endpoint="/categories"
      columns={[
        { key: "name", label: "Nombre" },
        { key: "description", label: "Descripcion" },
        { key: "display_order", label: "Orden" },
        { key: "is_active", label: "Activa", render: (r) => (r.is_active ? "Si" : "No") },
      ]}
      fields={[
        { key: "name", label: "Nombre", required: true },
        { key: "description", label: "Descripcion", type: "textarea" },
        { key: "display_order", label: "Orden", type: "number", default: 0 },
      ]}
    />
  );
}
