import { Router } from "express";

import { createCategory, getCategories } from "../controllers/categoriesController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", getCategories);
router.post("/", requireAuth, requireRole("admin"), createCategory);

export default router;
