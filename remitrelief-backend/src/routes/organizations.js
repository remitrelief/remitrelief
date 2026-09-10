import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { organizationsRepo } from "../repositories/index.js";

const router = Router();

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const organizations = await organizationsRepo.listForUser(req.user.id);
    res.json({ success: true, data: organizations });
  })
);

export default router;
