import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Every figure here is computed in USD (the accounting base currency) so
// sales made in different currencies are always comparable.
export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole("admin", "manager"));

function dayKey(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

reportsRouter.get(
  "/sales",
  asyncHandler(async (req, res) => {
    const from = req.query.from || "1970-01-01";
    const to = req.query.to || new Date().toISOString();

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, total, placed_at, status, items:order_items(quantity, subtotal, product:products(id, name))")
      .neq("status", "cancelled")
      .gte("placed_at", from)
      .lte("placed_at", to);

    const byDay = {};
    const byProduct = {};
    let revenue = 0;
    let orderCount = 0;

    for (const order of orders || []) {
      orderCount += 1;
      revenue += Number(order.total);
      const key = dayKey(order.placed_at);
      byDay[key] = (byDay[key] || 0) + Number(order.total);

      for (const item of order.items || []) {
        const name = item.product?.name || "Otro";
        byProduct[name] = (byProduct[name] || 0) + Number(item.subtotal);
      }
    }

    res.json({
      data: {
        revenue: Number(revenue.toFixed(2)),
        order_count: orderCount,
        average_ticket: orderCount ? Number((revenue / orderCount).toFixed(2)) : 0,
        by_day: Object.entries(byDay).map(([date, total]) => ({ date, total: Number(total.toFixed(2)) })).sort((a, b) => a.date.localeCompare(b.date)),
        by_product: Object.entries(byProduct).map(([name, total]) => ({ name, total: Number(total.toFixed(2)) })).sort((a, b) => b.total - a.total),
      },
    });
  })
);

reportsRouter.get(
  "/profit-loss",
  asyncHandler(async (req, res) => {
    const from = req.query.from || "1970-01-01";
    const to = req.query.to || new Date().toISOString();

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, total")
      .eq("status", "delivered")
      .gte("placed_at", from)
      .lte("placed_at", to);
    const orderIds = (orders || []).map((o) => o.id);
    const revenue = (orders || []).reduce((sum, o) => sum + Number(o.total), 0);

    let cogs = 0;
    if (orderIds.length) {
      const { data: movements } = await supabaseAdmin
        .from("inventory_movements")
        .select("quantity, ingredient:ingredients(cost_per_unit)")
        .eq("movement_type", "sale_out")
        .eq("reference_type", "order")
        .in("reference_id", orderIds);
      cogs = (movements || []).reduce((sum, m) => sum + Number(m.quantity) * Number(m.ingredient?.cost_per_unit || 0), 0);
    }

    const { data: expenses } = await supabaseAdmin.from("expenses").select("amount, category").gte("expense_date", from).lte("expense_date", to);
    const operatingExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
    const expensesByCategory = {};
    for (const e of expenses || []) expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + Number(e.amount);

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - operatingExpenses;

    res.json({
      data: {
        revenue: Number(revenue.toFixed(2)),
        cogs: Number(cogs.toFixed(2)),
        gross_profit: Number(grossProfit.toFixed(2)),
        operating_expenses: Number(operatingExpenses.toFixed(2)),
        expenses_by_category: Object.entries(expensesByCategory).map(([category, total]) => ({ category, total: Number(total.toFixed(2)) })),
        net_profit: Number(netProfit.toFixed(2)),
        margin_pct: revenue ? Number(((netProfit / revenue) * 100).toFixed(2)) : 0,
      },
    });
  })
);

reportsRouter.get(
  "/balance",
  asyncHandler(async (req, res) => {
    const { data: cashEntries } = await supabaseAdmin.from("cash_flow_entries").select("entry_type, amount");
    const cash = (cashEntries || []).reduce((sum, e) => sum + (e.entry_type === "income" ? Number(e.amount) : -Number(e.amount)), 0);

    const { data: ingredients } = await supabaseAdmin.from("ingredients").select("current_stock, cost_per_unit").eq("is_active", true);
    const inventoryValue = (ingredients || []).reduce((sum, i) => sum + Number(i.current_stock) * Number(i.cost_per_unit), 0);

    const { data: payables } = await supabaseAdmin.from("purchases").select("total").eq("status", "pending");
    const accountsPayable = (payables || []).reduce((sum, p) => sum + Number(p.total), 0);

    const totalAssets = cash + inventoryValue;
    const totalLiabilities = accountsPayable;
    const equity = totalAssets - totalLiabilities;

    res.json({
      data: {
        assets: { cash: Number(cash.toFixed(2)), inventory_value: Number(inventoryValue.toFixed(2)), total: Number(totalAssets.toFixed(2)) },
        liabilities: { accounts_payable: Number(accountsPayable.toFixed(2)), total: Number(totalLiabilities.toFixed(2)) },
        equity: Number(equity.toFixed(2)),
        as_of: new Date().toISOString(),
      },
    });
  })
);

reportsRouter.get(
  "/cash-flow",
  asyncHandler(async (req, res) => {
    const from = req.query.from || "1970-01-01";
    const to = req.query.to || new Date().toISOString().slice(0, 10);

    const { data: entries } = await supabaseAdmin
      .from("cash_flow_entries")
      .select("entry_type, category, amount, entry_date")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date", { ascending: true });

    const byDay = {};
    for (const e of entries || []) {
      const key = e.entry_date;
      if (!byDay[key]) byDay[key] = { date: key, income: 0, expense: 0 };
      byDay[key][e.entry_type] += Number(e.amount);
    }

    let running = 0;
    const timeline = Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        running += d.income - d.expense;
        return { ...d, net: Number((d.income - d.expense).toFixed(2)), running_balance: Number(running.toFixed(2)) };
      });

    const totalIncome = (entries || []).filter((e) => e.entry_type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const totalExpense = (entries || []).filter((e) => e.entry_type === "expense").reduce((s, e) => s + Number(e.amount), 0);

    res.json({
      data: {
        total_income: Number(totalIncome.toFixed(2)),
        total_expense: Number(totalExpense.toFixed(2)),
        net: Number((totalIncome - totalExpense).toFixed(2)),
        timeline,
      },
    });
  })
);

