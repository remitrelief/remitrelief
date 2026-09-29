import rateLimit from "express-rate-limit";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Per-router limiter for state-changing requests (reads are never counted).
 * Each call creates an independent counter, so mount one per router.
 */
export function createMutationLimiter(label, { windowMs = 15 * 60 * 1000, max = 120 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => READ_METHODS.has(req.method),
    message: { error: `Too many ${label} requests`, code: "RATE_LIMITED" },
  });
}
