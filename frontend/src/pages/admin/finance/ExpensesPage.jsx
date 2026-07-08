import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import CrudPage from "../../../components/CrudPage";

const CATEGORIES = ["rent", "utilities", "salaries", "marketing", "maintenance", "supplies", "delivery", "other"];
const CATEGORY_LABELS = {
  rent: "Alquiler",
  utilities: "Servicios",
  salaries: "Nomina",
  marketing: "Marketing",
  maintenance: "Mantenimiento",
  supplies: "Insumos",
  delivery: "Delivery",
  other: "Otro",
};

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("/accounts").then(({ data }) => {
      setAccounts(data);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <p>Cargando...</p>;

  return (
    <CrudPage
      title="Gastos"
      subtitle="Gastos operativos (no compras de insumos). Cada gasto se registra automaticamente en el cash flow."
      endpoint="/expenses"
      searchable={false}
      canDelete={true}
      columns={[
        { key: "expense_date", label: "Fecha" },
        { key: "category", label: "Categoria", render: (r) => CATEGORY_LABELS[r.category] || r.category },
        { key: "description", label: "Descripcion" },
        { key: "amount", label: "Monto", render: (r) => `$${Number(r.amount).toFixed(2)}` },
      ]}
      fields={[
        { key: "category", label: "Categoria", type: "select", required: true, options: CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })) },
        { key: "description", label: "Descripcion", required: true },
        { key: "amount", label: "Monto (USD)", type: "number", step: "0.01", required: true },
        { key: "expense_date", label: "Fecha", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
        { key: "account_id", label: "Cuenta", type: "select", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
        { key: "is_recurring", label: "Es recurrente", type: "checkbox" },
      ]}
    />
  );
}
