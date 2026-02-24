import { Router } from "express";

import {
  cancelOrder,
  createGuestOrder,
  createOrder,
  createOrderFromItems,
  getMyOrders,
  getOrderById,
} from "../controllers/ordersController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/guest", createGuestOrder);

router.use(requireAuth);
router.post("/", createOrder);
router.post("/from-items", createOrderFromItems);
router.get("/", getMyOrders);
router.get("/:id", getOrderById);
router.post("/:id/cancel", cancelOrder);

export default router;
