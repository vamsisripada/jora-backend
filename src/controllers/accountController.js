import { getDb } from "../config/db.js";
import User from "../models/User.js";

export const getAccount = async (req, res, next) => {
  try {
    const db = getDb();
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [addressRows] = await db.execute(
      `
        SELECT *
        FROM addresses
        WHERE userId = ?
        ORDER BY isDefault DESC, createdAt DESC
      `,
      [req.user.id]
    );

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      addresses: addressRows.map((row) => ({
        id: Number(row.id),
        type: row.type,
        fullName: row.fullName,
        phone: row.phone,
        line1: row.line1,
        line2: row.line2,
        city: row.city,
        state: row.state,
        pincode: row.pincode,
        country: row.country,
        isDefault: Boolean(row.isDefault),
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const db = getDb();
    const { name, email, phone } = req.body;

    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

    if (normalizedEmail) {
      const existingUser = await User.findByEmail(normalizedEmail);
      if (existingUser && Number(existingUser.id) !== Number(req.user.id)) {
        return res.status(409).json({ message: "Email is already in use" });
      }
    }

    await db.execute(
      "UPDATE authUser SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?",
      [name || null, normalizedEmail, phone || null, req.user.id]
    );

    const user = await User.findById(req.user.id);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const addAddress = async (req, res, next) => {
  try {
    const db = getDb();
    const {
      type = "shipping",
      fullName,
      phone,
      line1,
      line2,
      city,
      state,
      pincode,
      country = "India",
      isDefault = false,
    } = req.body;

    if (!fullName || !phone || !line1 || !city || !state || !pincode) {
      return res.status(400).json({ message: "Missing required address fields" });
    }

    if (isDefault) {
      await db.execute("UPDATE addresses SET isDefault = 0 WHERE userId = ?", [req.user.id]);
    }

    await db.execute(
      `
        INSERT INTO addresses
          (userId, type, fullName, phone, line1, line2, city, state, pincode, country, isDefault)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        type,
        fullName,
        phone,
        line1,
        line2 || null,
        city,
        state,
        pincode,
        country,
        isDefault ? 1 : 0,
      ]
    );

    return getAccount(req, res, next);
  } catch (error) {
    return next(error);
  }
};

export const removeAddress = async (req, res, next) => {
  try {
    const db = getDb();

    await db.execute("DELETE FROM addresses WHERE id = ? AND userId = ?", [
      req.params.addressId,
      req.user.id,
    ]);

    return getAccount(req, res, next);
  } catch (error) {
    return next(error);
  }
};
