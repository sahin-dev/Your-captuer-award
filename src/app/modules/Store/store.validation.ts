import { z } from 'zod';
import { ProductType, Category, ProductStatus } from '../../../prismaClient';

/**
 * Validation schema for creating a product
 */
export const createProductSchema = z.object({
    body: z.object({
        title: z.string()
            .min(1, 'Title is required')
            .min(3, 'Title must be at least 3 characters')
            .max(100, 'Title must not exceed 100 characters'),
        category: z.enum([Category.COINS, Category.BUNDLES])
            .refine(val => Object.values(Category).includes(val), {
                message: 'Invalid category. Must be COINS or BUNDLES'
            }),
        items: z.array(
            z.object({
                type: z.enum([ProductType.COIN, ProductType.KEY, ProductType.BOOST, ProductType.SWAP])
                    .refine(val => Object.values(ProductType).includes(val), {
                        message: 'Invalid product type'
                    }),
                quantity: z.number()
                    .int('Quantity must be an integer')
                    .positive('Quantity must be positive')
            })
        ).min(1, 'At least one item is required'),
        quantity: z.number()
            .int('Quantity must be an integer')
            .nonnegative('Quantity must be non-negative'),
        amount: z.number()
            .nonnegative('Amount must be non-negative'),
        currency: z.string()
            .min(1, 'Currency is required')
            .max(10, 'Currency code must not exceed 10 characters'),
        description: z.string().optional(),
    })
});

/**
 * Validation schema for updating a product
 */
export const updateProductSchema = z.object({
    body: z.object({
        title: z.string()
            .min(3, 'Title must be at least 3 characters')
            .max(100, 'Title must not exceed 100 characters')
            .optional(),
        amount: z.number()
            .nonnegative('Amount must be non-negative')
            .optional(),
        quantity: z.number()
            .int('Quantity must be an integer')
            .nonnegative('Quantity must be non-negative')
            .optional(),
        items: z.array(
            z.object({
                type: z.enum([ProductType.COIN, ProductType.KEY, ProductType.BOOST, ProductType.SWAP]),
                quantity: z.number()
                    .int('Quantity must be an integer')
                    .positive('Quantity must be positive')
            })
        ).min(1, 'At least one item is required').optional(),
        description: z.string().optional(),
        image: z.string().url('Image must be a valid URL').optional(),
        icon: z.string().url('Icon must be a valid URL').optional(),
        status: z.enum([ProductStatus.ACTIVE, ProductStatus.INACTIVE, ProductStatus.DISCONTINUED]).optional()
    }).strict()
});

/**
 * Validation schema for creating product pricing
 */
export const createPriceSchema = z.object({
    body: z.object({
        name: z.string()
            .min(1, 'Price name is required')
            .max(50, 'Price name must not exceed 50 characters'),
        amount: z.number()
            .nonnegative('Amount must be non-negative'),
        quantity: z.number()
            .int('Quantity must be an integer')
            .positive('Quantity must be positive'),
        price_id: z.string()
            .min(1, 'Price ID is required')
    })
});

/**
 * Validation schema for search products query
 */
export const searchProductsSchema = z.object({
    query: z.object({
        query: z.string().optional(),
        category: z.enum([Category.COINS, Category.BUNDLES]).optional(),
        page: z.string().transform(Number).refine(n => n > 0, 'Page must be greater than 0').optional(),
        limit: z.string().transform(Number).refine(n => n > 0 && n <= 100, 'Limit must be between 1 and 100').optional()
    })
});

/**
 * Validation schema for pagination query
 */
export const paginationSchema = z.object({
    query: z.object({
        page: z.string().transform(Number).refine(n => n > 0, 'Page must be greater than 0').optional(),
        limit: z.string().transform(Number).refine(n => n > 0 && n <= 100, 'Limit must be between 1 and 100').optional(),
        category: z.enum([Category.COINS, Category.BUNDLES]).optional()
    })
});

/**
 * Validation schema for purchasing a product
 */
export const purchaseProductSchema = z.object({
    body: z.object({
        quantity: z.number()
            .int('Quantity must be an integer')
            .positive('Quantity must be positive')
            .default(1)
    })
});

/**
 * Validation schema for product ID param
 */
export const productIdParamSchema = z.object({
    params: z.object({
        productId: z.string().min(1, 'Product ID is required')
    })
});

/**
 * Validation schema for price ID param
 */
export const priceIdParamSchema = z.object({
    params: z.object({
        priceId: z.string().min(1, 'Price ID is required')
    })
});

/**
 * Validation schema for category param
 */
export const categoryParamSchema = z.object({
    params: z.object({
        category: z.enum([Category.COINS, Category.BUNDLES])
            .refine(val => Object.values(Category).includes(val), {
                message: 'Invalid category. Must be COINS or BUNDLES'
            })
    })
});
