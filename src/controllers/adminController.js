import { getDb } from "../config/db.js";

export const getDashboardSummary = async (_req, res, next) => {
  try {
    const db = getDb();

    const [[orders]] = await db.execute(
      "SELECT COUNT(*) AS totalOrders, SUM(totalAmount) AS totalRevenue FROM orders"
    );
    const [[users]] = await db.execute(
      "SELECT COUNT(*) AS totalCustomers FROM authUser WHERE role IN ('customer', 'b2b')"
    );
    const [[products]] = await db.execute(
      "SELECT COUNT(*) AS totalProducts FROM products WHERE isActive = 1"
    );
    const [lowStockRows] = await db.execute(
      `
        SELECT pv.id, pv.sku, pv.stockQuantity, p.name
        FROM productVariants pv
        INNER JOIN products p ON p.id = pv.productId
        WHERE pv.stockQuantity <= 5
        ORDER BY pv.stockQuantity ASC
        LIMIT 10
      `
    );

    return res.json({
      summary: {
        totalOrders: Number(orders.totalOrders || 0),
        totalRevenue: Number(orders.totalRevenue || 0),
        totalCustomers: Number(users.totalCustomers || 0),
        totalProducts: Number(products.totalProducts || 0),
      },
      lowStockItems: lowStockRows.map((row) => ({
        id: Number(row.id),
        sku: row.sku,
        name: row.name,
        stockQuantity: Number(row.stockQuantity),
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const getSalesReport = async (_req, res, next) => {
  try {
    const db = getDb();

    const [salesByDay] = await db.execute(
      `
        SELECT DATE(createdAt) AS day, COUNT(*) AS orders, SUM(totalAmount) AS revenue
        FROM orders
        WHERE status <> 'cancelled'
        GROUP BY DATE(createdAt)
        ORDER BY day DESC
        LIMIT 30
      `
    );

    const [topProducts] = await db.execute(
      `
        SELECT oi.productName, SUM(oi.quantity) AS units, SUM(oi.totalPrice) AS revenue
        FROM orderItems oi
        INNER JOIN orders o ON o.id = oi.orderId
        WHERE o.status <> 'cancelled'
        GROUP BY oi.productName
        ORDER BY units DESC
        LIMIT 10
      `
    );

    return res.json({
      salesByDay,
      topProducts,
    });
  } catch (error) {
    return next(error);
  }
};

export const listB2BInquiries = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      "SELECT * FROM b2bInquiries ORDER BY createdAt DESC LIMIT 200"
    );

    return res.json({ inquiries: rows });
  } catch (error) {
    return next(error);
  }
};

export const listContactMessages = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      "SELECT * FROM contactMessages ORDER BY createdAt DESC LIMIT 200"
    );

    return res.json({ messages: rows });
  } catch (error) {
    return next(error);
  }
};

export const listOrders = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `
        SELECT id, orderNumber, status, paymentStatus, paymentMethod, totalAmount, createdAt
        FROM orders
        ORDER BY createdAt DESC
        LIMIT 300
      `
    );

    return res.json({ orders: rows });
  } catch (error) {
    return next(error);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const db = getDb();
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    await db.execute("UPDATE orders SET status = ? WHERE id = ?", [
      status,
      req.params.orderId,
    ]);

    return res.json({ message: "Order status updated" });
  } catch (error) {
    return next(error);
  }
};

export const processRefund = async (req, res, next) => {
  try {
    const db = getDb();
    await db.execute(
      "UPDATE orders SET paymentStatus = 'refunded', status = 'cancelled' WHERE id = ?",
      [req.params.orderId]
    );

    return res.json({ message: "Refund processed" });
  } catch (error) {
    return next(error);
  }
};

export const generateInvoice = async (req, res, next) => {
  try {
    const db = getDb();
    const [[order]] = await db.execute(
      "SELECT orderNumber, totalAmount, gstAmount, createdAt FROM orders WHERE id = ? LIMIT 1",
      [req.params.orderId]
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json({
      invoiceNumber: `INV-${order.orderNumber}`,
      issuedAt: order.createdAt,
      totalAmount: Number(order.totalAmount),
      gstAmount: Number(order.gstAmount || 0),
    });
  } catch (error) {
    return next(error);
  }
};

export const generateShippingLabel = async (req, res, next) => {
  try {
    const db = getDb();
    const [[order]] = await db.execute(
      "SELECT orderNumber, shippingAddressJson FROM orders WHERE id = ? LIMIT 1",
      [req.params.orderId]
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json({
      labelId: `SHIP-${order.orderNumber}`,
      carrier: "Shiprocket",
      destination: order.shippingAddressJson ? JSON.parse(order.shippingAddressJson) : null,
      status: "generated",
    });
  } catch (error) {
    return next(error);
  }
};

export const exportInventoryCsv = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `
        SELECT p.name AS productName, p.slug, pv.sku, pv.size, pv.color, pv.stockQuantity
        FROM productVariants pv
        INNER JOIN products p ON p.id = pv.productId
        ORDER BY p.name ASC
      `
    );

    const headers = ["productName", "slug", "sku", "size", "color", "stockQuantity"];
    const csvRows = [headers.join(",")];

    for (const row of rows) {
      csvRows.push(
        [
          row.productName,
          row.slug,
          row.sku,
          row.size || "",
          row.color || "",
          Number(row.stockQuantity),
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=inventory.csv");
    return res.send(csvRows.join("\n"));
  } catch (error) {
    return next(error);
  }
};

export const getTaxGstReport = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `
        SELECT DATE(createdAt) AS day, SUM(taxAmount) AS taxAmount, SUM(gstAmount) AS gstAmount
        FROM orders
        WHERE status <> 'cancelled'
        GROUP BY DATE(createdAt)
        ORDER BY day DESC
        LIMIT 60
      `
    );

    return res.json({ taxReport: rows });
  } catch (error) {
    return next(error);
  }
};

export const getCustomerBehavior = async (_req, res, next) => {
  try {
    const db = getDb();
    const [[summary]] = await db.execute(
      `
        SELECT
          COUNT(DISTINCT userId) AS customers,
          AVG(totalAmount) AS averageOrderValue,
          COUNT(*) AS orderCount
        FROM orders
        WHERE userId IS NOT NULL AND status <> 'cancelled'
      `
    );

    return res.json({ behavior: summary });
  } catch (error) {
    return next(error);
  }
};

export const getProductPerformance = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `
        SELECT oi.productName, SUM(oi.quantity) AS unitsSold, SUM(oi.totalPrice) AS revenue
        FROM orderItems oi
        INNER JOIN orders o ON o.id = oi.orderId
        WHERE o.status <> 'cancelled'
        GROUP BY oi.productName
        ORDER BY revenue DESC
        LIMIT 20
      `
    );

    return res.json({ products: rows });
  } catch (error) {
    return next(error);
  }
};
