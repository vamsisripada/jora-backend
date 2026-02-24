import { getDb } from "../config/db.js";

export const mapProductRow = (row) => ({
  id: String(row.id),
  category_id: row.categoryId ? Number(row.categoryId) : null,
  category_slug: row.categorySlug || null,
  category_name: row.categoryName || null,
  name: row.name,
  slug: row.slug,
  description: row.description,
  fabric_details: row.fabricDetails,
  care_instructions: row.careInstructions,
  base_price: Number(row.mrp),
  discount_percentage: Number(row.discountPercent),
  is_active: Boolean(row.isActive),
  is_featured: Boolean(row.isFeatured),
  is_best_seller: Boolean(row.isBestSeller),
  is_new_arrival: Boolean(row.isNewArrival),
  created_at: row.createdAt,
  variants: [],
});

export const mapVariantRow = (row) => ({
  id: Number(row.id),
  product_id: String(row.productId),
  sku: row.sku,
  size: row.size,
  color: row.color,
  stock_quantity: Number(row.stockQuantity),
  price_override: row.priceOverride == null ? null : Number(row.priceOverride),
  images: row.imageUrl ? [row.imageUrl] : [],
  video_url: row.videoUrl || null,
});

export const fetchProductsWithVariants = async ({
  whereSql = "WHERE p.isActive = 1",
  values = [],
  orderSql = "ORDER BY p.createdAt DESC",
  limitSql = "",
}) => {
  const db = getDb();

  const [rows] = await db.execute(
    `
      SELECT
        p.*,
        c.slug AS categorySlug,
        c.name AS categoryName,
        pv.id AS variantId,
        pv.productId AS variantProductId,
        pv.sku AS variantSku,
        pv.size AS variantSize,
        pv.color AS variantColor,
        pv.stockQuantity AS variantStockQuantity,
        pv.priceOverride AS variantPriceOverride,
        pv.imageUrl AS variantImageUrl,
        pv.videoUrl AS variantVideoUrl
      FROM products p
      LEFT JOIN categories c ON c.id = p.categoryId
      LEFT JOIN productVariants pv ON pv.productId = p.id
      ${whereSql}
      ${orderSql}
      ${limitSql}
    `,
    values
  );

  const productsMap = new Map();

  for (const row of rows) {
    if (!productsMap.has(row.id)) {
      productsMap.set(row.id, mapProductRow(row));
    }

    if (row.variantId) {
      productsMap.get(row.id).variants.push({
        id: Number(row.variantId),
        product_id: String(row.variantProductId),
        sku: row.variantSku,
        size: row.variantSize,
        color: row.variantColor,
        stock_quantity: Number(row.variantStockQuantity),
        price_override:
          row.variantPriceOverride == null ? null : Number(row.variantPriceOverride),
        images: row.variantImageUrl ? [row.variantImageUrl] : [],
        video_url: row.variantVideoUrl || null,
      });
    }
  }

  return Array.from(productsMap.values());
};

export const ensureCart = async (userId) => {
  const db = getDb();

  await db.execute("INSERT IGNORE INTO carts (userId) VALUES (?)", [userId]);
  const [rows] = await db.execute("SELECT id FROM carts WHERE userId = ? LIMIT 1", [userId]);

  return Number(rows[0].id);
};

export const ensureWishlist = async (userId) => {
  const db = getDb();

  await db.execute("INSERT IGNORE INTO wishlists (userId) VALUES (?)", [userId]);
  const [rows] = await db.execute("SELECT id FROM wishlists WHERE userId = ? LIMIT 1", [userId]);

  return Number(rows[0].id);
};

export const buildOrderNumber = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);

  return `JORA-${y}${m}${d}-${rand}`;
};
