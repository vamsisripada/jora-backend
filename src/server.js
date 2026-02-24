import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { connectDb } from "./config/db.js";
import adminRoutes from "./routes/admin.js";
import accountRoutes from "./routes/account.js";
import authRoutes from "./routes/auth.js";
import b2bRoutes from "./routes/b2b.js";
import cartRoutes from "./routes/cart.js";
import categoryRoutes from "./routes/categories.js";
import couponRoutes from "./routes/coupons.js";
import orderRoutes from "./routes/orders.js";
import paymentGatewayRoutes from "./routes/paymentGateway.js";
import productRoutes from "./routes/products.js";
import supportRoutes from "./routes/support.js";
import wishlistRoutes from "./routes/wishlist.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.json({
    message: "Jora Ecommerce Backend API",
    status: "ok",
    health: "/health",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment-gateway", paymentGatewayRoutes);
app.use("/api/b2b", b2bRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Server error",
  });
});

const port = process.env.PORT || 5000;

connectDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Auth server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MySQL", error);
    process.exit(1);
  });
