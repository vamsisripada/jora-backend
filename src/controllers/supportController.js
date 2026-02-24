import { getDb } from "../config/db.js";

export const createContactMessage = async (req, res, next) => {
  try {
    const db = getDb();
    const { name, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "name, email and message are required" });
    }

    await db.execute(
      `
        INSERT INTO contactMessages (name, email, phone, message)
        VALUES (?, ?, ?, ?)
      `,
      [name, email.toLowerCase(), phone || null, message]
    );

    return res.status(201).json({ message: "Message submitted successfully" });
  } catch (error) {
    return next(error);
  }
};

export const subscribeNewsletter = async (req, res, next) => {
  try {
    const db = getDb();
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    await db.execute(
      `
        INSERT INTO newsletterSubscribers (email)
        VALUES (?)
        ON DUPLICATE KEY UPDATE email = VALUES(email)
      `,
      [email.toLowerCase()]
    );

    return res.status(201).json({ message: "Subscribed successfully" });
  } catch (error) {
    return next(error);
  }
};
