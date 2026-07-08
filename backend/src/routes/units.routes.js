import { crudRouter } from "../utils/crudRouter.js";

export const unitsRouter = crudRouter({
  table: "units",
  searchColumn: "name",
  defaultOrder: { column: "name", ascending: true },
  softDeleteColumn: null,
  publicRead: true,
});
