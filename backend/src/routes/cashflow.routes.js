import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

// Raw cash flow ledger. Most rows are written automatically (a payment received,
// an expense paid, a purchase received); this also allows manual entries for
// anything else (capital injections, owner withdrawals, misc adjustments).
export const cashflowRouter = Router();
cashflowRouter.use(requireAuth, requireRole("admin", "manager"));

cashflowRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from("cash_flow_entries").select("*").order("entry_date", { ascending: false });
    if (req.query.from) query = query.gte("entry_date", req.query.from);
    if (req.query.to) query = query.lte("entry_date", req.query.to);
    if (req.query.entry_type) query = query.eq("entry_type", req.query.entry_type);
    const { data, error } = await query.limit(300);
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

cashflowRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { entry_type, category, amount, description, entry_date } = req.body;
    if (!["income", "expense"].includes(entry_type)) throw new ApiError(400, "entry_type invalido");
    if (!(Number(amount) > 0)) throw new ApiError(400, "amount debe ser mayor a 0");

    const { data, error } = await supabaseAdmin
      .from("cash_flow_entries")
      .insert({ entry_type, category, amount, description, entry_date, created_by: req.user.id })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.status(201).json({ data });
  })
);
