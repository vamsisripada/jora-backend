import { Router } from "express";

import {
  authenticateIntent,
  confirmIntent,
  createIntent,
  createRefund,
  getIntentById,
  getMethods,
  resendIntentOtp,
  simulateWebhook,
} from "../controllers/paymentGatewayController.js";

const router = Router();

router.get("/methods", getMethods);
router.post("/intents", createIntent);
router.get("/intents/:intentId", getIntentById);
router.post("/intents/:intentId/confirm", confirmIntent);
router.post("/intents/:intentId/authenticate", authenticateIntent);
router.post("/intents/:intentId/resend-otp", resendIntentOtp);
router.post("/refunds", createRefund);
router.post("/webhooks/simulate", simulateWebhook);

export default router;
