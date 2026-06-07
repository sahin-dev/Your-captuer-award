# Store Module - Refactored Implementation

## Overview
The Store module has been completely refactored to align with the `store.prisma` schema. The module now properly handles products with categories, items, and pricing tiers.

## Key Changes

### 1. Schema Alignment

**Before:**
- Used `productType` field (ProductType enum: COIN, KEY, BOOST, SWAP)
- No category concept
- No pricing tier support

**After:**
- Uses `category` field (Category enum: COINS, BUNDLES)
- Products contain `items` array with types and quantities
- Full `Price` model support for pricing tiers
- Better product organization

### 2. Data Model Structure

```prisma
model Product {
    id: String @id
    title: String
    category: Category (COINS | BUNDLES)
    items: items[] ({type: ProductType, quantity: Int}[])
    quantity: Int (total available quantity)
    amount: Float (base price)
    currency: String
    icon: String?
    description: String?
    image: String?
    status: ProductStatus (ACTIVE | INACTIVE | DISCONTINUED)
}

model Price {
    id: String @id
    product_id: String
    name: String (tier name)
    amount: Float (tier price)
    quantity: Int (quantity for this tier)
    price_id: String (external ID)
    createdAt: DateTime
    updatedAt: DateTime
}
```

## Service Layer Updates

### Core Services

#### Product Management
- `addProduct(userId, productData)` - Create new product (admin)
- `getAllProducts(category?, page, limit)` - Get all products with optional category filter
- `getAllProductByCategory(category, page, limit)` - Get products by specific category
- `getProductDetails(productId)` - Get single product details
- `updateProduct(productId, data)` - Update product (admin)
- `deleteProduct(productId)` - Soft delete product (admin)
- `restoreProduct(productId)` - Restore deleted product (admin)

#### Search & Discovery
- `searchProducts(query?, category?, page, limit)` - Search by title/description and category

#### Availability
- `isProductAvailable(productId)` - Check if product can be purchased
- `reduceProductQuantity(productId, quantity)` - Decrease quantity after purchase
- `increaseProductQuantity(productId, quantity)` - Increase for refunds/restocking

#### Pricing Management
- `getProductPrices(productId)` - Get all price tiers for a product
- `addProductPrice(productId, priceData)` - Add price tier (admin)
- `deleteProductPrice(priceId)` - Delete price tier (admin)

#### Purchase
- `purchaseProduct(userId, productId, quantity)` - Purchase product and add items to user store

## API Endpoints

### Public Endpoints (Authenticated)

#### Get All Products
```
GET /api/store
Query: ?category=COINS&page=1&limit=10
Response: { success, data: Product[], meta: { page, limit, total, totalPages } }
```

#### Get Products by Category
```
GET /api/store/category/:category
Params: category = COINS | BUNDLES
Query: ?page=1&limit=10
Response: { success, data: Product[], meta: {...} }
```

#### Get Product Details
```
GET /api/store/:productId
Response: { success, data: Product }
```

#### Get Product Prices
```
GET /api/store/:productId/prices
Response: { success, data: Price[] }
```

#### Search Products
```
GET /api/store/search
Query: ?query=search_term&category=COINS&page=1&limit=10
Response: { success, data: Product[], meta: {...} }
```

#### Purchase Product
```
POST /api/store/:productId/purchase
Body: { quantity?: number }
Response: { success, message, data: { productId, quantity } }
```

### Admin Endpoints

#### Create Product
```
POST /api/store
Auth: Admin only
Body: {
    "title": "string",
    "category": "COINS" | "BUNDLES",
    "items": [
        { "type": "COIN" | "KEY" | "BOOST" | "SWAP", "quantity": 10 },
        { "type": "KEY", "quantity": 5 }
    ],
    "quantity": 100,
    "amount": 9.99,
    "currency": "USD",
    "description": "string (optional)",
    "image": "url (optional)",
    "icon": "url (optional)"
}
Response: { success, data: Product }
```

#### Update Product
```
PATCH /api/store/:productId
Auth: Admin only
Body: {
    "title": "string (optional)",
    "amount": 9.99,
    "quantity": 100,
    "items": [...],
    "description": "string (optional)",
    "image": "url (optional)",
    "icon": "url (optional)",
    "status": "ACTIVE" | "INACTIVE" | "DISCONTINUED"
}
Response: { success, data: Product }
```

#### Delete Product (Soft Delete)
```
DELETE /api/store/:productId
Auth: Admin only
Response: { success, message, data: Product }
```

#### Restore Product
```
POST /api/store/:productId/restore
Auth: Admin only
Response: { success, message, data: Product }
```

#### Add Product Price Tier
```
POST /api/store/:productId/prices
Auth: Admin only
Body: {
    "name": "Standard",
    "amount": 9.99,
    "quantity": 100,
    "price_id": "stripe_price_id"
}
Response: { success, message, data: Price }
```

#### Delete Price Tier
```
DELETE /api/store/prices/:priceId
Auth: Admin only
Response: { success, message, data: Price }
```

## Validation Schemas

### Create Product Validation
- `title`: Required, 3-100 characters
- `category`: Required, must be COINS or BUNDLES
- `items`: Required array with at least 1 item
  - Each item: `type` (COIN|KEY|BOOST|SWAP), `quantity` (positive integer)
- `quantity`: Required, non-negative integer
- `amount`: Required, non-negative number
- `currency`: Required, max 10 characters
- `description`: Optional string
- `image`: Optional valid URL
- `icon`: Optional valid URL

### Update Product Validation
- All fields optional
- Same validation rules as create
- `status` can be ACTIVE, INACTIVE, or DISCONTINUED

### Create Price Validation
- `name`: Required, 1-50 characters
- `amount`: Required, non-negative number
- `quantity`: Required, positive integer
- `price_id`: Required string

### Pagination Validation
- `page`: Optional, must be > 0
- `limit`: Optional, must be 1-100
- `category`: Optional, COINS or BUNDLES

## Purchase Flow

1. User calls `POST /api/store/:productId/purchase`
2. Service validates:
   - Product exists and is ACTIVE
   - Sufficient quantity available
3. Service performs:
   - Reduces product quantity
   - Adds items to user store based on product items array
   - Returns success response
4. For each item in product:
   - Adds `item.quantity * purchaseQuantity` to user store

## Error Handling

### Status Codes
- `201 Created` - Product/Price created successfully
- `200 OK` - Successful retrieval/update
- `400 Bad Request` - Validation error or invalid request
- `401 Unauthorized` - User not authenticated
- `403 Forbidden` - User lacks admin privileges
- `404 Not Found` - Product/Price not found
- `409 Conflict` - Insufficient inventory

### Common Errors
- "User not found or User unauthorized" - User is not admin
- "Product not found" - Product ID doesn't exist
- "Insufficient product quantity available" - Not enough in stock
- "Invalid category. Must be COINS or BUNDLES" - Invalid category enum
- "Each item must have a valid type and positive quantity" - Invalid item structure

## Migration Notes

If migrating from the old system:
1. Products previously with `productType` need to be migrated to use `category`
2. Products need to be assigned to either COINS or BUNDLES category
3. Existing product items need to be structured as `items` array
4. Any product types need to be converted to the items structure

## Database Indexes

Consider adding these indexes for performance:
```prisma
@@index([id, category, status])  // For filtering by category
@@index([category, status])      // For category listing
@@index([title])                 // For search
```

## Future Enhancements

1. Add inventory management endpoints
2. Add bulk product operations
3. Add product ratings/reviews
4. Add featured/promoted products
5. Add product bundles (combine multiple products)
6. Add discount codes integration
7. Add analytics for product sales
