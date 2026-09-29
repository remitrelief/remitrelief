import { Router } from "express";
import {
  getUnreadCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationsService.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { createMutationLimiter } from "../middleware/rateLimit.js";

const router = Router();
router.use(requireAuth);
router.use(createMutationLimiter("notification"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await listMyNotifications(req.user, {
      unreadOnly: req.query.unread === "true" || req.query.unread === "1",
      limit: req.query.limit,
    });
    res.json({ success: true, data });
  })
);

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getUnreadCount(req.user) });
  })
);

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await markAllNotificationsRead(req.user) });
  })
);

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await markNotificationRead(req.params.id, req.user) });
  })
);

export default router;
