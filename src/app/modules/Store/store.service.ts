import { Product, ProductType, ProductStatus } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { paginationHelper } from "../../../helpers/paginationHelper";
import ApiError from "../../../errors/ApiError";
import httpStatus from 'http-status';

/**
 * Add a new product to the store
 */
const addProduct = async (productData: {
    title: string;
    productType: ProductType;
    quantity: number;
    amount: number;
    description?: string;
    image?: string;
    icon?: string;
}) => {
    // Validate input
    if (!productData.title || !productData.productType) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Title and product type are required");
    }

    if (productData.amount < 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Amount cannot be negative");
    }

    const product = await prisma.product.create({
        data: {
            ...productData,
            status: ProductStatus.ACTIVE
        }
    });

    return product;
};

/**
 * Get all products by type with pagination
 */
const getAllProductByType = async (
    type: ProductType,
    page: number = 1,
    limit: number = 10
) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page,
        limit
    });

    const products = await prisma.product.findMany({
        where: {
            productType: type,
            status: ProductStatus.ACTIVE
        },
        skip,
        take: paginationLimit,
        orderBy: { id: 'desc' }
    });

    const total = await prisma.product.count({
        where: {
            productType: type,
            status: ProductStatus.ACTIVE
        }
    });

    const totalPages = Math.ceil(total / paginationLimit);

    return {
        meta: {
            page,
            limit: paginationLimit,
            total,
            totalPages
        },
        data: products
    };
};

/**
 * Get all products with optional type filter
 */
const getAllProduct = async (
    type?: ProductType,
    page: number = 1,
    limit: number = 10
) => {
    if (type) {
        return getAllProductByType(type, page, limit);
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page,
        limit
    });

    const products = await prisma.product.findMany({
        where: { status: ProductStatus.ACTIVE },
        skip,
        take: paginationLimit,
        orderBy: { id: 'desc' }
    });

    const total = await prisma.product.count({
        where: { status: ProductStatus.ACTIVE }
    });

    const totalPages = Math.ceil(total / paginationLimit);

    return {
        meta: {
            page,
            limit: paginationLimit,
            total,
            totalPages
        },
        data: products
    };
};

/**
 * Get product details by ID
 */
const getProductDetails = async (productId: string) => {
    if (!productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Product ID is required");
    }

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    return product;
};

/**
 * Update product information
 */
const updateProduct = async (
    productId: string,
    data: Partial<{
        title: string;
        amount: number;
        quantity: number;
        description?: string;
        image?: string;
        icon?: string;
        status?: ProductStatus;
    }>
) => {
    if (!productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Product ID is required");
    }

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    // Validate amount if provided
    if (data.amount !== undefined && data.amount < 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Amount cannot be negative");
    }

    const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data
    });

    return updatedProduct;
};

/**
 * Delete product (soft delete by marking as INACTIVE)
 */
const deleteProduct = async (productId: string) => {
    if (!productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Product ID is required");
    }

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    // Soft delete: mark as INACTIVE
    const deletedProduct = await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.DISCONTINUED }
    });

    return deletedProduct;
};

/**
 * Restore a deleted/discontinued product
 */
const restoreProduct = async (productId: string) => {
    if (!productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Product ID is required");
    }

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    const restoredProduct = await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ACTIVE }
    });

    return restoredProduct;
};

/**
 * Check product availability (quantity > 0)
 */
const isProductAvailable = async (productId: string): Promise<boolean> => {
    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) return false;
    return product.status === ProductStatus.ACTIVE && product.quantity > 0;
};

/**
 * Reduce product quantity after purchase
 */
const reduceProductQuantity = async (productId: string, quantity: number) => {
    if (quantity <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Quantity must be greater than 0");
    }

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (product.quantity < quantity) {
        throw new ApiError(httpStatus.CONFLICT, "Insufficient product quantity");
    }

    const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data: {
            quantity: {
                decrement: quantity
            }
        }
    });

    return updatedProduct;
};

/**
 * Increase product quantity (for refunds or restocking)
 */
const increaseProductQuantity = async (productId: string, quantity: number) => {
    if (quantity <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Quantity must be greater than 0");
    }

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data: {
            quantity: {
                increment: quantity
            }
        }
    });

    return updatedProduct;
};

/**
 * Search products by type and keyword
 */
const searchProducts = async (
    query?: string,
    type?: ProductType,
    page: number = 1,
    limit: number = 10
) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page,
        limit
    });

    const whereClause: any = {
        status: ProductStatus.ACTIVE
    };

    if (type) {
        whereClause.productType = type;
    }

    if (query) {
        whereClause.OR = [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } }
        ];
    }

    const products = await prisma.product.findMany({
        where: whereClause,
        skip,
        take: paginationLimit,
        orderBy: { id: 'desc' }
    });

    const total = await prisma.product.count({ where: whereClause });
    const totalPages = Math.ceil(total / paginationLimit);

    return {
        meta: {
            page,
            limit: paginationLimit,
            total,
            totalPages
        },
        data: products
    };
};

export const storeService = {
    addProduct,
    getAllProductByType,
    getProductDetails,
    updateProduct,
    deleteProduct,
    restoreProduct,
    getAllProduct,
    isProductAvailable,
    reduceProductQuantity,
    increaseProductQuantity,
    searchProducts
};