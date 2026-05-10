import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { storeController } from "./store.controller";
import { UserRole } from "../../../prismaClient";


const router = Router()

/**
 * Search products
 */
router.get("/search", auth(), storeController.searchProducts)

/**
 * Get all products with optional filtering
 */
router.get("/", auth(), storeController.getAllProducts)

/**
 * Get products by type
 */
router.get("/type/:type", auth(), storeController.getProductsByType)

/**
 * Add new product (admin only)
 */
router.post("/", auth(UserRole.ADMIN), storeController.addStoreProduct)

/**
 * Get product details
 */
router.get("/:productId", auth(), storeController.getProductDetails)

/**
 * Update product (admin only)
 */
router.patch("/:productId", auth(UserRole.ADMIN), storeController.updateStoreProduct)

/**
 * Delete product (soft delete) (admin only)
 */
router.delete("/:productId", auth(UserRole.ADMIN), storeController.deleteStoreProduct)

/**
 * Restore deleted product (admin only)
 */
router.post("/:productId/restore", auth(UserRole.ADMIN), storeController.restoreProduct)

export const storeRoutes = router