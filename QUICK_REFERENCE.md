# Dashboard API - Quick Reference

## Base URL
```
http://localhost:5000
```

## Authentication
All endpoints require:
```
Header: Authorization: Bearer {admin_token}
```

---

## 📚 All Endpoints Quick View

| # | Method | Endpoint | Purpose |
|----|--------|----------|---------|
| 1 | GET | `/dashboard/payments` | Payment history (paginated) |
| 2 | GET | `/dashboard/user-stats` | User statistics |
| 3 | GET | `/dashboard/all-users` | All users list (paginated) |
| 4 | GET | `/dashboard/overview` | Dashboard overview |
| 5 | GET | `/dashboard/income/:year` | Yearly income breakdown |
| 6 | GET | `/dashboard/income/pro-premium/:year` | Subscription income by year |
| 7 | GET | `/dashboard/member-ratio/:year` | Monthly member ratio |
| 8 | GET | `/dashboard/notifications` | Admin notifications |
| 9 | GET | `/dashboard/contest/stats` | Contest statistics |
| 10 | PATCH | `/dashboard/toggole-block` | Toggle user block status |
| 11 | GET | `/dashboard/store/stats` | Store statistics |
| 12 | GET | `/dashboard/plans` | All subscription plans |
| 13 | GET | `/dashboard/plans/stats` | Plans with statistics |
| 14 | GET | `/dashboard/transactions` | Transactions (paginated) |
| 15 | GET | `/dashboard/transactions/stats` | Transaction statistics |

---

## 🔗 Endpoint Groups

### 💳 Payments & Transactions (3 endpoints)
```bash
GET  /dashboard/payments?page=1&limit=10
GET  /dashboard/transactions?page=1&limit=10
GET  /dashboard/transactions/stats
```

### 👥 User Management (3 endpoints)
```bash
GET   /dashboard/all-users?page=1&limit=10
GET   /dashboard/user-stats
PATCH /dashboard/toggole-block
      Body: {"userId": "user_id"}
```

### 💰 Income & Revenue (2 endpoints)
```bash
GET /dashboard/income/2024
GET /dashboard/income/pro-premium/2024
```

### 🎯 Contest & Members (2 endpoints)
```bash
GET /dashboard/contest/stats
GET /dashboard/member-ratio/2024
```

### 📊 Overview (2 endpoints)
```bash
GET /dashboard/overview
GET /dashboard/notifications
```

### 🏪 Store (1 endpoint)
```bash
GET /dashboard/store/stats
```

### 📋 Plans (2 endpoints)
```bash
GET /dashboard/plans
GET /dashboard/plans/stats
```

---

## 📤 Response Format

All endpoints return this format:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Description of what was fetched",
  "data": {}
}
```

---

## ⚙️ Query Parameters

### Pagination
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 10) - Items per page

**Used in:**
- `/dashboard/payments?page=1&limit=10`
- `/dashboard/all-users?page=1&limit=10`
- `/dashboard/transactions?page=1&limit=10`

### Path Parameters
- `:year` - Year in YYYY format (e.g., 2024)

**Used in:**
- `/dashboard/income/:year`
- `/dashboard/income/pro-premium/:year`
- `/dashboard/member-ratio/:year`

---

## 🧪 Testing Commands

### cURL Examples

**1. Get User Stats**
```bash
curl -X GET "http://localhost:5000/dashboard/user-stats" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**2. Get Payment History**
```bash
curl -X GET "http://localhost:5000/dashboard/payments?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**3. Toggle Block Status**
```bash
curl -X PATCH "http://localhost:5000/dashboard/toggole-block" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"USER_ID"}'
```

**4. Get Income by Year**
```bash
curl -X GET "http://localhost:5000/dashboard/income/2024" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔑 Common Response Data

### User Stats Response
```json
{
  "totalUsers": 150,
  "active_user_count": 120,
  "inactive_user_count": 30,
  "paid_members_count": 45
}
```

### Transaction Stats Response
```json
{
  "totalTransactions": 500,
  "successfulTransactions": 480,
  "failedTransactions": 15,
  "pendingTransactions": 5,
  "totalRevenue": 25000.50,
  "averageTransactionValue": 52.08
}
```

### Store Stats Response
```json
{
  "totalProducts": 20,
  "totalPrices": 45,
  "totalStoreValue": 5000.00,
  "userInventory": {
    "totalKeys": 1500,
    "totalBoosts": 800,
    "totalSwaps": 600
  }
}
```

---

## ✅ Error Responses

| Code | Status | Meaning |
|------|--------|---------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | User not admin |
| 404 | Not Found | Resource not found |
| 500 | Server Error | Internal error |

---

## 📂 Documentation Files

- `IMPLEMENTATION_SUMMARY.md` - Complete implementation details
- `DASHBOARD_ENDPOINTS_DOCUMENTATION.md` - Full endpoint documentation
- `TESTING_GUIDE.md` - Comprehensive testing guide
- `DASHBOARD_API_TEST_COLLECTION.json` - Postman/Thunder Client collection

---

## 💡 Tips

1. **Test Order**: Start with `/dashboard/user-stats` (simplest)
2. **Auth Token**: Get from login endpoint, check expiry
3. **Dates**: Use YYYY format for year parameters (e.g., 2024)
4. **Pagination**: Higher limits may impact performance
5. **Empty Data**: Check if database has records in relevant collections

---

## 🚀 Getting Started

1. **Start server:** `npm run dev`
2. **Get admin token:** Login with admin credentials
3. **Import collection:** Use `DASHBOARD_API_TEST_COLLECTION.json` in Thunder Client/Postman
4. **Set variable:** `admin_token` = your JWT token
5. **Run tests:** Execute endpoints one by one

---

## 📞 Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Token expired or invalid |
| 403 Forbidden | User doesn't have ADMIN role |
| Empty array response | No data in database |
| 500 Error | Check server logs |
| Wrong calculations | Verify database data |

---

**Ready to test? 🚀 Pick any endpoint and try it!**
