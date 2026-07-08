import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import CrudPage from "../../../components/CrudPage";

export default function IngredientsPage() {
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/units"), api.get("/suppliers")]).then(([u, s]) => {
      setUnits(u.data);
      setSuppliers(s.data);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <p>Cargando...</p>;

  return (
    <CrudPage
      title="Ingredientes"
      subtitle="Materia prima usada en recetas y extras. El stock solo cambia por compras, ajustes o ventas."
      endpoint="/ingredients"
      columns={[
        { key: "name", label: "Nombre" },
        { key: "unit", label: "Unidad", render: (r) => r.unit?.abbreviation },
        { key: "cost_per_unit", label: "Costo/unidad", render: (r) => `$${Number(r.cost_per_unit).toFixed(4)}` },
        { key: "current_stock", label: "Stock actual" },
        { key: "min_stock", label: "Stock minimo" },
      ]}
      fields={[
        { key: "name", label: "Nombre", required: true },
        { key: "unit_id", label: "Unidad", type: "select", required: true, options: units.map((u) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` })) },
        { key: "default_supplier_id", label: "Proveedor habitual", type: "select", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
        { key: "cost_per_unit", label: "Costo por unidad", type: "number", step: "0.0001", default: 0 },
        { key: "min_stock", label: "Stock minimo", type: "number", step: "0.001", default: 0 },
        { key: "initial_stock", label: "Stock inicial (solo al crear)", type: "number", step: "0.001", default: 0 },
      ]}
    />
  );
}
