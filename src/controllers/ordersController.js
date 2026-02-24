import { getDb } from "../config/db.js";
import { buildOrderNumber, ensureCart } from "../utils/sql.js";

const hydrateOrderItems = async (orderId) => {
  const db = getDb();
  const [items] = await db.execute(
    `
      SELECT *
      FROM orderItems
      WHERE orderId = ?
      ORDER BY id ASC
    `,
    [orderId]
  );

  return items.map((item) => ({
    id: Number(item.id),
    productId: String(item.productId),
    productSlug: item.productSlug,
    name: item.productName,
    quantity: Number(item.quantity),
    price: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    image: item.imageUrl,
    variantLabel: item.variantLabel,
  }));
};

const parseJsonField = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const mapOrder = async (row) => ({
  id: String(row.id),
  orderNumber: row.orderNumber,
  status: row.status,
  paymentStatus: row.paymentStatus,
  paymentMethod: row.paymentMethod,
  totalAmount: Number(row.subtotal),
  shippingCost: Number(row.shippingCost),
  tax: Number(row.taxAmount),
  discountAmount: Number(row.discountAmount),
  totalPrice: Number(row.totalAmount),
  createdAt: row.createdAt,
  shippingAddress: parseJsonField(row.shippingAddressJson),
  items: await hydrateOrderItems(row.id),
});

export const createOrder = async (req, res, next) => {
  const db = getDb();
  const connection = await db.getConnection();

  try {
    const {
      paymentMethod,
      shippingAddress,
      billingAddress,
      couponCode,
      notes,
      gstAmount = 0,
    } = req.body;

    if (!paymentMethod || !shippingAddress) {
      return res.status(400).json({ message: "paymentMethod and shippingAddress are required" });
    }

    await connection.beginTransaction();

    const cartId = await ensureCart(req.user.id);

    const [cartRows] = await connection.execute(
      `
        SELECT
          ci.id,
          ci.quantity,
          pv.id AS variantId,
          pv.productId,
          pv.size,
          pv.color,
          pv.stockQuantity,
          pv.priceOverride,
          pv.imageUrl,
          p.name,
          p.slug,
          p.mrp,
          p.discountPercent
        FROM cartItems ci
        INNER JOIN productVariants pv ON pv.id = ci.variantId
        INNER JOIN products p ON p.id = pv.productId
        WHERE ci.cartId = ?
      `,
      [cartId]
    );

    if (!cartRows.length) {
      await connection.rollback();
      return res.status(400).json({ message: "Cart is empty" });
    }

    let subtotal = 0;

    for (const item of cartRows) {
      if (Number(item.quantity) > Number(item.stockQuantity)) {
        await connection.rollback();
        return res.status(400).json({ message: `${item.name} is out of stock` });
      }

      const basePrice = item.priceOverride == null ? Number(item.mrp) : Number(item.priceOverride);
      const effectivePrice = basePrice - (basePrice * Number(item.discountPercent || 0)) / 100;
      subtotal += effectivePrice * Number(item.quantity);
    }

    const shippingCost = subtotal > 1000 ? 0 : 100;
    const taxAmount = Number((subtotal * 0.18).toFixed(2));

    let discountAmount = 0;

    if (couponCode) {
      const [couponRows] = await connection.execute(
        `
          SELECT *
          FROM coupons
          WHERE code = ? AND isActive = 1
            AND (validFrom IS NULL OR validFrom <= NOW())
            AND (validTo IS NULL OR validTo >= NOW())
          LIMIT 1
        `,
        [couponCode]
      );

      if (couponRows.length) {
        const coupon = couponRows[0];
        const minOrderValue = coupon.minOrderValue == null ? 0 : Number(coupon.minOrderValue);

        if (subtotal >= minOrderValue) {
          if (coupon.type === "percentage") {
            discountAmount = (subtotal * Number(coupon.value)) / 100;
            if (coupon.maxDiscountValue != null) {
              discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountValue));
            }
          } else {
            discountAmount = Number(coupon.value);
          }
        }
      }
    }

    const totalAmount = subtotal + shippingCost + taxAmount + Number(gstAmount || 0) - discountAmount;

    const [orderResult] = await connection.execute(
      `
        INSERT INTO orders
          (orderNumber, userId, status, paymentStatus, paymentMethod, subtotal, shippingCost, taxAmount, discountAmount, totalAmount, couponCode, gstAmount, shippingAddressJson, billingAddressJson, notes)
        VALUES
          (?, ?, 'confirmed', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        buildOrderNumber(),
        req.user.id,
        paymentMethod,
        Number(subtotal.toFixed(2)),
        Number(shippingCost.toFixed(2)),
        taxAmount,
        Number(discountAmount.toFixed(2)),
        Number(totalAmount.toFixed(2)),
        couponCode || null,
        Number(gstAmount || 0),
        JSON.stringify(shippingAddress),
        JSON.stringify(billingAddress || shippingAddress),
        notes || null,
      ]
    );

    for (const item of cartRows) {
      const basePrice = item.priceOverride == null ? Number(item.mrp) : Number(item.priceOverride);
      const unitPrice = basePrice - (basePrice * Number(item.discountPercent || 0)) / 100;

      await connection.execute(
        `
          INSERT INTO orderItems
            (orderId, productId, variantId, productName, productSlug, variantLabel, quantity, unitPrice, totalPrice, imageUrl)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderResult.insertId,
          item.productId,
          item.variantId,
          item.name,
          item.slug,
          `${item.size || "NA"}/${item.color || "NA"}`,
          Number(item.quantity),
          Number(unitPrice.toFixed(2)),
          Number((unitPrice * Number(item.quantity)).toFixed(2)),
          item.imageUrl || null,
        ]
      );

      await connection.execute(
        "UPDATE productVariants SET stockQuantity = stockQuantity - ? WHERE id = ?",
        [Number(item.quantity), item.variantId]
      );
    }

    await connection.execute("DELETE FROM cartItems WHERE cartId = ?", [cartId]);

    await connection.commit();

    const [orderRows] = await db.execute("SELECT * FROM orders WHERE id = ? LIMIT 1", [
      orderResult.insertId,
    ]);

    return res.status(201).json({ order: await mapOrder(orderRows[0]) });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
};

