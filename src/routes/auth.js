import { Router } from "express";

import {
  login,
  logout,
  me,
  refreshToken,
  register,
  verifyEmail,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import {
  loginValidation,
  refreshTokenValidation,
  registerValidation,
} from "../utils/validators.js";

const router = Router();

router.post("/register", registerValidation, register);
router.post("/verify", verifyEmail);
router.post("/login", loginValidation, login);
router.post("/refresh-token", refreshTokenValidation, refreshToken);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);

export default router;
