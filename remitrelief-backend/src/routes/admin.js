import { Router } from "express";
import {
  listRecentAudits,
  getAdminIndexerStatus,
  runAdminIndexer,
} from "../services/adminService.js";
import { requireRole } from "../middleware/auth.js";
import { Roles } from "../auth/roles.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

router.get(
  "/audits",
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const audits = await listRecentAudits(req.user, { limit: req.query.limit });
    res.json({ success: true, data: audits });
  })
);

router.get(
  "/indexer",
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const status = await getAdminIndexerStatus(req.user);
    res.json({ success: true, data: status });
  })
);

router.post(
  "/indexer/run",
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const summary = await runAdminIndexer(req.user, req.body || {});
    res.json({ success: true, data: summary });
  })
);

export default router;
