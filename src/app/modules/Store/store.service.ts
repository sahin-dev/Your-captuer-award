import { ProductType, ProductStatus, Category, UserRole } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { paginationHelper } from "../../../helpers/paginationHelper";
import ApiError from "../../../errors/ApiError";
import httpStatus from 'http-status';
import { userStoreService } from "../User/UserStore/userStore.service";
import { paymentService } from "../Payment/payment.service";
import { fileUploader } from "../../../helpers/fileUploader";
import config from "../../../config";

/**
 * Add a new product to the store
 */
const addProduct = async (userId: string, productData: {
    title: string;
    category: Category;
    items: Array<{ type: ProductType; quantity: number }>;
    quantity: number;
    amount: number;
    currency: string;
    description?: string;
}, file?: Express.Multer.File) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.role !== UserRole.ADMIN) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "User not found or User unauthorized");
    }

    // if(!file){
    //     throw new ApiError(httpStatus.BAD_REQUEST, "Product image is required");
    // }

    if (!productData.title || !productData.category  || productData.amount === undefined) {

        throw new ApiError(httpStatus.BAD_REQUEST, "Missing required product fields (title, category, amount)");
    }

    if (!productData.currency) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Currency is required");
    }

    // Convert quantity and amount to numbers
    const parsedAmount = Number(productData.amount);
    

     

    if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Amount must be a non-negative number");
    }

    let parsedItems: Array<{ type: ProductType; quantity: number }> = [];

    if(productData.category === Category.BUNDLES){

        if (!Array.isArray(productData.items) || productData.items.length === 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Items array is required and must not be empty");
        }
        productData.currency = "COINS"
         // Validate and parse items
        parsedItems = productData.items.map(item => {
            const parsedItemQuantity = Number(item.quantity);
            if (!item.type || isNaN(parsedItemQuantity) || parsedItemQuantity <= 0) {
                throw new ApiError(httpStatus.BAD_REQUEST, "Each item must have a valid type and positive quantity");
            }
            return {
                type: item.type,
                quantity: parsedItemQuantity
            };
        });

    }

    if (productData.category === Category.COINS) {
        const parsedQuantity = Number(productData.quantity);
        if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Quantity must be a positive integer for COINS category");
        }
        productData.quantity = parsedQuantity;
    }


   
    // Upload the file
    let imageUrl: string | null = null;
    if (file) {
        const uploadedFile = await fileUploader.uploadToFilesystem(file);
        imageUrl = uploadedFile.Location;
    }

    const product = await prisma.product.create({
        data: {
            title: productData.title,
            category: productData.category,
            items: parsedItems,
            quantity: productData.quantity,
            amount: parsedAmount,
            currency: productData.currency,
            description: productData.description || "",
            image: imageUrl,
            status: ProductStatus.ACTIVE
        }
    });

    return product;
};


/**
 * Get all products by category with pagination
 */
