import { Router } from "express";

import {
  addWishlistItem,
  clearWishlist,
  getWishlist,
  removeWishlistItem,
} from "../controllers/wishlistController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", getWishlist);
router.post("/add", addWishlistItem);
router.delete("/item/:itemId", removeWishlistItem);
router.delete("/clear", clearWishlist);

export default router;
