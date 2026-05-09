# Payment Module - Quick Code Reference

## Payment Service Method Signatures

```typescript
export class PaymentService {
  // Initialization
  private async loadProviders(): Promise<void>

  // Payment Processing (Payment Initiation)
  async pay(
    userId: string,
    productId: string | null,
    planId: string | null,
    mode: 'subscription' | 'payment',
    success_url: string,
    cancel_url: string
  ): Promise<Session>

  async purchaseSubscription(
    userId: string,
    planId: string,
    success_url: string,
    cancel_url: string
  ): Promise<Session>

  async purchaseProduct(
    userId: string,
    productId: string,
    success_url: string,
    cancel_url: string
  ): Promise<Session>

  // Webhook Handlers (Called by Stripe webhook endpoints)
  async handlePaymentSuccess(sessionId: string): Promise<Payment>

  async handlePaymentFailure(
    sessionId: string,
    reason?: string
  ): Promise<Payment>

  // Transaction Management
  async capture(
    providerName: "STRIPE",
    paymentId: string
  ): Promise<CaptureResult>

  async refund(
    providerName: "STRIPE",
    paymentId: string,
    amount: number
  ): Promise<RefundResult>

  // Query Utilities
  async getUserPayments(
    userId: string,
    page?: number,
    limit?: number
  ): Promise<{ meta: PaginationMeta; data: Payment[] }>

  async getPaymentDetails(paymentId: string): Promise<Payment>

  async getPaymentBySessionId(sessionId: string): Promise<Payment | null>

  async cancelPayment(paymentId: string): Promise<Payment>
}

export const paymentService = new PaymentService();
```

## Subscription Service Method Signatures

```typescript
export class SubscriptionService {
  // Plan Management
  async getAvailablePlans(): Promise<SubscriptionPlan[]>
  async getPlan(planId: string): Promise<SubscriptionPlan>
  async getPlanByName(planName: SubscriptionPlanEnum): Promise<SubscriptionPlan>

  // Subscription Lifecycle
  async createSubscription(
    userId: string,
    planId: string,
    startDate: Date,
    endDate: Date,
    stripeSessionId: string
  ): Promise<Subscription>

  async activateSubscription(subscriptionId: string): Promise<Subscription>

  async cancelSubscription(subscriptionId: string): Promise<Subscription>

  async renewSubscription(
    subscriptionId: string,
    planId: string
  ): Promise<Subscription>

  // Subscription Status & Validation
  async getUserActiveSubscription(userId: string): Promise<Subscription>

  async isSubscriptionValid(userId: string): Promise<boolean>

  async getUserSubscriptionStatus(userId: string): Promise<SubscriptionStatus>

  async checkSubscriptionExpiry(userId: string): Promise<ExpiryInfo>

  // Stripe Integration
  async updateSubscriptionStripeData(
    subscriptionId: string,
    stripeSubscriptionId: string
  ): Promise<Subscription>

  async getSubscriptionByStripeSessionId(sessionId: string): Promise<Subscription>

  // Utilities
  async getUserActiveSubscriptionDetails(userId: string): Promise<SubscriptionDetails>

  async getAllUserSubscriptions(userId: string): Promise<Subscription[]>
}

export const subscriptionService = new SubscriptionService();
```

## Store Service Method Signatures

```typescript
export class StoreService {
  // Product Management
  async addProduct(productData: CreateProductInput): Promise<Product>

  async updateProduct(
    productId: string,
    data: UpdateProductInput
  ): Promise<Product>

  async deleteProduct(productId: string): Promise<Product>

  async restoreProduct(productId: string): Promise<Product>

  // Product Retrieval
  async getProductDetails(productId: string): Promise<Product>

  async getAllProductByType(
    type: ProductType,
    page?: number,
    limit?: number
  ): Promise<{ meta: PaginationMeta; data: Product[] }>

  async getAllProduct(
    type?: ProductType,
    page?: number,
    limit?: number
  ): Promise<{ meta: PaginationMeta; data: Product[] }>

  async searchProducts(
    query: string,
    type?: ProductType,
    page?: number,
    limit?: number
  ): Promise<{ meta: PaginationMeta; data: Product[] }>

  // Inventory Management
  async isProductAvailable(productId: string): Promise<boolean>

  async reduceProductQuantity(productId: string, quantity: number): Promise<Product>

  async increaseProductQuantity(productId: string, quantity: number): Promise<Product>
}

export const storeService = new StoreService();
```

