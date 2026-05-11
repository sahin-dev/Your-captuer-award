# Subscription Middleware Usage Guide

## Overview
The subscription middleware verifies if a user has an active subscription with a specific plan before allowing access to protected routes.

## Middleware Functions

### 1. `subscriptionMiddleware(requiredPlan: string)`
Checks if user has an active subscription with a **specific plan**.

**Parameters:**
- `requiredPlan` (string): The subscription plan name (e.g., 'PREMIUM', 'PRO', 'FREE')

**Returns:**
- Middleware function that validates subscription

**Example:**
```typescript
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';

router.post(
  '/premium-feature',
  auth(),
  subscriptionMiddleware('PREMIUM'),
  controller.premiumFeature
);
```

### 2. `checkSubscription`
Checks if user has **ANY** active subscription (no specific plan required).

**Example:**
```typescript
import { checkSubscription } from '../middlewares/subscription.middleware';

router.get(
  '/my-features',
  auth(),
  checkSubscription,
  controller.getFeatures
);
```

## Route Integration Examples

### Team Module Example
```typescript
import { subscriptionMiddleware } from '../../middlewares/subscription.middleware';
import auth from '../../middlewares/auth.middleware';

// Only PREMIUM subscribers can create teams
router.post(
  '/',
  auth(),
  subscriptionMiddleware('PREMIUM'),
  fileUploader.uploadBadge,
  validateRequest(createTeamValidationSchema),
  teamController.createTeam
);

// Only PRO subscribers can access advanced features
router.get(
  '/:teamId/advanced-analytics',
  auth(),
  subscriptionMiddleware('PRO'),
  teamController.getAdvancedAnalytics
);

// Any subscribed user can view teams
router.get(
  '/',
  auth(),
  checkSubscription,
  teamController.getTeams
);
```

### Contest Module Example
```typescript
// Only FREE+ subscribers can create contests
router.post(
  '/create',
  auth(),
  subscriptionMiddleware('FREE'),
  contestController.createContest
);

// Only PREMIUM subscribers can access premium contests
router.get(
  '/premium',
  auth(),
  subscriptionMiddleware('PREMIUM'),
  contestController.getPremiumContests
);
```

## Request Object Extension
After passing the subscription middleware, the request object includes:
```typescript
req.userSubscription = {
  plan: string;      // The verified subscription plan name
  verified: boolean; // Always true if middleware passes
};
```

**Usage in Controller:**
```typescript
const controller = async (req: Request, res: Response) => {
  const plan = req.userSubscription?.plan; // e.g., 'PREMIUM'
  // Use subscription info as needed
  console.log(`User has ${plan} subscription`);
};
```

## Subscription Status Validation
The middleware checks:
1. ✅ User exists in database
2. ✅ User has a subscription record
3. ✅ Subscription plan matches required plan
4. ✅ Subscription status is `VALID` (not PENDING or EXPIRED)
5. ✅ Subscription end date is in the future

## Error Handling

### Error Messages
- **No subscription**: `"This feature requires an active PREMIUM subscription. Please upgrade your plan."`
- **Wrong plan**: `"This feature requires an active PRO subscription. Please upgrade your plan."`
- **No active subscription (checkSubscription)**: `"This feature requires an active subscription. Please subscribe to continue."`

### Error Response
```json
{
  "success": false,
  "statusCode": 403,
  "message": "This feature requires an active PREMIUM subscription. Please upgrade your plan.",
  "data": {}
}
```

## Available Subscription Plans
Based on `SubscriptionPlanEnum`:
- `FREE`
- `PRO`
- `PREMIUM`

## Middleware Order
Always place subscription middleware **AFTER** auth middleware:
```typescript
// ✅ CORRECT
router.post('/path', auth(), subscriptionMiddleware('PREMIUM'), controller);

// ❌ WRONG
router.post('/path', subscriptionMiddleware('PREMIUM'), auth(), controller);
```

## Multiple Subscriptions
If a user has multiple subscriptions, the middleware checks if at least ONE of them matches the required plan and is active.

## Database Fields Checked
- `subscriptions.plan` - Must match required plan
- `subscriptions.status` - Must be 'VALID'
- `subscriptions.endDate` - Must be greater than current date/time
