# Store API Quick Reference - cURL Examples

## Base URL
```
http://localhost:5000/api/store
```

## Authentication
All requests require Bearer token:
```
Authorization: Bearer {JWT_TOKEN}
```

---

## PUBLIC ENDPOINTS (Authenticated Users)

### 1. Get All Products
```bash
curl -X GET "http://localhost:5000/api/store?page=1&limit=10" \
  -H "Authorization: Bearer {TOKEN}"

# With category filter
curl -X GET "http://localhost:5000/api/store?category=COINS&page=1&limit=10" \
  -H "Authorization: Bearer {TOKEN}"
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Store products fetched successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "100 Coins Bundle",
      "category": "COINS",
      "items": [
        { "type": "COIN", "quantity": 100 }
      ],
      "quantity": 500,
      "amount": 9.99,
      "currency": "USD",
      "description": "Get 100 coins",
      "image": "https://...",
      "icon": "https://...",
      "status": "ACTIVE"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

---

### 2. Get Products by Category
```bash
curl -X GET "http://localhost:5000/api/store/category/COINS?page=1&limit=10" \
  -H "Authorization: Bearer {TOKEN}"

# Categories: COINS, BUNDLES
```

---

### 3. Get Product Details
```bash
curl -X GET "http://localhost:5000/api/store/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer {TOKEN}"
```

---

### 4. Search Products
```bash
curl -X GET "http://localhost:5000/api/store/search?query=coins&category=COINS&page=1&limit=10" \
  -H "Authorization: Bearer {TOKEN}"
```

---

### 5. Get Product Prices
```bash
curl -X GET "http://localhost:5000/api/store/507f1f77bcf86cd799439011/prices" \
  -H "Authorization: Bearer {TOKEN}"
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Product prices fetched successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439012",
      "product_id": "507f1f77bcf86cd799439011",
      "name": "Standard",
      "amount": 9.99,
      "quantity": 100,
      "price_id": "price_1234567890",
      "createdAt": "2026-06-06T10:30:00Z",
      "updatedAt": "2026-06-06T10:30:00Z"
    }
  ]
}
```

---

### 6. Purchase Product
```bash
curl -X POST "http://localhost:5000/api/store/507f1f77bcf86cd799439011/purchase" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 1
  }'
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Product purchased successfully",
  "data": {
    "success": true,
    "message": "Product purchased successfully",
    "productId": "507f1f77bcf86cd799439011",
    "quantity": 1
  }
}
```

---

## ADMIN ENDPOINTS

### 1. Create Product
```bash
curl -X POST "http://localhost:5000/api/store" \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "100 Coins Bundle",
    "category": "COINS",
    "items": [
      { "type": "COIN", "quantity": 100 }
    ],
    "quantity": 500,
    "amount": 9.99,
    "currency": "USD",
    "description": "Get 100 coins for gameplay",
    "image": "https://example.com/image.png",
    "icon": "https://example.com/icon.png"
  }'
```

**With Multiple Items:**
```bash
curl -X POST "http://localhost:5000/api/store" \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Premium Bundle",
    "category": "BUNDLES",
    "items": [
      { "type": "COIN", "quantity": 500 },
      { "type": "KEY", "quantity": 5 },
      { "type": "BOOST", "quantity": 3 },
      { "type": "SWAP", "quantity": 2 }
    ],
    "quantity": 100,
    "amount": 29.99,
    "currency": "USD",
    "description": "Complete premium package",
    "image": "https://example.com/premium.png"
  }'
```

---

### 2. Update Product
```bash
curl -X PATCH "http://localhost:5000/api/store/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Product Name",
    "amount": 11.99,
    "quantity": 600,
    "description": "Updated description",
    "status": "ACTIVE"
  }'
```

---

### 3. Delete Product (Soft Delete)
```bash
curl -X DELETE "http://localhost:5000/api/store/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer {ADMIN_TOKEN}"
```

---

### 4. Restore Product
```bash
curl -X POST "http://localhost:5000/api/store/507f1f77bcf86cd799439011/restore" \
  -H "Authorization: Bearer {ADMIN_TOKEN}"
```

---

### 5. Add Product Price Tier
```bash
curl -X POST "http://localhost:5000/api/store/507f1f77bcf86cd799439011/prices" \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Standard Tier",
    "amount": 9.99,
    "quantity": 100,
    "price_id": "price_1234567890"
  }'
```

---

### 6. Delete Price Tier
```bash
curl -X DELETE "http://localhost:5000/api/store/prices/507f1f77bcf86cd799439012" \
  -H "Authorization: Bearer {ADMIN_TOKEN}"
```

---

## Error Examples

### 400 - Bad Request
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Each item must have a valid type and positive quantity"
}
```

### 401 - Unauthorized
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Authentication required"
}
```

### 403 - Forbidden (Admin Required)
```json
{
  "success": false,
  "statusCode": 403,
  "message": "Admin access required"
}
```

### 404 - Not Found
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Product not found"
}
```

### 409 - Conflict
```json
{
  "success": false,
  "statusCode": 409,
  "message": "Insufficient product quantity available"
}
```

---

## ProductType Enum
Valid values for items:
- `COIN` - In-game currency
- `KEY` - Unlock feature
- `BOOST` - Temporary enhancement
- `SWAP` - Swap action

## Category Enum
- `COINS` - Currency products
- `BUNDLES` - Bundle products

## ProductStatus Enum
- `ACTIVE` - Available for purchase
- `INACTIVE` - Not available
- `DISCONTINUED` - Permanently removed

---

## Testing in Postman

1. Set base URL: `http://localhost:5000/api/store`
2. Add Bearer token in Authorization tab
3. Use examples above in request body
4. Common headers:
   ```
   Content-Type: application/json
   Authorization: Bearer {YOUR_TOKEN}
   ```
