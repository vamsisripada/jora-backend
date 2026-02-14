import crypto from "crypto";
import { getDb } from "../config/db.js";

const normalizeUser = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    password: row.password,
    tokenSalt: row.tokenSalt,
    isVerified: Boolean(row.isVerified),
    verificationToken: row.verificationToken,
    verificationExpires: row.verificationExpires,
    refreshTokenHash: row.refreshTokenHash,
    refreshTokenExpires: row.refreshTokenExpires,
  };
};

const User = {
  async findByEmail(email) {
    const db = getDb();
    const [rows] = await db.execute("SELECT * FROM authUser WHERE email = ? LIMIT 1", [
      email.toLowerCase(),
    ]);

    return normalizeUser(rows[0]);
  },

  async findById(id) {
    const db = getDb();
    const [rows] = await db.execute("SELECT * FROM authUser WHERE id = ? LIMIT 1", [
      id,
    ]);

    return normalizeUser(rows[0]);
  },

  async findByVerificationToken(token) {
    const db = getDb();
    const [rows] = await db.execute(
      "SELECT * FROM authUser WHERE verificationToken = ? AND verificationExpires > NOW() LIMIT 1",
      [token]
    );

    return normalizeUser(rows[0]);
  },

  async create({ name, email, phone, password, verificationToken, verificationExpires }) {
    const db = getDb();
    const tokenSalt = crypto.randomBytes(16).toString("hex");

    const [result] = await db.execute(
      `
        INSERT INTO authUser
          (name, email, phone, password, tokenSalt, isVerified, verificationToken, verificationExpires)
        VALUES
          (?, ?, ?, ?, ?, 0, ?, ?)
      `,
      [
        name,
        email.toLowerCase(),
        phone,
        password,
        tokenSalt,
        verificationToken,
        verificationExpires,
      ]
    );

    return this.findById(result.insertId);
  },

  async markVerified(id) {
    const db = getDb();

    await db.execute(
      "UPDATE authUser SET isVerified = 1, verificationToken = NULL, verificationExpires = NULL WHERE id = ?",
      [id]
    );
  },

  async updateTokenSalt(id, tokenSalt) {
    const db = getDb();

    await db.execute("UPDATE authUser SET tokenSalt = ? WHERE id = ?", [tokenSalt, id]);
  },

  async setRefreshTokenData(id, refreshTokenHash, refreshTokenExpires) {
    const db = getDb();

    await db.execute(
      "UPDATE authUser SET refreshTokenHash = ?, refreshTokenExpires = ? WHERE id = ?",
      [refreshTokenHash, refreshTokenExpires, id]
    );
  },

  async clearRefreshTokenData(id) {
    const db = getDb();

    await db.execute(
      "UPDATE authUser SET refreshTokenHash = NULL, refreshTokenExpires = NULL WHERE id = ?",
      [id]
    );
  },
};

export default User;
