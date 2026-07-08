import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

import { meRouter } from "./routes/me.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { unitsRouter } from "./routes/units.routes.js";
import { categoriesRouter } from "./routes/categories.routes.js";
import { suppliersRouter } from "./routes/suppliers.routes.js";
import { ingredientsRouter } from "./routes/ingredients.routes.js";
import { expensesRouter } from "./routes/expenses.routes.js";
import { customersRouter } from "./routes/customers.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { recipesRouter } from "./routes/recipes.routes.js";
import { purchasesRouter } from "./routes/purchases.routes.js";
import { inventoryRouter } from "./routes/inventory.routes.js";
import { ordersRouter } from "./routes/orders.routes.js";
import { kitchenRouter } from "./routes/kitchen.routes.js";
import { paymentsRouter } from "./routes/payments.routes.js";
import { cashflowRouter } from "./routes/cashflow.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { exchangeRatesRouter } from "./routes/exchangeRates.routes.js";
import { optionGroupsRouter } from "./routes/optionGroups.routes.js";
import { accountsRouter } from "./routes/accounts.routes.js";

const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => res.json({ ok: true, service: "cerotres-backend" }));

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/units", unitsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/ingredients", ingredientsRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/products", productsRouter);
app.use("/api/recipes", recipesRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/kitchen", kitchenRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/cash-flow-entries", cashflowRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/exchange-rates", exchangeRatesRouter);
app.use("/api/option-groups", optionGroupsRouter);
app.use("/api/accounts", accountsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`03/cerotres backend listening on port ${env.port}`);
});
