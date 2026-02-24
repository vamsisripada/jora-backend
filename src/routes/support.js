import { Router } from "express";

import {
  createContactMessage,
  subscribeNewsletter,
} from "../controllers/supportController.js";

const router = Router();

router.post("/contact", createContactMessage);
router.post("/newsletter", subscribeNewsletter);

export default router;
