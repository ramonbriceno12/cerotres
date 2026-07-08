import CrudPage from "../../../components/CrudPage";

export default function AccountsPage() {
  return (
    <CrudPage
      title="Cuentas"
      subtitle="Cajas, cuentas bancarias y billeteras digitales donde entra y sale el dinero."
      endpoint="/accounts"
      columns={[
        { key: "name", label: "Nombre" },
        { key: "account_type", label: "Tipo" },
        { key: "currency", label: "Moneda" },
        { key: "account_number", label: "Numero / referencia" },
      ]}
      fields={[
        { key: "name", label: "Nombre", required: true },
        {
          key: "account_type",
          label: "Tipo",
          type: "select",
          required: true,
          options: [
            { value: "cash", label: "Efectivo" },
            { value: "bank", label: "Banco" },
            { value: "digital_wallet", label: "Billetera digital" },
            { value: "other", label: "Otro" },
          ],
        },
        {
          key: "currency",
          label: "Moneda",
          type: "select",
          required: true,
          default: "USD",
          options: [
            { value: "USD", label: "USD" },
            { value: "EUR", label: "EUR" },
            { value: "VES", label: "Bs." },
          ],
        },
        { key: "account_number", label: "Numero / referencia" },
      ]}
    />
  );
}
