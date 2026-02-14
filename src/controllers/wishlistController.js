import Wishlist from "../models/Wishlist.js";

export const getWishlist = async (req, res, next) => {
  try {
    let wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (!wishlist) {
      wishlist = await Wishlist.create({
        userId: req.user.id,
        items: [],
      });
    }

    return res.json({ wishlist });
  } catch (error) {
    return next(error);
  }
};

export const addToWishlist = async (req, res, next) => {
  try {
    const { productId, productSlug, name, price, image, size, color } = req.body;

    if (!productId || !name || !price) {
      return res.status(400).json({ message: "Product details are required" });
    }

    let wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (!wishlist) {
      wishlist = new Wishlist({
        userId: req.user.id,
        items: [],
      });
    }

    // Check if item already exists
    const existingItem = wishlist.items.find(
      (item) => item.productId === productId && item.size === size && item.color === color
    );

    if (existingItem) {
      return res.status(400).json({ message: "Item already in wishlist" });
    }

    wishlist.items.push({
      productId,
      productSlug,
      name,
      price,
      image,
      size,
      color,
    });

    await wishlist.save();

    return res.json({ wishlist, message: "Item added to wishlist" });
  } catch (error) {
    return next(error);
  }
};

export const removeFromWishlist = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (!wishlist) {
      return res.status(404).json({ message: "Wishlist not found" });
    }

    wishlist.items = wishlist.items.filter(
      (item) => item._id.toString() !== itemId
    );

    await wishlist.save();

    return res.json({ wishlist, message: "Item removed from wishlist" });
  } catch (error) {
    return next(error);
  }
};

export const clearWishlist = async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (!wishlist) {
      return res.status(404).json({ message: "Wishlist not found" });
    }

    wishlist.items = [];
    await wishlist.save();

    return res.json({ wishlist, message: "Wishlist cleared" });
  } catch (error) {
    return next(error);
  }
};
