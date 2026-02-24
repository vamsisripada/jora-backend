import { getDb } from "../config/db.js";

const calculateDiscount = (subtotal, coupon) => {
  let discountAmount = 0;

  if (coupon.type === "percentage") {
    discountAmount = (subtotal * Number(coupon.value)) / 100;
    if (coupon.maxDiscountValue != null) {
      discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountValue));
    }
  } else {
    discountAmount = Number(coupon.value);
  }

  return Number(discountAmount.toFixed(2));
};

export const validateCoupon = async (req, res, next) => {
  try {
    const db = getDb();
    const { code, subtotal = 0 } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM coupons
        WHERE code = ?
          AND isActive = 1
          AND (validFrom IS NULL OR validFrom <= NOW())
          AND (validTo IS NULL OR validTo >= NOW())
        LIMIT 1
      `,
      [String(code).toUpperCase()]
    );

    if (!rows.length) {
      return res.status(404).json({ valid: false, message: "Invalid or expired coupon" });
    }

    const coupon = rows[0];
    const minOrderValue = coupon.minOrderValue == null ? 0 : Number(coupon.minOrderValue);

    if (Number(subtotal) < minOrderValue) {
      return res.status(400).json({
        valid: false,
        message: `Minimum order value is ₹${minOrderValue}`,
      });
    }

    const discountAmount = calculateDiscount(Number(subtotal), coupon);

    return res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      discountAmount,
      maxDiscountValue:
        coupon.maxDiscountValue == null ? null : Number(coupon.maxDiscountValue),
    });
  } catch (error) {
    return next(error);
  }
};

export const getCoupons = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute("SELECT * FROM coupons ORDER BY createdAt DESC");

    return res.json({ coupons: rows });
  } catch (error) {
    return next(error);
  }
};

export const createCoupon = async (req, res, next) => {
  try {
    const db = getDb();
    const {
      code,
      type = "percentage",
      value,
      minOrderValue,
      maxDiscountValue,
      validFrom,
      validTo,
      isActive = true,
    } = req.body;

    if (!code || value == null) {
      return res.status(400).json({ message: "code and value are required" });
    }

    await db.execute(
      `
        INSERT INTO coupons
          (code, type, value, minOrderValue, maxDiscountValue, validFrom, validTo, isActive)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        String(code).toUpperCase(),
        type,
        Number(value),
        minOrderValue ?? null,
        maxDiscountValue ?? null,
        validFrom ?? null,
        validTo ?? null,
        isActive ? 1 : 0,
      ]
    );

    return res.status(201).json({ message: "Coupon created" });
  } catch (error) {
    return next(error);
  }
};
