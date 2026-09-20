import { Router } from "express";
import {
  createOrganization,
  listMyOrganizations,
  listPendingOrganizations,
  setOrganizationStatus,
} from "../services/organizationsService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Roles } from "../auth/roles.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const organizations = await listMyOrganizations(req.user);
    res.json({ success: true, data: organizations });
  })
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const organization = await createOrganization(req.body || {}, req.user);
    res.status(201).json({ success: true, data: organization });
  })
);

router.get(
  "/pending",
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const organizations = await listPendingOrganizations(req.user);
    res.json({ success: true, data: organizations });
  })
);

router.post(
  "/:id/status",
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const organization = await setOrganizationStatus(
      req.params.id,
      req.body?.status,
      req.user
    );
    res.json({ success: true, data: organization });
  })
);

export default router;
