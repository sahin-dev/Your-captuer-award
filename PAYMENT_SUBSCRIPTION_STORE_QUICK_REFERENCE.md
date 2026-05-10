# Payment, Subscription & Store - Quick API Reference Card

## Summary

| Module | Endpoints | Status |
|--------|-----------|--------|
| **Payment** | 6 | ✅ Complete |
| **Subscription** | 8 | ✅ Complete |
| **Store** | 8 | ✅ Complete |
| **Total** | **22** | **✅ All Implemented** |

---

## 🛒 Store Module (8 Endpoints)

```bash
# Create product (ADMIN)
POST /api/v1/store/
  ├─ Body: {productType, title, quantity, amount, description}
  └─ Returns: Created product

# List all products
GET /api/v1/store/?type=KEY&page=1&limit=10
  ├─ Query: type?, page?, limit?
  └─ Returns: Paginated products

# List products by type
GET /api/v1/store/type/KEY?page=1&limit=10
  └─ Returns: Products of specific type

# Search products
GET /api/v1/store/search?query=gold&type=KEY
  ├─ Query: query, type?, page?, limit?
  └─ Returns: Matching products

# Get product details
GET /api/v1/store/:productId
  └─ Returns: Single product

# Update product (ADMIN)
PATCH /api/v1/store/:productId
  ├─ Body: {title?, quantity?, amount?, description?}
  └─ Returns: Updated product

# Delete product (ADMIN)
DELETE /api/v1/store/:productId
  ├─ Note: Soft delete (DISCONTINUED)
  └─ Returns: Deleted product

# Restore product (ADMIN)
POST /api/v1/store/:productId/restore
  └─ Returns: Restored product
```

---

## 💳 Payment Module (6 Endpoints)

```bash
# Initiate payment
POST /api/v1/payments/
  ├─ Body: {productId?, planId?, mode, success_url, cancel_url}
  ├─ Mode: "payment" | "subscription"
  └─ Returns: Stripe session URL

# Get payment history
GET /api/v1/payments/history?page=1&limit=10
  ├─ Query: page?, limit?
  └─ Returns: User's payments

# Get payment details
GET /api/v1/payments/:paymentId
  └─ Returns: Single payment

# Cancel payment
POST /api/v1/payments/:paymentId/cancel
  └─ Returns: Cancelled payment

# Refund payment (ADMIN)
POST /api/v1/payments/:paymentId/refund
  ├─ Body: {amount}
  └─ Returns: Refund result

# Capture payment (ADMIN)
POST /api/v1/payments/:paymentId/capture
  └─ Returns: Captured payment
```

---

## 📅 Subscription Module (8 Endpoints)

```bash
# Get all plans
GET /api/v1/subscriptions/plans
  └─ Returns: All subscription plans

# Get specific plan
GET /api/v1/subscriptions/plan/:planId
  └─ Returns: Single plan

# Get user's active subscription
GET /api/v1/subscriptions/active
  └─ Returns: Current active subscription

# Get all user subscriptions
GET /api/v1/subscriptions/my-subscriptions
  └─ Returns: All subscriptions

# Get subscription status
GET /api/v1/subscriptions/status
  ├─ Returns: {daysRemaining, plan, status, endDate}
  └─ Note: User's current subscription info

# Check if subscription valid
GET /api/v1/subscriptions/valid
  ├─ Returns: {isValid: boolean}
  └─ Note: Quick validity check

# Cancel subscription
POST /api/v1/subscriptions/:subscriptionId/cancel
  ├─ Body: {reason?}
  └─ Returns: Cancelled subscription

# Renew subscription
POST /api/v1/subscriptions/:subscriptionId/renew
  ├─ Body: {planId}
  └─ Returns: Renewed subscription
```

---

## 🔐 Authorization Levels

| Level | Endpoints |
|-------|-----------|
| **Public** | GET /subscriptions/plans |
| **Authenticated** | All other endpoints |
| **Admin Only** | Refund, Capture, Delete, Update, Restore, Create |

---

## Postman Quick Setup

