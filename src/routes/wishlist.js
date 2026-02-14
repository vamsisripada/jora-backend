import { Router } from "express";

import {
  addToWishlist,
  clearWishlist,
  getWishlist,
  removeFromWishlist,
} from "../controllers/wishlistController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// All wishlist routes require authentication
router.use(requireAuth);

router.get("/", getWishlist);
router.post("/add", addToWishlist);
router.delete("/item/:itemId", removeFromWishlist);
router.delete("/clear", clearWishlist);

export default router;
