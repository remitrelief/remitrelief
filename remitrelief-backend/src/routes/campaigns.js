import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  campaignDetail,
  campaignStats,
  createCampaignAction,
  createMediaAction,
  createMilestoneAction,
  createUpdateAction,
  deleteCampaignAction,
  deleteMediaAction,
  discoverCampaigns,
  listUpdatesAction,
  myCampaigns,
  submitCampaignAction,
  transitionCampaignAction,
  updateCampaignAction,
  updateUpdateAction,
  updateMilestoneAction,
} from "../controllers/campaignController.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { Roles } from "../auth/roles.js";

const router = Router();

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many campaign requests", code: "RATE_LIMITED" },
});

router.get("/", asyncHandler(discoverCampaigns));
router.get("/meta/stats", asyncHandler(campaignStats));
router.get("/mine", requireAuth, asyncHandler(myCampaigns));
router.post("/", mutationLimiter, requireAuth, asyncHandler(createCampaignAction));
router.get("/:id", optionalAuth, asyncHandler(campaignDetail));
router.patch("/:id", mutationLimiter, requireAuth, asyncHandler(updateCampaignAction));
router.delete("/:id", mutationLimiter, requireAuth, asyncHandler(deleteCampaignAction));
router.post("/:id/submit", mutationLimiter, requireAuth, asyncHandler(submitCampaignAction));
router.post(
  "/:id/transitions/:status",
  mutationLimiter,
  requireRole(Roles.ADMIN),
  asyncHandler(transitionCampaignAction)
);
router.post(
  "/:id/milestones",
  mutationLimiter,
  requireAuth,
  asyncHandler(createMilestoneAction)
);
router.patch(
  "/:id/milestones/:milestoneId",
  mutationLimiter,
  requireAuth,
  asyncHandler(updateMilestoneAction)
);
router.get("/:id/updates", optionalAuth, asyncHandler(listUpdatesAction));
router.post(
  "/:id/updates",
  mutationLimiter,
  requireAuth,
  asyncHandler(createUpdateAction)
);
router.patch(
  "/:id/updates/:updateId",
  mutationLimiter,
  requireAuth,
  asyncHandler(updateUpdateAction)
);
router.post("/:id/media", mutationLimiter, requireAuth, asyncHandler(createMediaAction));
router.delete(
  "/:id/media/:mediaId",
  mutationLimiter,
  requireAuth,
  asyncHandler(deleteMediaAction)
);

export default router;
