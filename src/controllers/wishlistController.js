import { getDb } from "../config/db.js";
import { ensureWishlist } from "../utils/sql.js";

const fetchWishlist = async (userId) => {
  const db = getDb();
  const wishlistId = await ensureWishlist(userId);

  const [rows] = await db.execute(
    `
      SELECT
        wi.id,
        pv.id AS variantId,
        pv.size,
        pv.color,
        pv.imageUrl,
        p.id AS productId,
        p.slug AS productSlug,
        p.name,
        p.mrp,
        p.discountPercent,
        pv.priceOverride
      FROM wishlistItems wi
      INNER JOIN productVariants pv ON pv.id = wi.variantId
      INNER JOIN products p ON p.id = pv.productId
      WHERE wi.wishlistId = ?
      ORDER BY wi.createdAt DESC
    `,
    [wishlistId]
  );

  const items = rows.map((row) => {
    const basePrice = row.priceOverride == null ? Number(row.mrp) : Number(row.priceOverride);
    const effectivePrice = basePrice - (basePrice * Number(row.discountPercent || 0)) / 100;

    return {
      id: String(row.id),
      productId: String(row.productId),
      productSlug: row.productSlug,
      name: row.name,
      price: Number(effectivePrice.toFixed(2)),
      image: row.imageUrl,
      size: row.size,
      color: row.color,
      variantId: Number(row.variantId),
    };
  });

  return {
    id: String(wishlistId),
    userId: String(userId),
    items,
  };
};

export const getWishlist = async (req, res, next) => {
  try {
    const wishlist = await fetchWishlist(req.user.id);
    return res.json({ wishlist });
  } catch (error) {
    return next(error);
  }
};

export const addWishlistItem = async (req, res, next) => {
  try {
    const db = getDb();
    const { variantId } = req.body;

    if (!variantId) {
      return res.status(400).json({ message: "variantId is required" });
    }

    const wishlistId = await ensureWishlist(req.user.id);
    await db.execute(
      `
        INSERT IGNORE INTO wishlistItems (wishlistId, variantId)
        VALUES (?, ?)
      `,
      [wishlistId, variantId]
    );

    const wishlist = await fetchWishlist(req.user.id);
    return res.status(201).json({ wishlist });
  } catch (error) {
    return next(error);
  }
};

export const removeWishlistItem = async (req, res, next) => {
  try {
    const db = getDb();

    await db.execute(
      `
        DELETE wi
        FROM wishlistItems wi
        INNER JOIN wishlists w ON w.id = wi.wishlistId
        WHERE wi.id = ? AND w.userId = ?
      `,
      [req.params.itemId, req.user.id]
    );

    const wishlist = await fetchWishlist(req.user.id);
    return res.json({ wishlist });
  } catch (error) {
    return next(error);
  }
};

export const clearWishlist = async (req, res, next) => {
  try {
    const db = getDb();

    await db.execute(
      `
        DELETE wi
        FROM wishlistItems wi
        INNER JOIN wishlists w ON w.id = wi.wishlistId
        WHERE w.userId = ?
      `,
      [req.user.id]
    );

    const wishlist = await fetchWishlist(req.user.id);
    return res.json({ wishlist });
  } catch (error) {
    return next(error);
  }
};
