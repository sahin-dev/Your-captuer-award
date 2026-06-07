import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import { storeService } from "./store.service";
import sendResponse from "../../../shared/ApiResponse";
import httpStatus from 'http-status'
import { Category } from "../../../prismaClient";

/**
 * Add a new product to the store (admin only)
 */
const addStoreProduct = catchAsync(async (req: Request, res: Response) => {
    const { title, category, items, quantity, amount, currency, description } = req.body;
    const userId = req.user.id;
    const file = req.file;

    console.log("Received product data:", req.body);
    console.log("Received file:", file);

    const quantityNumber = Number(quantity);
    const amountNumber = Number(amount);

    // Parse items quantities to numbers
    const parsedItems = Array.isArray(items) ? items.map((item: any) => ({
        type: item.type,
        quantity: Number(item.quantity)
    })) : items;

    const addedProduct = await storeService.addProduct(userId, {
        title,
        category,
        items: parsedItems,
        quantity: quantityNumber,
        amount: amountNumber,
        currency,
        description
    }, file);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: "Product created successfully",
        data: addedProduct
    });
});

/**
 * Get all products with optional category filter
 */
const getAllProducts = catchAsync(async (req: Request, res: Response) => {
    const { category, page = 1, limit = 10 } = req.query;

    const result = await storeService.getAllProducts(
        category as Category | undefined,
        Number(page),
        Number(limit)
    );

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Store products fetched successfully",
        data: result.data,
        meta: result.meta
    });
});

/**
 * Get product details by ID
 */
const getProductDetails = catchAsync(async (req: Request, res: Response) => {
    const { productId } = req.params;

    const product = await storeService.getProductDetails(productId);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Product details fetched successfully",
        data: product
    });
});

/**
 * Update product information (admin only)
 */
const updateStoreProduct = catchAsync(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const updateData = req.body;

    const updatedProduct = await storeService.updateProduct(productId, updateData);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Product updated successfully",
        data: updatedProduct
    });
});

/**
 * Delete product (soft delete) (admin only)
 */
const deleteStoreProduct = catchAsync(async (req: Request, res: Response) => {
    const { productId } = req.params;

    const deletedProduct = await storeService.deleteProduct(productId);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Product deleted successfully",
        data: deletedProduct
    });
});

/**
 * Restore deleted product (admin only)
 */
const restoreProduct = catchAsync(async (req: Request, res: Response) => {
    const { productId } = req.params;

    const restoredProduct = await storeService.restoreProduct(productId);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Product restored successfully",
        data: restoredProduct
    });
});

/**
 * Search products by category and keyword
 */
const searchProducts = catchAsync(async (req: Request, res: Response) => {
    const { query, category, page = 1, limit = 10 } = req.query;

    const result = await storeService.searchProducts(
        query as string | undefined,
        category as Category | undefined,
        Number(page),
        Number(limit)
    );

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Products search completed successfully",
        data: result.data,
        meta: result.meta
    });
});

/**
 * Get products by category with pagination
 */
const getProductsByCategory = catchAsync(async (req: Request, res: Response) => {
    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await storeService.getAllProductByCategory(
        category as Category,
        Number(page),
        Number(limit)
    );

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Products fetched by category successfully",
        data: result.data,
        meta: result.meta
    });
});

/**
 * Get prices for a product
 */
const getProductPrices = catchAsync(async (req: Request, res: Response) => {
    const { productId } = req.params;

    const prices = await storeService.getProductPrices(productId);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Product prices fetched successfully",
        data: prices
    });
});

/**
 * Add pricing for a product (admin only)
 */
const addProductPrice = catchAsync(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const { name, amount, quantity, price_id } = req.body;

    const price = await storeService.addProductPrice(productId, {
        name,
        amount,
        quantity,
        price_id
    });

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: "Product price added successfully",
        data: price
    });
});

/**
 * Delete product price (admin only)
 */
const deleteProductPrice = catchAsync(async (req: Request, res: Response) => {
    const { priceId } = req.params;

    const deletedPrice = await storeService.deleteProductPrice(priceId);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Product price deleted successfully",
        data: deletedPrice
    });
});

/**
 * Purchase a product
 */
const purchaseProduct = catchAsync(async (req: Request, res: Response) => {
    const { productId } = req.params;

    const userId = req.user.id;

    const result = await storeService.purchaseProduct(userId, productId);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Product purchased successfully",
        data: result
    });
});

export const storeController = {
    addStoreProduct,
    getAllProducts,
    getProductDetails,
    updateStoreProduct,
    deleteStoreProduct,
    restoreProduct,
    searchProducts,
    getProductsByCategory,
    getProductPrices,
    addProductPrice,
    deleteProductPrice,
    purchaseProduct
};