// CXC - Cuentas por cobrar: orders the customer still owes money on.
reportsRouter.get(
  "/receivables",
  asyncHandler(async (req, res) => {
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, total, payment_status, placed_at, customer:customers(full_name, phone), payments(amount, status)")
      .in("payment_status", ["pending", "partial"])
      .neq("status", "cancelled")
      .order("placed_at", { ascending: true });

    const data = (orders || []).map((o) => {
      const paid = (o.payments || []).filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
      return {
        order_id: o.id,
        order_number: o.order_number,
        customer: o.customer,
        total: Number(o.total),
        paid: Number(paid.toFixed(2)),
        balance: Number((Number(o.total) - paid).toFixed(2)),
        placed_at: o.placed_at,
      };
    });

    res.json({ data, total_receivable: Number(data.reduce((s, d) => s + d.balance, 0).toFixed(2)) });
  })
);

// CXP - Cuentas por pagar: received purchases still owed to suppliers.
reportsRouter.get(
  "/payables",
  asyncHandler(async (req, res) => {
    const { data: purchases } = await supabaseAdmin
      .from("purchases")
      .select("id, purchase_number, total, payment_status, received_date, supplier:suppliers(name), payments:purchase_payments(amount)")
      .eq("status", "received")
      .in("payment_status", ["pending", "partial"])
      .order("received_date", { ascending: true });

    const data = (purchases || []).map((p) => {
      const paid = (p.payments || []).reduce((s, pay) => s + Number(pay.amount), 0);
      return {
        purchase_id: p.id,
        purchase_number: p.purchase_number,
        supplier: p.supplier,
        total: Number(p.total),
        paid: Number(paid.toFixed(2)),
        balance: Number((Number(p.total) - paid).toFixed(2)),
        received_date: p.received_date,
      };
    });

    res.json({ data, total_payable: Number(data.reduce((s, d) => s + d.balance, 0).toFixed(2)) });
  })
);

// Balance per financial account (cash boxes, banks, wallets).
reportsRouter.get(
  "/accounts-balance",
  asyncHandler(async (req, res) => {
    const { data: accounts } = await supabaseAdmin.from("financial_accounts").select("*").eq("is_active", true);
    const { data: entries } = await supabaseAdmin.from("cash_flow_entries").select("account_id, entry_type, amount").not("account_id", "is", null);

    const data = (accounts || []).map((acc) => {
      const accEntries = (entries || []).filter((e) => e.account_id === acc.id);
      const balance = accEntries.reduce((sum, e) => sum + (e.entry_type === "income" ? Number(e.amount) : -Number(e.amount)), 0);
      return { ...acc, balance_usd: Number(balance.toFixed(2)) };
    });

    res.json({ data });
  })
);

reportsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayOrders } = await supabaseAdmin.from("orders").select("total, status").gte("placed_at", today).neq("status", "cancelled");
    const { data: activeOrders } = await supabaseAdmin.from("orders").select("id").in("status", ["pending", "confirmed", "in_kitchen", "ready", "out_for_delivery"]);
    const { data: lowStock } = await supabaseAdmin.from("ingredients").select("id").eq("is_active", true).filter("current_stock", "lte", "min_stock");

    res.json({
      data: {
        today_revenue: Number((todayOrders || []).reduce((s, o) => s + Number(o.total), 0).toFixed(2)),
        today_order_count: (todayOrders || []).length,
        active_orders: (activeOrders || []).length,
        low_stock_count: (lowStock || []).length,
      },
    });
  })
);
