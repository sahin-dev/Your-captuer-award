import { Router } from "express";
import { subscriptionController } from "./subscription.controller";
import auth from "../../middlewares/auth.middleware";

const router = Router()

/**
 * Get all available plans
 */
router.get("/plans", subscriptionController.getAvailablePlans)

/**
 * Get specific plan by ID
 */
router.get("/plan/:planId", subscriptionController.getPlan)

/**
 * Get user's active subscription
 */
router.get("/active", auth(), subscriptionController.getUserActiveSubscription)

/**
 * Check if user has valid subscription
 */
router.get("/valid", auth(), subscriptionController.isSubscriptionValid)

/**
 * Get user's subscription status (days remaining, plan name, etc)
 */
router.get("/status", auth(), subscriptionController.getUserSubscriptionStatus)

/**
 * Get all user's subscriptions
 */
router.get("/my-subscriptions", auth(), subscriptionController.getUserSubscriptions)

/**
 * Cancel subscription
 */
router.post("/:subscriptionId/cancel", auth(), subscriptionController.cancelSubscription)

/**
 * Renew subscription with new plan
 */
router.post("/:subscriptionId/renew", auth(), subscriptionController.renewSubscription)

export const subscriptionRoutes = router