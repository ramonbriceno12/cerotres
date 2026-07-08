import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";

// Public read (storefront needs rates to show converted prices), admin-only write.
export const exchangeRatesRouter = Router();

exchangeRatesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("exchange_rates").select("*").order("currency", { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);

exchangeRatesRouter.patch(
  "/:currency",
  requireAuth,
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { rate } = req.body;
    if (req.params.currency === "USD") throw new ApiError(400, "USD es la moneda base, su tasa siempre es 1");
    if (!(Number(rate) > 0)) throw new ApiError(400, "rate debe ser mayor a 0");

    const { data, error } = await supabaseAdmin
      .from("exchange_rates")
      .update({ rate, updated_by: req.user.id })
      .eq("currency", req.params.currency)
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  })
);
