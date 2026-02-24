import { getDb } from "../config/db.js";
import User from "../models/User.js";

export const createB2BInquiry = async (req, res, next) => {
  try {
    const db = getDb();
    const {
      businessName,
      industry,
      contactName,
      email,
      phone,
      expectedVolume,
      message,
    } = req.body;

    if (!businessName || !contactName || !email || !phone) {
      return res
        .status(400)
        .json({ message: "businessName, contactName, email and phone are required" });
    }

    await db.execute(
      `
        INSERT INTO b2bInquiries
          (businessName, industry, contactName, email, phone, expectedVolume, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        businessName,
        industry || null,
        contactName,
        email.toLowerCase(),
        phone,
        expectedVolume || null,
        message || null,
      ]
    );

    return res.status(201).json({ message: "Inquiry submitted. Team will contact you shortly." });
  } catch (error) {
    return next(error);
  }
};

export const registerB2BProfile = async (req, res, next) => {
  try {
    const db = getDb();
    const { businessName, gstNumber, industry, expectedVolume, notes } = req.body;

    if (!businessName) {
      return res.status(400).json({ message: "businessName is required" });
    }

    await User.updateRole(req.user.id, "b2b");

    await db.execute(
      `
        INSERT INTO b2bProfiles
          (userId, businessName, gstNumber, industry, expectedVolume, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          businessName = VALUES(businessName),
          gstNumber = VALUES(gstNumber),
          industry = VALUES(industry),
          expectedVolume = VALUES(expectedVolume),
          notes = VALUES(notes)
      `,
      [
        req.user.id,
        businessName,
        gstNumber || null,
        industry || null,
        expectedVolume || null,
        notes || null,
      ]
    );

    return res.status(201).json({ message: "B2B profile submitted for approval" });
  } catch (error) {
    return next(error);
  }
};

export const getB2BProfile = async (req, res, next) => {
  try {
    const db = getDb();

    const [rows] = await db.execute(
      "SELECT * FROM b2bProfiles WHERE userId = ? LIMIT 1",
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "B2B profile not found" });
    }

    const row = rows[0];

    return res.json({
      profile: {
        id: Number(row.id),
        businessName: row.businessName,
        gstNumber: row.gstNumber,
        industry: row.industry,
        expectedVolume: row.expectedVolume,
        approvalStatus: row.approvalStatus,
        customPriceSlabs: row.customPriceSlabs ? JSON.parse(row.customPriceSlabs) : null,
        notes: row.notes,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const createB2BBulkOrder = async (req, res, next) => {
  try {
    const db = getDb();
    const { variantId, quantity, notes } = req.body;

    if (!variantId || !quantity) {
      return res.status(400).json({ message: "variantId and quantity are required" });
    }

    const minQty = Number(quantity);
    if (!Number.isFinite(minQty) || minQty < 25) {
      return res.status(400).json({ message: "Minimum order quantity is 25 units" });
    }

    const [profiles] = await db.execute(
      "SELECT id, approvalStatus FROM b2bProfiles WHERE userId = ? LIMIT 1",
      [req.user.id]
    );

    if (!profiles.length) {
      return res.status(400).json({ message: "Complete your B2B profile before placing bulk orders" });
    }

    const profile = profiles[0];
    if (profile.approvalStatus !== "approved") {
      return res.status(403).json({ message: "Your B2B profile is not approved yet" });
    }

    const [variants] = await db.execute(
      `
        SELECT pv.id, pv.stockQuantity, COALESCE(pv.priceOverride, p.mrp) AS unitPrice
        FROM productVariants pv
        INNER JOIN products p ON p.id = pv.productId
        WHERE pv.id = ?
        LIMIT 1
      `,
      [variantId]
    );

    if (!variants.length) {
      return res.status(404).json({ message: "Variant not found" });
    }

    const variant = variants[0];
    if (Number(variant.stockQuantity) < minQty) {
      return res.status(400).json({ message: "Requested quantity exceeds current stock" });
    }

    const unitPrice = Number(variant.unitPrice || 0);
    const slabDiscount = minQty >= 250 ? 18 : minQty >= 100 ? 12 : 8;
    const requestedUnitPrice = Number((unitPrice * (1 - slabDiscount / 100)).toFixed(2));

    const [insertResult] = await db.execute(
      `
        INSERT INTO b2bOrders
          (userId, profileId, variantId, quantity, requestedUnitPrice, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [req.user.id, profile.id, variantId, minQty, requestedUnitPrice, notes || null]
    );

    return res.status(201).json({
      message: "Bulk order submitted for approval",
      order: {
        id: Number(insertResult.insertId),
        variantId: Number(variantId),
        quantity: minQty,
        requestedUnitPrice,
        status: "pending",
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const listB2BBulkOrders = async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `
        SELECT
          bo.id,
          bo.quantity,
          bo.requestedUnitPrice,
          bo.approvedUnitPrice,
          bo.status,
          bo.notes,
          bo.createdAt,
          pv.sku,
          pv.size,
          pv.color,
          p.name AS productName,
          p.slug AS productSlug
        FROM b2bOrders bo
        INNER JOIN productVariants pv ON pv.id = bo.variantId
        INNER JOIN products p ON p.id = pv.productId
        WHERE bo.userId = ?
        ORDER BY bo.createdAt DESC
        LIMIT 100
      `,
      [req.user.id]
    );

    return res.json({ orders: rows });
  } catch (error) {
    return next(error);
  }
};