export const createGuestOrder = async (req, res, next) => {
  const db = getDb();
  const connection = await db.getConnection();

  try {
    const {
      paymentMethod,
      shippingAddress,
      billingAddress,
      couponCode,
      notes,
      items = [],
      gstAmount = 0,
    } = req.body;

    if (!paymentMethod || !shippingAddress || !Array.isArray(items) || !items.length) {
      return res
        .status(400)
        .json({ message: "paymentMethod, shippingAddress and items are required" });
    }

    await connection.beginTransaction();

    let subtotal = 0;
    const normalizedItems = [];

    for (const item of items) {
      const [variantRows] = await connection.execute(
        `
          SELECT pv.id AS variantId, pv.productId, pv.size, pv.color, pv.stockQuantity, pv.priceOverride, pv.imageUrl,
                 p.name, p.slug, p.mrp, p.discountPercent
          FROM productVariants pv
          INNER JOIN products p ON p.id = pv.productId
          WHERE pv.id = ?
          LIMIT 1
        `,
        [item.variantId]
      );

      if (!variantRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: "One or more variants not found" });
      }

      const row = variantRows[0];
      const quantity = Number(item.quantity || 1);

      if (quantity > Number(row.stockQuantity)) {
        await connection.rollback();
        return res.status(400).json({ message: `${row.name} is out of stock` });
      }

      const basePrice = row.priceOverride == null ? Number(row.mrp) : Number(row.priceOverride);
      const effectivePrice = basePrice - (basePrice * Number(row.discountPercent || 0)) / 100;
      subtotal += effectivePrice * quantity;

      normalizedItems.push({ row, quantity, unitPrice: Number(effectivePrice.toFixed(2)) });
    }

    const shippingCost = subtotal > 1000 ? 0 : 100;
    const taxAmount = Number((subtotal * 0.18).toFixed(2));

    let discountAmount = 0;

    if (couponCode) {
      const [couponRows] = await connection.execute(
        `
          SELECT *
          FROM coupons
          WHERE code = ? AND isActive = 1
            AND (validFrom IS NULL OR validFrom <= NOW())
            AND (validTo IS NULL OR validTo >= NOW())
          LIMIT 1
        `,
        [couponCode]
      );

      if (couponRows.length) {
        const coupon = couponRows[0];
        const minOrderValue = coupon.minOrderValue == null ? 0 : Number(coupon.minOrderValue);
        if (subtotal >= minOrderValue) {
          if (coupon.type === "percentage") {
            discountAmount = (subtotal * Number(coupon.value)) / 100;
            if (coupon.maxDiscountValue != null) {
              discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountValue));
            }
          } else {
            discountAmount = Number(coupon.value);
          }
        }
      }
    }

    const totalAmount = subtotal + shippingCost + taxAmount + Number(gstAmount || 0) - discountAmount;

    const [orderResult] = await connection.execute(
      `
        INSERT INTO orders
          (orderNumber, userId, status, paymentStatus, paymentMethod, subtotal, shippingCost, taxAmount, discountAmount, totalAmount, couponCode, gstAmount, shippingAddressJson, billingAddressJson, notes)
        VALUES
          (?, NULL, 'confirmed', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        buildOrderNumber(),
        paymentMethod,
        Number(subtotal.toFixed(2)),
        Number(shippingCost.toFixed(2)),
        taxAmount,
        Number(discountAmount.toFixed(2)),
        Number(totalAmount.toFixed(2)),
        couponCode || null,
        Number(gstAmount || 0),
        JSON.stringify(shippingAddress),
        JSON.stringify(billingAddress || shippingAddress),
        notes || null,
      ]
    );

    for (const item of normalizedItems) {
      await connection.execute(
        `
          INSERT INTO orderItems
            (orderId, productId, variantId, productName, productSlug, variantLabel, quantity, unitPrice, totalPrice, imageUrl)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderResult.insertId,
          item.row.productId,
          item.row.variantId,
          item.row.name,
          item.row.slug,
          `${item.row.size || "NA"}/${item.row.color || "NA"}`,
          item.quantity,
          item.unitPrice,
          Number((item.unitPrice * item.quantity).toFixed(2)),
          item.row.imageUrl || null,
        ]
      );

      await connection.execute(
        "UPDATE productVariants SET stockQuantity = stockQuantity - ? WHERE id = ?",
        [item.quantity, item.row.variantId]
      );
    }

    await connection.commit();

    const [orderRows] = await db.execute("SELECT * FROM orders WHERE id = ? LIMIT 1", [
      orderResult.insertId,
    ]);

    return res.status(201).json({ order: await mapOrder(orderRows[0]) });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
};

