import { Router } from "express";
import {
  getMyVerification,
  submitVerificationRequest,
  listPendingVerifications,
  reviewVerificationRequest,
} from "../services/verificationService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Roles } from "../auth/roles.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await getMyVerification(req.user);
    res.json({ success: true, data });
  })
);

router.post(
  "/request",
  requireAuth,
  asyncHandler(async (req, res) => {
    const request = await submitVerificationRequest(req.body || {}, req.user);
    res.status(201).json({ success: true, data: request });
  })
);

router.get(
  "/pending",
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const requests = await listPendingVerifications(req.user);
    res.json({ success: true, data: requests });
  })
);

router.post(
  "/:id/review",
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const updated = await reviewVerificationRequest(req.params.id, req.body || {}, req.user);
    res.json({ success: true, data: updated });
  })
);

export default router;
