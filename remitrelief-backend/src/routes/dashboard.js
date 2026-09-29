import { Router } from "express";
import { getMyDashboard } from "../services/dashboardService.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getMyDashboard(req.user) });
  })
);

export default router;
