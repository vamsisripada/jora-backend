import { getDb } from "../config/db.js";
import { fetchProductsWithVariants } from "../utils/sql.js";

const parseSort = (sort) => {
  switch (sort) {
    case "price_asc":
      return "ORDER BY COALESCE(pv.priceOverride, p.mrp) ASC, p.createdAt DESC";
    case "price_desc":
      return "ORDER BY COALESCE(pv.priceOverride, p.mrp) DESC, p.createdAt DESC";
    case "best_selling":
      return "ORDER BY p.isBestSeller DESC, p.createdAt DESC";
    case "newest":
    default:
      return "ORDER BY p.createdAt DESC";
  }
};

export const listProducts = async (req, res, next) => {
  try {
    const {
      category,
      size,
      fabric,
      color,
      minPrice,
      maxPrice,
      availability,
      search,
      sort = "newest",
      featured,
      bestSeller,
      newArrival,
      limit,
    } = req.query;

    const where = ["p.isActive = 1"];
    const values = [];

    if (category) {
      where.push("(c.slug = ? OR c.name = ?)");
      values.push(category, category);
    }

    if (size) {
      where.push("pv.size = ?");
      values.push(size);
    }

    if (fabric) {
      where.push("p.fabricDetails LIKE ?");
      values.push(`%${fabric}%`);
    }

    if (color) {
      where.push("pv.color = ?");
      values.push(color);
    }

    if (search) {
      where.push("(p.name LIKE ? OR p.description LIKE ?)");
      values.push(`%${search}%`, `%${search}%`);
    }

    if (availability === "in_stock") {
      where.push("pv.stockQuantity > 0");
    }

    if (featured === "true") {
      where.push("p.isFeatured = 1");
    }

    if (bestSeller === "true") {
      where.push("p.isBestSeller = 1");
    }

    if (newArrival === "true") {
      where.push("p.isNewArrival = 1");
    }

    if (minPrice) {
      where.push("COALESCE(pv.priceOverride, p.mrp) >= ?");
      values.push(Number(minPrice));
    }

    if (maxPrice) {
      where.push("COALESCE(pv.priceOverride, p.mrp) <= ?");
      values.push(Number(maxPrice));
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const products = await fetchProductsWithVariants({
      whereSql,
      values,
      orderSql: parseSort(sort),
      limitSql: limit ? `LIMIT ${Number(limit)}` : "",
    });

    res.json(products);
  } catch (error) {
    next(error);
  }
};

export const getProductBySlug = async (req, res, next) => {
  try {
    const products = await fetchProductsWithVariants({
      whereSql: "WHERE p.slug = ? AND p.isActive = 1",
      values: [req.params.slug],
      orderSql: "ORDER BY p.createdAt DESC",
      limitSql: "LIMIT 100",
    });

    const product = products[0];

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json(product);
  } catch (error) {
    return next(error);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const db = getDb();
    const {
      categoryId,
      name,
      slug,
      description,
      fabricDetails,
      careInstructions,
      mrp,
      discountPercent = 0,
      isFeatured = false,
      isBestSeller = false,
      isNewArrival = false,
      variants = [],
    } = req.body;

    if (!name || !slug || !mrp) {
      return res.status(400).json({ message: "name, slug and mrp are required" });
    }

    const [result] = await db.execute(
      `
        INSERT INTO products
          (categoryId, name, slug, description, fabricDetails, careInstructions, mrp, discountPercent, isFeatured, isBestSeller, isNewArrival, isActive)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        categoryId || null,
        name,
        slug,
        description || null,
        fabricDetails || null,
        careInstructions || null,
        Number(mrp),
        Number(discountPercent),
        isFeatured ? 1 : 0,
        isBestSeller ? 1 : 0,
        isNewArrival ? 1 : 0,
      ]
    );

    if (Array.isArray(variants) && variants.length) {
      for (const variant of variants) {
        await db.execute(
          `
            INSERT INTO productVariants
              (productId, sku, size, color, stockQuantity, priceOverride, imageUrl, videoUrl)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            result.insertId,
            variant.sku,
            variant.size || null,
            variant.color || null,
            Number(variant.stockQuantity || 0),
            variant.priceOverride || null,
            variant.imageUrl || null,
            variant.videoUrl || null,
          ]
        );
      }
    }

    const [products] = await db.execute(
      "SELECT slug FROM products WHERE id = ? LIMIT 1",
      [result.insertId]
    );

    req.params.slug = products[0].slug;
    return getProductBySlug(req, res, next);
  } catch (error) {
    return next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      categoryId,
      name,
      slug,
      description,
      fabricDetails,
      careInstructions,
      mrp,
      discountPercent,
      isActive,
      isFeatured,
      isBestSeller,
      isNewArrival,
    } = req.body;

    await db.execute(
      `
        UPDATE products
        SET
          categoryId = COALESCE(?, categoryId),
          name = COALESCE(?, name),
          slug = COALESCE(?, slug),
          description = COALESCE(?, description),
          fabricDetails = COALESCE(?, fabricDetails),
          careInstructions = COALESCE(?, careInstructions),
          mrp = COALESCE(?, mrp),
          discountPercent = COALESCE(?, discountPercent),
          isActive = COALESCE(?, isActive),
          isFeatured = COALESCE(?, isFeatured),
          isBestSeller = COALESCE(?, isBestSeller),
          isNewArrival = COALESCE(?, isNewArrival)
        WHERE id = ?
      `,
      [
        categoryId ?? null,
        name ?? null,
        slug ?? null,
        description ?? null,
        fabricDetails ?? null,
        careInstructions ?? null,
        mrp ?? null,
        discountPercent ?? null,
        typeof isActive === "boolean" ? Number(isActive) : null,
        typeof isFeatured === "boolean" ? Number(isFeatured) : null,
        typeof isBestSeller === "boolean" ? Number(isBestSeller) : null,
        typeof isNewArrival === "boolean" ? Number(isNewArrival) : null,
        id,
      ]
    );

    const [rows] = await db.execute("SELECT slug FROM products WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) {
      return res.status(404).json({ message: "Product not found" });
    }

    req.params.slug = rows[0].slug;
    return getProductBySlug(req, res, next);
  } catch (error) {
    return next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const db = getDb();
    await db.execute("UPDATE products SET isActive = 0 WHERE id = ?", [req.params.id]);

    return res.json({ message: "Product archived" });
  } catch (error) {
    return next(error);
  }
};
