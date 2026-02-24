import { getDb } from "../config/db.js";

export const getCategories = async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `
        SELECT *
        FROM categories
        WHERE isActive = 1
        ORDER BY displayOrder ASC, name ASC
      `
    );

    const data = rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      description: row.description,
      image_url: row.imageUrl,
      parent_id: row.parentId ? Number(row.parentId) : null,
      display_order: Number(row.displayOrder),
    }));

    return res.json(data);
  } catch (error) {
    return next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const db = getDb();
    const { name, slug, description, imageUrl, parentId, displayOrder = 0 } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ message: "name and slug are required" });
    }

    const [result] = await db.execute(
      `
        INSERT INTO categories (name, slug, description, imageUrl, parentId, displayOrder, isActive)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
      [name, slug, description || null, imageUrl || null, parentId || null, Number(displayOrder)]
    );

    return res.status(201).json({ id: Number(result.insertId), name, slug });
  } catch (error) {
    return next(error);
  }
};
