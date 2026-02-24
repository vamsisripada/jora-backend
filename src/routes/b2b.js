import { Router } from "express";

import {
  createB2BBulkOrder,
  createB2BInquiry,
  getB2BProfile,
  listB2BBulkOrders,
  registerB2BProfile,
} from "../controllers/b2bController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/inquiry", createB2BInquiry);
router.post("/register", requireAuth, registerB2BProfile);
router.get("/profile", requireAuth, getB2BProfile);
router.post("/orders", requireAuth, createB2BBulkOrder);
router.get("/orders", requireAuth, listB2BBulkOrders);

export default router;