export const createOrderFromItems = async (req, res, next) => {
  const db = getDb();
  const connection = await db.getConnection();

  try {
    const {
      paymentMethod,
      shippingAddress,
      billingAddress,
      couponCode,
      notes,
      items = [],
      gstAmount = 0,
    } = req.body;

    if (!paymentMethod || !shippingAddress || !Array.isArray(items) || !items.length) {
      return res
        .status(400)
        .json({ message: "paymentMethod, shippingAddress and items are required" });
    }

    await connection.beginTransaction();

    let subtotal = 0;
    const normalizedItems = [];

    for (const item of items) {
      const [variantRows] = await connection.execute(
        `
          SELECT pv.id AS variantId, pv.productId, pv.size, pv.color, pv.stockQuantity, pv.priceOverride, pv.imageUrl,
                 p.name, p.slug, p.mrp, p.discountPercent
          FROM productVariants pv
          INNER JOIN products p ON p.id = pv.productId
          WHERE pv.id = ?
          LIMIT 1
        `,
        [item.variantId]
      );

      if (!variantRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: "One or more variants not found" });
      }

      const row = variantRows[0];
      const quantity = Number(item.quantity || 1);

      if (quantity > Number(row.stockQuantity)) {
        await connection.rollback();
        return res.status(400).json({ message: `${row.name} is out of stock` });
      }

      const basePrice = row.priceOverride == null ? Number(row.mrp) : Number(row.priceOverride);
      const effectivePrice = basePrice - (basePrice * Number(row.discountPercent || 0)) / 100;
      subtotal += effectivePrice * quantity;

      normalizedItems.push({ row, quantity, unitPrice: Number(effectivePrice.toFixed(2)) });
    }

    const shippingCost = subtotal > 1000 ? 0 : 100;
    const taxAmount = Number((subtotal * 0.18).toFixed(2));

    let discountAmount = 0;

    if (couponCode) {
      const [couponRows] = await connection.execute(
        `
          SELECT *
          FROM coupons
          WHERE code = ? AND isActive = 1
            AND (validFrom IS NULL OR validFrom <= NOW())
            AND (validTo IS NULL OR validTo >= NOW())
          LIMIT 1
        `,
        [couponCode]
      );

      if (couponRows.length) {
        const coupon = couponRows[0];
        const minOrderValue = coupon.minOrderValue == null ? 0 : Number(coupon.minOrderValue);
        if (subtotal >= minOrderValue) {
          if (coupon.type === "percentage") {
            discountAmount = (subtotal * Number(coupon.value)) / 100;
            if (coupon.maxDiscountValue != null) {
              discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountValue));
            }
          } else {
            discountAmount = Number(coupon.value);
          }
        }
      }
    }

    const totalAmount = subtotal + shippingCost + taxAmount + Number(gstAmount || 0) - discountAmount;

    const [orderResult] = await connection.execute(
      `
        INSERT INTO orders
          (orderNumber, userId, status, paymentStatus, paymentMethod, subtotal, shippingCost, taxAmount, discountAmount, totalAmount, couponCode, gstAmount, shippingAddressJson, billingAddressJson, notes)
        VALUES
          (?, ?, 'confirmed', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        buildOrderNumber(),
        req.user.id,
        paymentMethod,
        Number(subtotal.toFixed(2)),
        Number(shippingCost.toFixed(2)),
        taxAmount,
        Number(discountAmount.toFixed(2)),
        Number(totalAmount.toFixed(2)),
        couponCode || null,
        Number(gstAmount || 0),
        JSON.stringify(shippingAddress),
        JSON.stringify(billingAddress || shippingAddress),
        notes || null,
      ]
    );

    for (const item of normalizedItems) {
      await connection.execute(
        `
          INSERT INTO orderItems
            (orderId, productId, variantId, productName, productSlug, variantLabel, quantity, unitPrice, totalPrice, imageUrl)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderResult.insertId,
          item.row.productId,
          item.row.variantId,
          item.row.name,
          item.row.slug,
          `${item.row.size || "NA"}/${item.row.color || "NA"}`,
          item.quantity,
          item.unitPrice,
          Number((item.unitPrice * item.quantity).toFixed(2)),
          item.row.imageUrl || null,
        ]
      );

      await connection.execute(
        "UPDATE productVariants SET stockQuantity = stockQuantity - ? WHERE id = ?",
        [item.quantity, item.row.variantId]
      );
    }

    await connection.execute(
      `
        DELETE ci
        FROM cartItems ci
        INNER JOIN carts c ON c.id = ci.cartId
        WHERE c.userId = ?
      `,
      [req.user.id]
    );

    await connection.commit();

    const [orderRows] = await db.execute("SELECT * FROM orders WHERE id = ? LIMIT 1", [
      orderResult.insertId,
    ]);

    return res.status(201).json({ order: await mapOrder(orderRows[0]) });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
};

export const getMyOrders = async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `
        SELECT *
        FROM orders
        WHERE userId = ?
        ORDER BY createdAt DESC
      `,
      [req.user.id]
    );

    const orders = [];
    for (const row of rows) {
      orders.push(await mapOrder(row));
    }

    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
};

export const getOrderById = async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      "SELECT * FROM orders WHERE id = ? AND userId = ? LIMIT 1",
      [req.params.id, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json({ order: await mapOrder(rows[0]) });
  } catch (error) {
    return next(error);
  }
};

export const cancelOrder = async (req, res, next) => {
  try {
    const db = getDb();

    await db.execute(
      `
        UPDATE orders
        SET status = 'cancelled', paymentStatus = 'refunded'
        WHERE id = ? AND userId = ? AND status IN ('pending', 'confirmed', 'packed')
      `,
      [req.params.id, req.user.id]
    );

    return res.json({ message: "Order cancelled" });
  } catch (error) {
    return next(error);
  }
};