### Environment Variables
```
{{base_url}} = http://localhost:3000/api/v1
{{token}} = <JWT_AUTH_TOKEN>
```

### Store - Create Product
```
POST {{base_url}}/store/
Authorization: Bearer {{token}}

{
  "productType": "KEY",
  "title": "Golden Key",
  "quantity": 100,
  "amount": 9.99,
  "description": "Unlock premium features"
}
```

### Payment - List History
```
GET {{base_url}}/payments/history?page=1&limit=10
Authorization: Bearer {{token}}
```

### Subscription - Get Status
```
GET {{base_url}}/subscriptions/status
Authorization: Bearer {{token}}
```

---

## cURL Examples

### Create Store Product (Admin)
```bash
curl -X POST http://localhost:3000/api/v1/store/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productType": "KEY",
    "title": "Golden Key",
    "quantity": 100,
    "amount": 9.99,
    "description": "Unlock premium features"
  }'
```

### Initiate Payment
```bash
curl -X POST http://localhost:3000/api/v1/payments/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_123",
    "mode": "payment",
    "success_url": "https://example.com/success",
    "cancel_url": "https://example.com/cancel"
  }'
```

### Get Subscription Status
```bash
curl -X GET http://localhost:3000/api/v1/subscriptions/status \
  -H "Authorization: Bearer $TOKEN"
```

---

## Error Codes Reference

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | OK | Request successful |
| 201 | Created | Resource created |
| 400 | Bad Request | Check request body |
| 401 | Unauthorized | Add valid auth token |
| 403 | Forbidden | Admin access required |
| 404 | Not Found | Check IDs |
| 500 | Server Error | Try again |

---

## Common Use Cases

### Purchase Product Flow
```
1. GET /store/ → Browse products
2. GET /store/:productId → Get details
3. POST /payments/ → Start checkout
4. User pays on Stripe
5. GET /payments/history → Confirm purchase
```

### Subscribe to Plan
```
1. GET /subscriptions/plans → View plans
2. POST /payments/ → Subscribe
3. User pays on Stripe
4. GET /subscriptions/active → Confirm subscription
5. GET /subscriptions/status → Check days remaining
```

### Manage Subscription
```
1. GET /subscriptions/my-subscriptions → View subscriptions
2. GET /subscriptions/status → Check remaining days
3. POST /subscriptions/:id/renew → Extend subscription
   OR
4. POST /subscriptions/:id/cancel → Cancel subscription
```

### Admin Operations
```
1. POST /store/ → Create product
2. PATCH /store/:id → Update product
3. DELETE /store/:id → Delete product
4. POST /store/:id/restore → Restore product
5. POST /payments/:id/refund → Refund payment (ADMIN)
```

---

## Response Format - All Endpoints

### Success (200/201)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": { /* response object */ }
}
```

### Error (400/401/404/500)
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "data": null
}
```

---

## TypeScript Integration

```typescript
// Get payment history
const response = await fetch('/api/v1/payments/history', {
  headers: { 'Authorization': `Bearer ${token}` }
})
const { data } = await response.json()

// Create store product
const response = await fetch('/api/v1/store/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    productType: 'KEY',
    title: 'Premium Key',
    quantity: 100,
    amount: 9.99
  })
})

// Subscribe to plan
const response = await fetch('/api/v1/payments/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    planId: 'plan_123',
    mode: 'subscription',
    success_url: 'https://example.com/success',
    cancel_url: 'https://example.com/cancel'
  })
})
```

---

## Webhook Integration

**Stripe Webhook Endpoint**: `POST /webhook`

**Handled Events**:
- `checkout.session.completed` → Updates payment status, activates subscription
- `payment_intent.succeeded` → Processes successful payments
- `invoice.payment_succeeded` → Handles recurring payments

**Note**: No authorization header needed (Stripe signature verified)

---

## Status Summary

✅ All 22 endpoints implemented  
✅ All controllers created  
✅ All routes wired up  
✅ TypeScript compilation passing  
✅ Stripe webhook configured  
✅ Error handling in place  
✅ Authorization middleware applied  

---

**Last Updated**: May 9, 2026  
**Status**: ✅ PRODUCTION READY
