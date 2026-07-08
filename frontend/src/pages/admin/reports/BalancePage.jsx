import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function BalancePage() {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    api.get("/reports/balance").then(({ data }) => setBalance(data));
  }, []);

  if (!balance) return <p>Cargando...</p>;

  return (
    <div>
      <h1 className="page-title">Balance general</h1>
      <p className="page-subtitle">Al {new Date(balance.as_of).toLocaleString("es-VE")}</p>

      <div className="grid grid-2" style={{ maxWidth: 700 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Activos</h3>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Caja / cuentas</span>
            <span>${balance.assets.cash.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Valor de inventario</span>
            <span>${balance.assets.inventory_value.toFixed(2)}</span>
          </div>
          <hr />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>Total activos</span>
            <span>${balance.assets.total.toFixed(2)}</span>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pasivos</h3>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Cuentas por pagar</span>
            <span>${balance.liabilities.accounts_payable.toFixed(2)}</span>
          </div>
          <hr />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>Total pasivos</span>
            <span>${balance.liabilities.total.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18, marginTop: 12 }}>
            <span>Patrimonio</span>
            <span>${balance.equity.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
