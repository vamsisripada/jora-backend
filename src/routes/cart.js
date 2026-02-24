import { Router } from "express";

import {
  addToCart,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from "../controllers/cartController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", getCart);
router.post("/add", addToCart);
router.put("/item/:itemId", updateCartItem);
router.delete("/item/:itemId", removeCartItem);
router.delete("/clear", clearCart);

export default router;