const getAllProductByCategory = async (
    category: Category,
    page: number = 1,
    limit: number = 10
) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page,
        limit
    });

    const products = await prisma.product.findMany({
        where: {
            category: category,
            status: ProductStatus.ACTIVE
        },
        skip,
        take: paginationLimit,
        orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.product.count({
        where: {
            category: category,
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
 * Get all products with optional category filter
 */
const getAllProducts = async (
    category?: Category,
    page: number = 1,
    limit: number = 10
) => {
    if (category) {
        return getAllProductByCategory(category, page, limit);
    }

    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page,
        limit
    });

    const products = await prisma.product.findMany({
        where: { status: ProductStatus.ACTIVE },
        skip,
        take: paginationLimit,
        orderBy: { createdAt: 'desc' }
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
        items?: Array<{ type: ProductType; quantity: number }>;
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

    // Validate items if provided
    if (data.items) {
        if (!Array.isArray(data.items) || data.items.length === 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Items array must not be empty");
        }
        for (const item of data.items) {
            if (!item.type || item.quantity === undefined || item.quantity <= 0) {
                throw new ApiError(httpStatus.BAD_REQUEST, "Each item must have a valid type and positive quantity");
            }
        }
    }

    const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data
    });

    return updatedProduct;
};

/**
 * Delete product (soft delete by marking as DISCONTINUED)
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

    // Soft delete: mark as DISCONTINUED
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
    return product.status === ProductStatus.ACTIVE
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
 * Search products by category and keyword
 */
const searchProducts = async (
    query?: string,
    category?: Category,
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

    if (category) {
        whereClause.category = category;
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
        orderBy: { createdAt: 'desc' }
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

/**
 * Get product prices
 */
const getProductPrices = async (productId: string) => {
    if (!productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Product ID is required");
    }

    const prices = await prisma.price.findMany({
        where: { product_id: productId },
        orderBy: { createdAt: 'desc' }
    });

    return prices;
};

/**
 * Add pricing for a product
 */
const addProductPrice = async (productId: string, priceData: {
    name: string;
    amount: number;
    quantity: number;
    price_id: string;
}) => {
    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (!priceData.name || priceData.amount === undefined || priceData.quantity === undefined || !priceData.price_id) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Missing required price fields (name, amount, quantity, price_id)");
    }

    const price = await prisma.price.create({
        data: {
            ...priceData,
            product_id: productId
        }
    });

    return price;
};

/**
 * Delete product price
 */
const deleteProductPrice = async (priceId: string) => {
    if (!priceId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Price ID is required");
    }

    const price = await prisma.price.findUnique({
        where: { id: priceId }
    });

    if (!price) {
        throw new ApiError(httpStatus.NOT_FOUND, "Price not found");
    }

    const deletedPrice = await prisma.price.delete({
        where: { id: priceId }
    });

    return deletedPrice;
};

/**
 * Purchase product from store
 */
const purchaseProduct = async (userId: string, productId: string) => {

    const userStore = await userStoreService.getStoreData(userId);

    if (!userStore) {
        throw new ApiError(httpStatus.NOT_FOUND, "User store not found");
    }

    const product = await prisma.product.findUnique({
        where: { id: productId }
    });

    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (product.status !== ProductStatus.ACTIVE) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Product is not available for purchase");
    }
    
    if(product.category === Category.BUNDLES){

       return await purchaseProductUsingCoin(userId, productId)

    }

    return await purchaseProductWithStripe(userId, productId)
    
  
};

const purchaseProductUsingCoin = async (userId: string, productId: string) => {

    const userStore = await userStoreService.getStoreData(userId);

    if (!userStore) {
        throw new ApiError(httpStatus.NOT_FOUND, "User store not found");
    }
    const productDetails = await getProductDetails(productId);
    if (!productDetails) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (productDetails.amount > userStore.coins) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient coins for purchase");
    }

     await prisma.$transaction(async (tx) => {
        await prisma.userStore.update({
                where: { userId },
                data: {
                    coins: {
                        decrement: productDetails.amount
                    }
                }
            });
        
        for (const item of productDetails.items) {
            const totalQuantity = item.quantity;
            const type = item.type.toLowerCase() as "key" | "boost" | "swap";
            await userStoreService.addUserStoreBasedOnType(userId, type, totalQuantity);
        }
     })

     return { message: "Product purchased successfully using coins" };

}

const purchaseProductWithStripe = async (userId: string, productId: string) => {
      try {
        const successUrl = config.success_url || "http://localhost:3000/success";
        const cancelUrl = config.cancel_url || "http://localhost:3000/cancel";
            return await paymentService.pay(userId,productId, null,"payment",successUrl, cancelUrl)
        }catch(error){
            console.log("Payment processing error:", error);
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Payment processing failed");
        }
        
}

export const storeService = {
    addProduct,
    getAllProductByCategory,
    getAllProducts,
    getProductDetails,
    updateProduct,
    deleteProduct,
    restoreProduct,
    isProductAvailable,
    reduceProductQuantity,
    increaseProductQuantity,
    searchProducts,
    purchaseProduct,
    getProductPrices,
    addProductPrice,
    deleteProductPrice
};