---

## Database Models

### Payment Model
```prisma
model Payment {
  id String @id @map("_id") @db.ObjectId
  
  // Status tracking
  status PaymentStatus (PENDING|SUCCEEDED|VALID|EXPIRED|FAILED)
  type PaymentType (STORE|SUBSCRIPTION|CONTEST)
  
  // Amount & Currency
  amount Float
  currency String (default: "USD")
  
  // Payment method
  method String (e.g., "stripe")
  
  // Stripe tracking
  stripe_session_id String?
  stripe_payment_id String?
  
  // References to purchased items
  productId String? @db.ObjectId
  planId String? @db.ObjectId
  subscriptionId String? @db.ObjectId
  
  // User reference
  userId String @db.ObjectId
  user User @relation("UserPayments", fields: [userId], references: [id])
  
  // Metadata
  planName String?
  recurring PlanRecurringType?
  description String?
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Subscription Model
```prisma
model Subscription {
  id String @id @map("_id") @db.ObjectId
  
  // Plan reference
  plan SubscriptionPlanEnum (PREMIUM|PRO|FREE)
  plan_id String @db.ObjectId
  
  // User reference
  userId String @db.ObjectId
  user User @relation(fields: [userId], references: [id])
  
  // Status & dates
  status SubscriptionStatus (PENDING|VALID|EXPIRED)
  startDate DateTime?
  endDate DateTime?
  
  // Stripe tracking
  stripe_session_id String?
  subscription_id String? (Stripe subscription ID for recurring)
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model SubscriptionPlan {
  id String @id @map("_id") @db.ObjectId
  
  // Plan info
  planName SubscriptionPlanEnum (PREMIUM|PRO|FREE)
  features String[]
  
  // Stripe references
  stripe_price_id String?
  stripe_product_id String?
  
  // Pricing
  amount Float
  currency String (default: "USD")
  recurring PlanRecurringType (ONETIME|MONTHLY|YEARLY)
  
  // Status
  status SubscriptionPlanStatus (ACTIVE|INACTIVE)
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Product Model
```prisma
model Product {
  id String @id @map("_id") @db.ObjectId
  
  // Product info
  productType ProductType (KEY|BOOST|SWAP)
  title String
  
  // Inventory
  quantity Int
  
  // Pricing
  amount Float
  currency String (default: "USD")
  
  // Media & description
  icon String?
  image String?
  description String?
  
  // Status
  status ProductStatus (ACTIVE|INACTIVE|DISCONTINUED)
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Enums

```typescript
enum PaymentStatus {
  PENDING = "PENDING"         // Awaiting payment completion
  SUCCEEDED = "SUCCEEDED"     // Payment completed successfully
  VALID = "VALID"            // Subscription active
  EXPIRED = "EXPIRED"        // Subscription ended
  FAILED = "FAILED"          // Payment failed
}

enum PaymentType {
  STORE = "STORE"           // Product purchase
  SUBSCRIPTION = "SUBSCRIPTION"  // Subscription payment
  CONTEST = "CONTEST"       // Contest entry fee
}

enum SubscriptionStatus {
  PENDING = "PENDING"       // Awaiting activation
  VALID = "VALID"          // Active subscription
  EXPIRED = "EXPIRED"      // Subscription ended
}

enum SubscriptionPlanEnum {
  PREMIUM = "PREMIUM"       // Highest tier
  PRO = "PRO"              // Mid tier
  FREE = "FREE"            // Free tier
}

enum PlanRecurringType {
  ONETIME = "ONETIME"       // One-time payment
  MONTHLY = "MONTHLY"       // Recurring monthly
  YEARLY = "YEARLY"        // Recurring yearly
}

enum ProductType {
  KEY = "KEY"              // Unlock features
  BOOST = "BOOST"          // Performance boost
  SWAP = "SWAP"            // Replace item
}

enum ProductStatus {
  ACTIVE = "ACTIVE"         // Available for purchase
  INACTIVE = "INACTIVE"     // Temporarily unavailable
  DISCONTINUED = "DISCONTINUED"  // Soft deleted
}
```

---

## Integration Points

### Payment → Subscription
```typescript
// In handlePaymentSuccess()
if (payment.type === PaymentType.SUBSCRIPTION && payment.subscriptionId) {
  await subscriptionService.activateSubscription(payment.subscriptionId);
}
```

### Payment → Store
```typescript
// In handlePaymentSuccess()
if (payment.type === PaymentType.STORE && payment.productId) {
  await storeService.reduceProductQuantity(payment.productId, 1);
}

// In refund() for store items
if (payment.type === PaymentType.STORE && payment.productId && amount === payment.amount) {
  await storeService.increaseProductQuantity(payment.productId, 1);
}
```

### Subscription → Plan
```typescript
// In purchaseSubscription()
const plan = await subscriptionService.getPlan(planId);
// Use: plan.stripe_price_id, plan.amount, plan.recurring
```

### Store → Product Details
```typescript
// In purchaseProduct()
const product = await storeService.getProductDetails(productId);
const isAvailable = await storeService.isProductAvailable(productId);
```

---

## Error Handling Patterns

All services use `ApiError` with proper HTTP status codes:

```typescript
// Not found
throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");

// Bad request (validation)
throw new ApiError(httpStatus.BAD_REQUEST, "Plan ID is required for subscription");

// Conflict (business logic)
throw new ApiError(httpStatus.CONFLICT, "Product is not available for purchase");

// Unauthorized
throw new ApiError(httpStatus.UNAUTHORIZED, "User not authenticated");
```

---

## Example Request/Response Flows

### Product Purchase Flow
```
POST /api/payment/initiate
{
  "userId": "user123",
  "productId": "product456",
  "mode": "payment",
  "success_url": "https://app.com/success",
  "cancel_url": "https://app.com/cancel"
}

→ Stripe session created
← Return { sessionId, url, ...session }

User completes payment on Stripe
↓
POST /api/webhook/stripe
body: { type: "checkout.session.completed", session: { id: "sessionId" } }

→ handlePaymentSuccess(sessionId)
  ├─ Update Payment: status = SUCCEEDED
  ├─ Reduce inventory: product quantity -= 1
  └─ Log transaction
```

### Subscription Purchase Flow
```
POST /api/payment/initiate
{
  "userId": "user123",
  "planId": "plan789",
  "mode": "subscription",
  "success_url": "...",
  "cancel_url": "..."
}

→ purchaseSubscription()
  ├─ Create Subscription record (PENDING)
  ├─ Create Payment record (PENDING)
  ├─ Calculate dates (30 days for MONTHLY)
  └─ Return Stripe session

User completes payment on Stripe
↓
POST /api/webhook/stripe

→ handlePaymentSuccess(sessionId)
  ├─ Update Payment: status = SUCCEEDED
  └─ subscriptionService.activateSubscription()
     └─ Update Subscription: status = VALID
```

### Refund Flow
```
POST /api/payment/refund
{
  "paymentId": "payment123",
  "amount": 10.00
}

→ refund(provider, paymentId, amount)
  ├─ Verify amount ≤ original amount
  ├─ Process refund via Stripe
  ├─ Update Payment: amount -= refunded amount
  └─ If full refund AND STORE item:
     └─ Restore inventory
```

---

## Field Validation Rules

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `productId` | string | conditional | Required if mode='payment' |
| `planId` | string | conditional | Required if mode='subscription' |
| `amount` | float | yes | Must be > 0 |
| `currency` | string | no | Default: "USD" |
| `stripe_session_id` | string | auto | Set by provider |
| `stripe_payment_id` | string | auto | Set on capture |
| `startDate` | DateTime | yes | Subscription start |
| `endDate` | DateTime | yes | Subscription end |
| `title` | string | yes | Product name |
| `productType` | enum | yes | KEY, BOOST, SWAP |
| `quantity` | int | yes | Must be ≥ 0 |

---

## Stripe Event Handlers (TODO)

Webhook endpoints to implement:

```
POST /api/webhooks/stripe
  └─ Handle events:
     ├─ checkout.session.completed → handlePaymentSuccess()
     ├─ charge.refunded → handleRefund()
     └─ invoice.payment_failed → handlePaymentFailure()
```

---

Created: May 9, 2026
For: Payment Module Implementation Phase
Status: Ready for controller/route/webhook implementation
