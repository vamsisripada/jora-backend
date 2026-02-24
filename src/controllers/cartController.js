import { getDb } from "../config/db.js";
import { ensureCart } from "../utils/sql.js";

const fetchCart = async (userId) => {
  const db = getDb();
  const cartId = await ensureCart(userId);

  const [rows] = await db.execute(
    `
      SELECT
        ci.id,
        ci.quantity,
        pv.id AS variantId,
        pv.size,
        pv.color,
        pv.imageUrl,
        pv.stockQuantity,
        p.id AS productId,
        p.slug AS productSlug,
        p.name,
        p.mrp,
        p.discountPercent,
        pv.priceOverride
      FROM cartItems ci
      INNER JOIN productVariants pv ON pv.id = ci.variantId
      INNER JOIN products p ON p.id = pv.productId
      WHERE ci.cartId = ?
      ORDER BY ci.updatedAt DESC
    `,
    [cartId]
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
      quantity: Number(row.quantity),
      size: row.size,
      color: row.color,
      variantId: Number(row.variantId),
      availableStock: Number(row.stockQuantity),
    };
  });

  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    id: String(cartId),
    userId: String(userId),
    items,
    totalAmount: Number(totalAmount.toFixed(2)),
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
  };
};

export const getCart = async (req, res, next) => {
  try {
    const cart = await fetchCart(req.user.id);
    return res.json({ cart });
  } catch (error) {
    return next(error);
  }
};

export const addToCart = async (req, res, next) => {
  try {
    const db = getDb();
    const { variantId, quantity = 1 } = req.body;

    if (!variantId) {
      return res.status(400).json({ message: "variantId is required" });
    }

    const [variantRows] = await db.execute(
      "SELECT id, stockQuantity FROM productVariants WHERE id = ? LIMIT 1",
      [variantId]
    );

    if (!variantRows.length) {
      return res.status(404).json({ message: "Variant not found" });
    }

    const cartId = await ensureCart(req.user.id);

    await db.execute(
      `
        INSERT INTO cartItems (cartId, variantId, quantity)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
      `,
      [cartId, variantId, Number(quantity)]
    );

    const cart = await fetchCart(req.user.id);
    return res.status(201).json({ cart });
  } catch (error) {
    return next(error);
  }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const db = getDb();
    const { quantity } = req.body;

    if (!quantity || Number(quantity) < 1) {
      return res.status(400).json({ message: "quantity must be at least 1" });
    }

    await db.execute(
      `
        UPDATE cartItems ci
        INNER JOIN carts c ON c.id = ci.cartId
        SET ci.quantity = ?
        WHERE ci.id = ? AND c.userId = ?
      `,
      [Number(quantity), req.params.itemId, req.user.id]
    );

    const cart = await fetchCart(req.user.id);
    return res.json({ cart });
  } catch (error) {
    return next(error);
  }
};

export const removeCartItem = async (req, res, next) => {
  try {
    const db = getDb();

    await db.execute(
      `
        DELETE ci
        FROM cartItems ci
        INNER JOIN carts c ON c.id = ci.cartId
        WHERE ci.id = ? AND c.userId = ?
      `,
      [req.params.itemId, req.user.id]
    );

    const cart = await fetchCart(req.user.id);
    return res.json({ cart });
  } catch (error) {
    return next(error);
  }
};

export const clearCart = async (req, res, next) => {
  try {
    const db = getDb();

    await db.execute(
      `
        DELETE ci
        FROM cartItems ci
        INNER JOIN carts c ON c.id = ci.cartId
        WHERE c.userId = ?
      `,
      [req.user.id]
    );

    const cart = await fetchCart(req.user.id);
    return res.json({ cart });
  } catch (error) {
    return next(error);
  }
};
