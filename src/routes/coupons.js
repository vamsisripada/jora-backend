import { Router } from "express";

import { createCoupon, getCoupons, validateCoupon } from "../controllers/couponsController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.post("/validate", validateCoupon);
router.get("/", requireAuth, requireRole("admin"), getCoupons);
router.post("/", requireAuth, requireRole("admin"), createCoupon);

export default router;
