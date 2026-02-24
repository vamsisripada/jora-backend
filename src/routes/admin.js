import { Router } from "express";

import {
  exportInventoryCsv,
  generateInvoice,
  generateShippingLabel,
  getCustomerBehavior,
  getDashboardSummary,
  getProductPerformance,
  getSalesReport,
  getTaxGstReport,
  listB2BInquiries,
  listContactMessages,
  listOrders,
  processRefund,
  updateOrderStatus,
} from "../controllers/adminController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/dashboard", getDashboardSummary);
router.get("/reports/sales", getSalesReport);
router.get("/reports/tax-gst", getTaxGstReport);
router.get("/reports/customer-behavior", getCustomerBehavior);
router.get("/reports/product-performance", getProductPerformance);
router.get("/b2b-inquiries", listB2BInquiries);
router.get("/contact-messages", listContactMessages);
router.get("/orders", listOrders);
router.patch("/orders/:orderId/status", updateOrderStatus);
router.post("/orders/:orderId/refund", processRefund);
router.get("/orders/:orderId/invoice", generateInvoice);
router.get("/orders/:orderId/shipping-label", generateShippingLabel);
router.get("/inventory/export-csv", exportInventoryCsv);

export default router;
