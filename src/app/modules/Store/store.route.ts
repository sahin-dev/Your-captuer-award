import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { storeController } from "./store.controller";
import { fileUploader } from "../../../helpers/fileUploader";
import { UserRole } from "../../../prismaClient";

const router = Router();

/**
 * GET /api/store/search - Search products
 */
router.get("/search", auth(), storeController.searchProducts);

/**
 * GET /api/store - Get all products with optional category filter
 */
router.get("/", auth(), storeController.getAllProducts);

router.get("/", auth(), storeController.getAllProducts);

/**
 * GET /api/store/category/:category - Get products by category
 */
router.get("/category/:category", auth(), storeController.getProductsByCategory);

/**
 * POST /api/store - Add new product (admin only)
 */
router.post("/", fileUploader.filesystemUpload.single("image"), auth(UserRole.ADMIN), storeController.addStoreProduct);

/**
 * GET /api/store/:productId - Get product details
 */
router.get("/:productId", auth(), storeController.getProductDetails);

/**
 * PATCH /api/store/:productId - Update product (admin only)
 */
router.patch("/:productId",fileUploader.filesystemUpload.single("image"), auth(UserRole.ADMIN), storeController.updateStoreProduct);

/**
 * DELETE /api/store/:productId - Delete product (soft delete) (admin only)
 */
router.delete("/:productId", auth(UserRole.ADMIN), storeController.deleteStoreProduct);

/**
 * POST /api/store/:productId/restore - Restore deleted product (admin only)
 */
router.post("/:productId/restore", auth(UserRole.ADMIN), storeController.restoreProduct);

/**
 * GET /api/store/:productId/prices - Get product prices
 */
router.get("/:productId/prices", auth(), storeController.getProductPrices);

/**
 * POST /api/store/:productId/prices - Add product price (admin only)
 */
router.post("/:productId/prices", auth(UserRole.ADMIN), storeController.addProductPrice);

/**
 * DELETE /api/store/prices/:priceId - Delete product price (admin only)
 */
router.delete("/prices/:priceId", auth(UserRole.ADMIN), storeController.deleteProductPrice);

/**
 * POST /api/store/:productId/purchase - Purchase a product
 */
router.post("/:productId/purchase", auth(), storeController.purchaseProduct);

export const storeRoutes = router;