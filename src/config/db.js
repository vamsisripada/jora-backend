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
};
