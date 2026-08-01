# Dashboard API Endpoints Documentation

## Overview
This document lists all implemented dashboard endpoints for admin operations including payments, user management, statistics, and store management.

---

## Payment & Transaction Endpoints

### 1. Get Payment History
- **Method:** `GET`
- **URL:** `/dashboard/payments`
- **Query Parameters:**
  - `page` (optional): Page number for pagination (default: 1)
  - `limit` (optional): Items per page (default: 10)
- **Authentication:** Admin Required
- **Response:** Array of payments with user information

### 2. Get Transactions
- **Method:** `GET`
- **URL:** `/dashboard/transactions`
- **Query Parameters:**
  - `page` (optional): Page number for pagination (default: 1)
  - `limit` (optional): Items per page (default: 10)
- **Authentication:** Admin Required
- **Response:** 
  ```json
  {
    "payments": [],
    "total": 0,
    "page": 1,
    "limit": 10
  }
  ```

### 3. Get Transaction Statistics
- **Method:** `GET`
- **URL:** `/dashboard/transactions/stats`
- **Authentication:** Admin Required
- **Response:**
  ```json
  {
    "totalTransactions": 0,
    "successfulTransactions": 0,
    "failedTransactions": 0,
    "pendingTransactions": 0,
    "totalRevenue": 0,
    "averageTransactionValue": 0
  }
  ```

---

## User Management Endpoints

### 4. Get All Users (Deprecated)
- **Method:** `GET`
- **URL:** `/dashboard/all-users`
- **Query Parameters:**
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 10)
- **Authentication:** Admin Required
- **Response:** Array of users with vote counts

### 5. Get User Statistics
- **Method:** `GET`
- **URL:** `/dashboard/user-stats`
- **Authentication:** Admin Required
- **Response:**
  ```json
  {
    "totalUsers": 0,
    "active_user_count": 0,
    "inactive_user_count": 0,
    "paid_members_count": 0
  }
  ```

### 6. Toggle User Block Status
- **Method:** `PATCH`
- **URL:** `/dashboard/toggole-block`
- **Authentication:** Admin Required
- **Body:**
  ```json
  {
    "userId": "user_id_string"
  }
  ```
- **Response:**
  ```json
  {
    "id": "user_id",
    "fullName": "User Name",
    "email": "user@example.com",
    "isActive": true/false
  }
  ```

---

## Income & Revenue Endpoints

### 7. Get Total Income by Year
- **Method:** `GET`
- **URL:** `/dashboard/income/:year`
- **Path Parameters:** `:year` - The year (e.g., 2024)
- **Authentication:** Admin Required
- **Response:**
  ```json
  {
    "totalIncome": 0,
    "totalProIncome": 0,
    "totalPremiumIncome": 0,
    "incomeByMonth": {}
  }
  ```

### 8. Get Subscription Income by Year (Pro/Premium)
- **Method:** `GET`
- **URL:** `/dashboard/income/pro-premium/:year`
- **Path Parameters:** `:year` - The year (e.g., 2024)
- **Authentication:** Admin Required
- **Response:**
  ```json
  {
    "proIncomeByMonth": {},
    "premiumIncomeByMonth": {}
  }
  ```

---

## Contest & Members Endpoints

### 9. Get Contest Statistics
- **Method:** `GET`
- **URL:** `/dashboard/contest/stats`
- **Authentication:** Admin Required
- **Response:**
  ```json
  {
    "running": 0,
    "upcoming": 0,
    "completed": 0
  }
  ```

### 10. Get Member Ratio by Year
- **Method:** `GET`
- **URL:** `/dashboard/member-ratio/:year`
- **Path Parameters:** `:year` - The year (e.g., 2024)
- **Authentication:** Admin Required
- **Response:** Monthly breakdown of premium and pro members
  ```json
  {
    "1": { "premium": 10, "pro": 5 },
    "2": { "premium": 12, "pro": 8 }
  }
  ```

---

## Dashboard Overview Endpoints

### 11. Get Dashboard Overview
- **Method:** `GET`
- **URL:** `/dashboard/overview`
- **Authentication:** Admin Required
- **Response:**
  ```json
  {
    "totalUsers": 0,
    "totalContests": {},
    "totalPayments": 0,
    "totalIncomeData": {},
    "active_user_count": 0,
    "inactive_user_count": 0,
    "paid_members_count": 0,
    "member_ratio": {}
  }
  ```

### 12. Get Admin Notifications
- **Method:** `GET`
- **URL:** `/dashboard/notifications`
- **Authentication:** Admin Required
- **Response:** Array of admin notifications

---

## Store Endpoints

### 13. Get Store Statistics
- **Method:** `GET`
- **URL:** `/dashboard/store/stats`
- **Authentication:** Admin Required
- **Response:**
  ```json
  {
    "totalProducts": 0,
    "totalPrices": 0,
    "totalStoreValue": 0,
    "userInventory": {
      "totalKeys": 0,
      "totalBoosts": 0,
      "totalSwaps": 0
    }
  }
  ```

---

## Subscription Plans Endpoints

### 14. Get All Plans
- **Method:** `GET`
- **URL:** `/dashboard/plans`
- **Authentication:** Admin Required
- **Response:** Array of subscription plans with pricing

### 15. Get Plans Statistics
- **Method:** `GET`
- **URL:** `/dashboard/plans/stats`
- **Authentication:** Admin Required
- **Response:** Array of plans with subscriber count and total revenue

---

## Testing with Thunder Client / Postman

### Setup
1. Set base URL: `http://localhost:5000` or `{{local_url}}`
2. Ensure you have valid admin authentication token
3. Add token to Authorization header: `Bearer {token}`

### Example Requests

#### Get Payment History
```
GET /dashboard/payments?page=1&limit=10
Headers: Authorization: Bearer {token}
```

#### Toggle Block Status
```
PATCH /dashboard/toggole-block
Headers: Authorization: Bearer {token}
Body: 
{
  "userId": "6876137c34dacb19d4ab4479"
}
```

#### Get Income by Year
```
GET /dashboard/income/2024
Headers: Authorization: Bearer {token}
```

---

## Implementation Details

### Files Modified
1. `src/app/modules/Dashboard/dashboard.service.ts` - Added 6 new service methods
2. `src/app/modules/Dashboard/dashboard.controller.ts` - Added 7 new controller methods
3. `src/app/modules/Dashboard/dashboard.route.ts` - Added all routes with proper organization

### Service Methods Added
- `toggleBlockStatus(userId)` - Toggle user active/inactive status
- `getStoreStats()` - Get store inventory and product statistics
- `getPlans()` - Get all subscription plans
- `getPlansStats()` - Get statistics for each plan
- `getTransactions(query)` - Get paginated transactions
- `getTransactionStats()` - Get transaction statistics

### Authentication
All endpoints require `Admin` role authentication via the `auth.middleware.ts`.

### Error Handling
All endpoints use `catchAsync` wrapper for error handling and return standardized API responses.

---

## Notes
- All pagination defaults to page 1 and limit 10
- Dates are stored in ISO format (UTC)
- All monetary values are in the currency specified in the database
- The `/dashboard/toggole-block` endpoint toggles blocking, so calling it twice returns to the original state
