import { Router } from "express";

import {
  addAddress,
  getAccount,
  removeAddress,
  updateProfile,
} from "../controllers/accountController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", getAccount);
router.put("/profile", updateProfile);
router.post("/addresses", addAddress);
router.delete("/addresses/:addressId", removeAddress);

export default router;
