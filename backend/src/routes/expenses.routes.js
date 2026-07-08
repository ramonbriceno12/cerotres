import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

// Operating expenses (rent, utilities, salaries...). Every expense also
// writes a cash_flow_entries row so the cash flow report stays in sync.
export const expensesRouter = Router();
expensesRouter.use(requireAuth, requireRole("admin", "manager"));

expensesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("expenses").select("*").order("expense_date", { ascending: false });
    if (req.query.from) query = query.gte("expense_date", req.query.from);
    if (req.query.to) query = query.lte("expense_date", req.query.to);
    if (req.query.category) query = query.eq("category", req.query.category);
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

expensesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("expenses")
      .insert({ ...req.body, created_by: req.user.id })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);

    await supabaseAdmin.from("cash_flow_entries").insert({
      entry_type: "expense",
      category: data.category,
      amount: data.amount,
      description: data.description,
      entry_date: data.expense_date,
      related_expense_id: data.id,
      account_id: data.account_id,
      created_by: req.user.id,
    });

    res.status(201).json({ data });
  })
);

expensesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("expenses").update(req.body).eq("id", req.params.id).select("*").single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

expensesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("expenses").delete().eq("id", req.params.id);
    if (error) throw new ApiError(400, error.message);
    res.json({ data: { deleted: true } });
  })
);
