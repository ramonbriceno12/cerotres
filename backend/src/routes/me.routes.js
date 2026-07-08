import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const meRouter = Router();

meRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: req.user });
  })
);
