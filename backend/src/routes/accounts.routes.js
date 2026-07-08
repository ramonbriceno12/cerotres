import { crudRouter } from "../utils/crudRouter.js";

// Financial accounts: cash boxes, bank accounts, digital wallets ("cuentas
// de orden") that payments/expenses/purchase payments are booked against.
export const accountsRouter = crudRouter({
  table: "financial_accounts",
  searchColumn: "name",
  defaultOrder: { column: "name", ascending: true },
});
