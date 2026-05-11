import { Request, Response, NextFunction } from "express";
import prisma from "../../shared/prisma";
import ApiError from "../../errors/ApiError";
import httpstatus from "http-status";
import { SubscriptionStatus } from "../../prismaClient";

/**
 * Subscription verification middleware
 * Checks if user has an active subscription with the specified plan
 * Usage: router.post('/path', auth(), subscriptionMiddleware('PREMIUM'), controller)
 * @param requiredPlan - The subscription plan name required (e.g., 'PREMIUM', 'PRO', 'FREE')
 */
const subscriptionMiddleware = (requiredPlan: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        throw new ApiError(httpstatus.UNAUTHORIZED, "Unauthorized, token missing");
      }

      // Fetch user with subscriptions
      const userWithSubscriptions = await prisma.user.findUnique({
        where: { id: user.id },
        include: { subscriptions: true }
      });

      if (!userWithSubscriptions) {
        throw new ApiError(httpstatus.NOT_FOUND, "User not found");
      }

      // Check if user has an active subscription with the required plan
      const now = new Date();
      const hasActiveSubscription = userWithSubscriptions.subscriptions.some(sub => {
        return (
          sub.plan === requiredPlan &&
          sub.status === SubscriptionStatus.VALID &&
          sub.endDate &&
          sub.endDate > now
        );
      });

      if (!hasActiveSubscription) {
        throw new ApiError(
          httpstatus.FORBIDDEN,
          `This feature requires an active ${requiredPlan} subscription. Please upgrade your plan.`
        );
      }

      // Attach subscription info to request for later use
      req.userSubscription = {
        plan: requiredPlan,
        verified: true
      };

      next();
    } catch (error: any) {
      next(error);
    }
  };
};

/**
 * Check subscription without requiring a specific plan
 * Just verifies if user has ANY active subscription
 */
const checkSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    if (!user) {
      throw new ApiError(httpstatus.UNAUTHORIZED, "Unauthorized, token missing");
    }

    // Fetch user with subscriptions
    const userWithSubscriptions = await prisma.user.findUnique({
      where: { id: user.id },
      include: { subscriptions: true }
    });

    if (!userWithSubscriptions) {
      throw new ApiError(httpstatus.NOT_FOUND, "User not found");
    }

    // Check if user has any active subscription
    const now = new Date();
    const hasAnyActiveSubscription = userWithSubscriptions.subscriptions.some(sub => {
      return (
        sub.status === SubscriptionStatus.VALID &&
        sub.endDate &&
        sub.endDate > now
      );
    });

    if (!hasAnyActiveSubscription) {
      throw new ApiError(
        httpstatus.FORBIDDEN,
        "This feature requires an active subscription. Please subscribe to continue."
      );
    }

    next();
  } catch (error: any) {
    next(error);
  }
};

export { subscriptionMiddleware, checkSubscription };
export default subscriptionMiddleware;