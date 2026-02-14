import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Missing auth token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("_id tokenSalt email");

    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (!payload.tokenSalt || payload.tokenSalt !== user.tokenSalt) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = {
      id: user._id,
      email: user.email,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
