import { Router } from "express";

import {
  createProduct,
  deleteProduct,
  getProductBySlug,
  listProducts,
  updateProduct,
} from "../controllers/productsController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", listProducts);
router.get("/:slug", getProductBySlug);
router.post("/", requireAuth, requireRole("admin"), createProduct);
router.put("/:id", requireAuth, requireRole("admin"), updateProduct);
router.delete("/:id", requireAuth, requireRole("admin"), deleteProduct);

export default router;
