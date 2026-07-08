import CrudPage from "../../../components/CrudPage";

export default function UnitsPage() {
  return (
    <CrudPage
      title="Unidades"
      endpoint="/units"
      canDelete={false}
      columns={[
        { key: "name", label: "Nombre" },
        { key: "abbreviation", label: "Abreviatura" },
        { key: "unit_type", label: "Tipo" },
      ]}
      fields={[
        { key: "name", label: "Nombre", required: true },
        { key: "abbreviation", label: "Abreviatura", required: true },
        {
          key: "unit_type",
          label: "Tipo",
          type: "select",
          required: true,
          options: [
            { value: "weight", label: "Peso" },
            { value: "volume", label: "Volumen" },
            { value: "count", label: "Unidad/conteo" },
          ],
        },
      ]}
    />
  );
}
