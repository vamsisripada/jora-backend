import bcrypt from "bcryptjs";
import crypto from "crypto";
import { validationResult } from "express-validator";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import { sendVerificationEmail } from "../utils/email.js";

const createAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, tokenSalt: user.tokenSalt },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const createRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id, tokenSalt: user.tokenSalt, type: "refresh" },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
};

const setRefreshTokenOnUser = async (user, refreshToken) => {
  const refreshTokenSalt = await bcrypt.genSalt(10);
  const refreshTokenHash = await bcrypt.hash(refreshToken, refreshTokenSalt);
  const refreshTokenExpires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await User.setRefreshTokenData(user.id, refreshTokenHash, refreshTokenExpires);
};

export const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, password } = req.body;

    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordSalt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, passwordSalt);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 1000 * 60 * 60 * 24);

    const user = await User.create({
      name,
      email,
      phone,
      password: passwordHash,
      verificationToken,
      verificationExpires,
    });

    await sendVerificationEmail({ to: user.email, token: verificationToken });

    return res.status(201).json({
      message: "Registration successful. Verify your email to continue.",
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const token = req.query.token || req.body.token;
    if (!token) {
      return res.status(400).json({ message: "Verification token required" });
    }

    const user = await User.findByVerificationToken(token);

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    await User.markVerified(user.id);

    return res.json({ message: "Email verified successfully" });
  } catch (error) {
    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Password is wrong" });
    }

    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email before logging in" });
    }

    if (!user.tokenSalt) {
      const tokenSalt = crypto.randomBytes(16).toString("hex");
      await User.updateTokenSalt(user.id, tokenSalt);
      user.tokenSalt = tokenSalt;
    }

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    await setRefreshTokenOnUser(user, refreshToken);

    return res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const incomingRefreshToken = req.body.refreshToken;

    let payload;
    try {
      payload = jwt.verify(
        incomingRefreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    if (payload.type !== "refresh") {
      return res.status(401).json({ message: "Invalid refresh token type" });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    if (!user.refreshTokenHash || !user.refreshTokenExpires) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    if (user.refreshTokenExpires <= new Date()) {
      return res.status(401).json({ message: "Refresh token expired" });
    }

    if (!payload.tokenSalt || payload.tokenSalt !== user.tokenSalt) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const refreshTokenMatch = await bcrypt.compare(
      incomingRefreshToken,
      user.refreshTokenHash
    );

    if (!refreshTokenMatch) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const accessToken = createAccessToken(user);
    const newRefreshToken = createRefreshToken(user);
    await setRefreshTokenOnUser(user, newRefreshToken);

    return res.json({
      token: accessToken,
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    return next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const tokenSalt = crypto.randomBytes(16).toString("hex");
    await User.updateTokenSalt(user.id, tokenSalt);
    await User.clearRefreshTokenData(user.id);

    return res.json({ message: "Logged out" });
  } catch (error) {
    return next(error);
  }
};
