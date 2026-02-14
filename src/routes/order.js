import express from "express";
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
} from "../controllers/orderController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Get all orders for current user
router.get("/", getOrders);

// Get specific order
router.get("/:orderId", getOrderById);

// Create new order
router.post("/", createOrder);

// Update order status (admin or user can cancel)
router.put("/:orderId/status", updateOrderStatus);

// Cancel order
router.delete("/:orderId/cancel", cancelOrder);

export default router;
