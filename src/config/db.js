import mysql from "mysql2/promise";

let pool;

export const getDb = () => {
  if (!pool) {
    throw new Error("Database is not initialized");
  }

  return pool;
};

const initAuthUserTable = async () => {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS authUser (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('customer', 'b2b', 'admin') NOT NULL DEFAULT 'customer',
      tokenSalt VARCHAR(64) NOT NULL,
      isVerified TINYINT(1) NOT NULL DEFAULT 0,
      verificationToken VARCHAR(128) NULL,
      verificationExpires DATETIME NULL,
      refreshTokenHash TEXT NULL,
      refreshTokenExpires DATETIME NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_authUser_email (email),
      KEY idx_authUser_verificationToken (verificationToken)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [roleColumnRows] = await db.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'authUser'
        AND COLUMN_NAME = 'role'
    `
  );

  if (!Number(roleColumnRows[0]?.count || 0)) {
    await db.execute(
      "ALTER TABLE authUser ADD COLUMN role ENUM('customer', 'b2b', 'admin') NOT NULL DEFAULT 'customer'"
    );
  }
};

const initCatalogTables = async () => {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(140) NOT NULL,
      description TEXT NULL,
      imageUrl VARCHAR(500) NULL,
      parentId BIGINT UNSIGNED NULL,
      displayOrder INT NOT NULL DEFAULT 0,
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_categories_slug (slug),
      KEY idx_categories_parentId (parentId),
      CONSTRAINT fk_categories_parent FOREIGN KEY (parentId) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      categoryId BIGINT UNSIGNED NULL,
      name VARCHAR(180) NOT NULL,
      slug VARCHAR(200) NOT NULL,
      description TEXT NULL,
      fabricDetails TEXT NULL,
      careInstructions TEXT NULL,
      mrp DECIMAL(10,2) NOT NULL,
      discountPercent DECIMAL(5,2) NOT NULL DEFAULT 0,
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      isFeatured TINYINT(1) NOT NULL DEFAULT 0,
      isBestSeller TINYINT(1) NOT NULL DEFAULT 0,
      isNewArrival TINYINT(1) NOT NULL DEFAULT 0,
      seoTitle VARCHAR(255) NULL,
      seoDescription VARCHAR(500) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_products_slug (slug),
      KEY idx_products_categoryId (categoryId),
      KEY idx_products_flags (isActive, isFeatured, isBestSeller, isNewArrival),
      CONSTRAINT fk_products_category FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS productVariants (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      productId BIGINT UNSIGNED NOT NULL,
      sku VARCHAR(120) NOT NULL,
      size VARCHAR(40) NULL,
      color VARCHAR(40) NULL,
      stockQuantity INT NOT NULL DEFAULT 0,
      priceOverride DECIMAL(10,2) NULL,
      imageUrl VARCHAR(500) NULL,
      videoUrl VARCHAR(500) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_variants_sku (sku),
      KEY idx_variants_productId (productId),
      KEY idx_variants_stock (stockQuantity),
      CONSTRAINT fk_variants_product FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

const initCommerceTables = async () => {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS addresses (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      userId BIGINT UNSIGNED NOT NULL,
      type ENUM('shipping', 'billing') NOT NULL DEFAULT 'shipping',
      fullName VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      line1 VARCHAR(255) NOT NULL,
      line2 VARCHAR(255) NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      pincode VARCHAR(20) NOT NULL,
      country VARCHAR(80) NOT NULL DEFAULT 'India',
      isDefault TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_addresses_userId (userId),
      CONSTRAINT fk_addresses_user FOREIGN KEY (userId) REFERENCES authUser(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS carts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      userId BIGINT UNSIGNED NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_carts_userId (userId),
      CONSTRAINT fk_carts_user FOREIGN KEY (userId) REFERENCES authUser(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS cartItems (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      cartId BIGINT UNSIGNED NOT NULL,
      variantId BIGINT UNSIGNED NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_cart_variant (cartId, variantId),
      KEY idx_cartItems_cartId (cartId),
      CONSTRAINT fk_cartItems_cart FOREIGN KEY (cartId) REFERENCES carts(id) ON DELETE CASCADE,
      CONSTRAINT fk_cartItems_variant FOREIGN KEY (variantId) REFERENCES productVariants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      userId BIGINT UNSIGNED NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_wishlists_userId (userId),
      CONSTRAINT fk_wishlists_user FOREIGN KEY (userId) REFERENCES authUser(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wishlistItems (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      wishlistId BIGINT UNSIGNED NOT NULL,
      variantId BIGINT UNSIGNED NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_wishlist_variant (wishlistId, variantId),
      KEY idx_wishlistItems_wishlistId (wishlistId),
      CONSTRAINT fk_wishlistItems_wishlist FOREIGN KEY (wishlistId) REFERENCES wishlists(id) ON DELETE CASCADE,
      CONSTRAINT fk_wishlistItems_variant FOREIGN KEY (variantId) REFERENCES productVariants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS coupons (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(60) NOT NULL,
      type ENUM('percentage', 'flat') NOT NULL DEFAULT 'percentage',
      value DECIMAL(10,2) NOT NULL,
      minOrderValue DECIMAL(10,2) NULL,
      maxDiscountValue DECIMAL(10,2) NULL,
      validFrom DATETIME NULL,
      validTo DATETIME NULL,
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_coupons_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      orderNumber VARCHAR(40) NOT NULL,
      userId BIGINT UNSIGNED NULL,
      status ENUM('pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
      paymentStatus ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
      paymentMethod VARCHAR(30) NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      shippingCost DECIMAL(10,2) NOT NULL DEFAULT 0,
      taxAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
      discountAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
      totalAmount DECIMAL(10,2) NOT NULL,
      couponCode VARCHAR(60) NULL,
      gstAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
      shippingAddressJson JSON NULL,
      billingAddressJson JSON NULL,
      notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_orders_orderNumber (orderNumber),
      KEY idx_orders_userId (userId),
      KEY idx_orders_status (status),
      CONSTRAINT fk_orders_user FOREIGN KEY (userId) REFERENCES authUser(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS orderItems (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      orderId BIGINT UNSIGNED NOT NULL,
      productId BIGINT UNSIGNED NOT NULL,
      variantId BIGINT UNSIGNED NULL,
      productName VARCHAR(180) NOT NULL,
      productSlug VARCHAR(200) NOT NULL,
      variantLabel VARCHAR(180) NULL,
      quantity INT NOT NULL,
      unitPrice DECIMAL(10,2) NOT NULL,
      totalPrice DECIMAL(10,2) NOT NULL,
      imageUrl VARCHAR(500) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_orderItems_orderId (orderId),
      CONSTRAINT fk_orderItems_order FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_orderItems_product FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT,
      CONSTRAINT fk_orderItems_variant FOREIGN KEY (variantId) REFERENCES productVariants(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

const initB2BAndSupportTables = async () => {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS b2bProfiles (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      userId BIGINT UNSIGNED NOT NULL,
      businessName VARCHAR(180) NOT NULL,
      gstNumber VARCHAR(40) NULL,
      industry VARCHAR(120) NULL,
      expectedVolume VARCHAR(120) NULL,
      approvalStatus ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      customPriceSlabs JSON NULL,
      notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_b2bProfiles_userId (userId),
      CONSTRAINT fk_b2bProfiles_user FOREIGN KEY (userId) REFERENCES authUser(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS b2bInquiries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      businessName VARCHAR(180) NOT NULL,
      industry VARCHAR(120) NULL,
      contactName VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      expectedVolume VARCHAR(120) NULL,
      message TEXT NULL,
      status ENUM('new', 'in-review', 'closed') NOT NULL DEFAULT 'new',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_b2bInquiries_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS b2bOrders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      userId BIGINT UNSIGNED NOT NULL,
      profileId BIGINT UNSIGNED NOT NULL,
      variantId BIGINT UNSIGNED NOT NULL,
      quantity INT NOT NULL,
      requestedUnitPrice DECIMAL(10,2) NOT NULL,
      approvedUnitPrice DECIMAL(10,2) NULL,
      status ENUM('pending', 'approved', 'rejected', 'fulfilled') NOT NULL DEFAULT 'pending',
      notes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_b2bOrders_userId (userId),
      KEY idx_b2bOrders_status (status),
      CONSTRAINT fk_b2bOrders_user FOREIGN KEY (userId) REFERENCES authUser(id) ON DELETE CASCADE,
      CONSTRAINT fk_b2bOrders_profile FOREIGN KEY (profileId) REFERENCES b2bProfiles(id) ON DELETE CASCADE,
      CONSTRAINT fk_b2bOrders_variant FOREIGN KEY (variantId) REFERENCES productVariants(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS contactMessages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NULL,
      message TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS newsletterSubscribers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_newsletter_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

const seedCatalogData = async () => {
  const db = getDb();

  await db.execute(
    `INSERT IGNORE INTO categories (name, slug, description, displayOrder, isActive) VALUES
      ('Men', 'men', 'Premium menswear collection', 1, 1),
      ('Women', 'women', 'Luxury women fashion line', 2, 1),
      ('Accessories', 'accessories', 'Signature accessories and lifestyle', 3, 1)`
  );

  await db.execute(
    `INSERT IGNORE INTO products
      (categoryId, name, slug, description, fabricDetails, careInstructions, mrp, discountPercent, isActive, isFeatured, isBestSeller, isNewArrival)
      VALUES
      ((SELECT id FROM categories WHERE slug = 'men' LIMIT 1), 'The Gentleman''s Blazer', 'gentlemans-blazer', 'A masterclass in tailoring with modern silhouette.', 'Italian Super 150s wool', 'Dry clean only', 45000, 0, 1, 1, 1, 0),
      ((SELECT id FROM categories WHERE slug = 'women' LIMIT 1), 'Ethereal Silk Gown', 'ethereal-silk-gown', 'Fluid elegance for premium evenings.', 'Crepe de chine silk', 'Gentle dry clean', 32000, 0, 1, 1, 0, 1),
      ((SELECT id FROM categories WHERE slug = 'accessories' LIMIT 1), 'Heritage Leather Tote', 'heritage-leather-tote', 'Hand-stitched full-grain leather tote.', 'Vegetable-tanned leather', 'Wipe clean', 18500, 0, 1, 0, 1, 0),
      ((SELECT id FROM categories WHERE slug = 'men' LIMIT 1), 'Riviera Linen Suit', 'riviera-linen-suit', 'Breathable linen suit for summer wardrobes.', 'Irish linen', 'Dry clean', 52000, 10, 1, 0, 1, 1)`
  );

  await db.execute(
    `INSERT IGNORE INTO productVariants (productId, sku, size, color, stockQuantity, imageUrl)
      VALUES
      ((SELECT id FROM products WHERE slug = 'gentlemans-blazer' LIMIT 1), 'BLZ-NVY-40', '40', 'Navy', 5, '/mens-collection.png'),
      ((SELECT id FROM products WHERE slug = 'gentlemans-blazer' LIMIT 1), 'BLZ-NVY-42', '42', 'Navy', 3, '/mens-collection.png'),
      ((SELECT id FROM products WHERE slug = 'ethereal-silk-gown' LIMIT 1), 'DRS-CRM-S', 'S', 'Cream', 2, '/womens-collection.png'),
      ((SELECT id FROM products WHERE slug = 'ethereal-silk-gown' LIMIT 1), 'DRS-CRM-M', 'M', 'Cream', 4, '/womens-collection.png'),
      ((SELECT id FROM products WHERE slug = 'heritage-leather-tote' LIMIT 1), 'ACC-BAG-BRN', 'OS', 'Brown', 8, '/accessories-collection.png'),
      ((SELECT id FROM products WHERE slug = 'riviera-linen-suit' LIMIT 1), 'SUI-LIN-WHT-40', '40', 'White', 6, '/lookbook-summer.png')`
  );

  await db.execute(
    `INSERT IGNORE INTO coupons (code, type, value, minOrderValue, isActive)
      VALUES ('WELCOME10', 'percentage', 10, 2000, 1), ('JORA500', 'flat', 500, 5000, 1)`
  );
};

const normalizeSeedCategoryMapping = async () => {
  const db = getDb();

  await db.execute(
    `
      UPDATE products p
      INNER JOIN categories cMen ON cMen.slug = 'men'
      INNER JOIN categories cWomen ON cWomen.slug = 'women'
      SET p.categoryId = CASE
        WHEN p.slug IN ('ethereal-silk-gown', 'riviera-linen-suit') THEN cWomen.id
        ELSE cMen.id
      END
      WHERE p.slug IN ('gentlemans-blazer', 'ethereal-silk-gown', 'heritage-leather-tote', 'riviera-linen-suit')
    `
  );
};

export const connectDb = async () => {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;

  if (!host || !user || !database) {
    throw new Error("DB_HOST, DB_USER and DB_NAME are required");
  }

  pool = mysql.createPool({
    host,
    port: Number(process.env.DB_PORT || 3306),
    user,
    password: process.env.DB_PASSWORD || "",
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  const connection = await pool.getConnection();
  connection.release();

  await initAuthUserTable();
  await initCatalogTables();
  await initCommerceTables();
  await initB2BAndSupportTables();
  await seedCatalogData();
  await normalizeSeedCategoryMapping();
};
