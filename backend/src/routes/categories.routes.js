import { crudRouter } from "../utils/crudRouter.js";

export const categoriesRouter = crudRouter({
  table: "categories",
  searchColumn: "name",
  defaultOrder: { column: "display_order", ascending: true },
  publicRead: true,
});
