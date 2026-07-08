import { crudRouter } from "../utils/crudRouter.js";

export const suppliersRouter = crudRouter({
  table: "suppliers",
  searchColumn: "name",
  defaultOrder: { column: "name", ascending: true },
});
