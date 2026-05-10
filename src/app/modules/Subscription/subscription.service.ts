import prisma from "../../../shared/prisma"
import ApiError from "../../../errors/ApiError"
import httpStatus from 'http-status'
import { paginationHelper } from "../../../helpers/paginationHelper"
import { SubscriptionStatus, SubscriptionPlanEnum } from "../../../prismaClient"

/**
 * Get all available subscription plans
 */
const getAvailablePlans = async (page: number = 1, limit: number = 10) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });
    
    const plans = await prisma.subscriptionPlan.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { amount: 'asc' },
        skip,
        take: paginationLimit
    })

    const total = await prisma.subscriptionPlan.count({where: { status: 'ACTIVE' }});
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: plans, meta: paginationMetaData };
}

/**
 * Get a specific subscription plan by ID
 */
const getPlan = async (planId: string) => {
    const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId }
    })

    if (!plan) {
        throw new ApiError(httpStatus.NOT_FOUND, "Subscription plan not found")
    }

    return plan
}

/**
 * Get plan by enum name
 */
const getPlanByName = async (planName: SubscriptionPlanEnum) => {
    const plan = await prisma.subscriptionPlan.findFirst({
        where: { planName }
    })

    if (!plan) {
        throw new ApiError(httpStatus.NOT_FOUND, `Subscription plan ${planName} not found`)
    }

    return plan
}

/**
 * Create a new subscription record
 */
const createSubscription = async (
    userId: string,
    planId: string,
    startDate: Date,
    endDate: Date,
    stripeSessionId: string
) => {
    const plan = await getPlan(planId)

    const subscription = await prisma.subscription.create({
        data: {
            plan: plan.planName,
            plan_id: planId,
            userId,
            startDate,
            endDate,
            stripe_session_id: stripeSessionId,
            status: SubscriptionStatus.PENDING
        },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } }
    })

    return subscription
}

/**
 * Get user's active subscription
 */
const getUserActiveSubscription = async (userId: string) => {
    const now = new Date()

    const subscription = await prisma.subscription.findFirst({
        where: {
            userId,
            status: 'VALID',
            endDate: { gte: now }
        },
        include: { user: true }
    })

    return subscription || null
}

/**
 * Get all user subscriptions
 */
const getUserSubscriptions = async (userId: string, page: number = 1, limit: number = 10) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });
    
    const subscriptions = await prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: paginationLimit,
        include: { user: { select: { id: true, email: true } } }
    })

    const total = await prisma.subscription.count({where: { userId }});
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: subscriptions, meta: paginationMetaData };
}

/**
 * Update subscription status to VALID (after payment success)
 */
const activateSubscription = async (subscriptionId: string) => {
    const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId }
    })

    if (!subscription) {
        throw new ApiError(httpStatus.NOT_FOUND, "Subscription not found")
    }

    const updatedSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.VALID },
        include: { user: { select: { id: true, email: true } } }
    })

    return updatedSubscription
}

/**
 * Cancel a subscription
 */
const cancelSubscription = async (subscriptionId: string, reason?: string) => {
    const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId }
    })

    if (!subscription) {
        throw new ApiError(httpStatus.NOT_FOUND, "Subscription not found")
    }

    const updatedSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
            status: SubscriptionStatus.EXPIRED,
            endDate: new Date()
        }
    })

    return updatedSubscription
}

/**
 * Check if subscription is valid (not expired)
 */
const isSubscriptionValid = async (userId: string): Promise<boolean> => {
    const now = new Date()

    const subscription = await prisma.subscription.findFirst({
        where: {
            userId,
            status: 'VALID',
            endDate: { gte: now }
        }
    })

    return !!subscription
}

/**
 * Get subscription status for user
 */
const getUserSubscriptionStatus = async (userId: string) => {
    const now = new Date()

    const subscription = await prisma.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    })

    if (!subscription) {
        return { hasSubscription: false, status: null, planName: null }
    }

    const isValid = subscription.status === 'VALID' && subscription.endDate && subscription.endDate >= now

    return {
        hasSubscription: true,
        status: subscription.status,
        planName: subscription.plan,
        isValid,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        daysRemaining: subscription.endDate ? Math.ceil((subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0
    }
}

/**
 * Renew an expiring subscription
 */
const renewSubscription = async (subscriptionId: string, planId: string) => {
    const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId }
    })

    if (!subscription) {
        throw new ApiError(httpStatus.NOT_FOUND, "Subscription not found")
    }

    const plan = await getPlan(planId)
    const now = new Date()
    const endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year from now

    const renewedSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
            plan: plan.planName,
            plan_id: planId,
            startDate: now,
            endDate,
            status: SubscriptionStatus.VALID
        }
    })

    return renewedSubscription
}

/**
 * Get subscription by Stripe session ID
 */
const getSubscriptionByStripeSessionId = async (sessionId: string) => {
    const subscription = await prisma.subscription.findFirst({
        where: { stripe_session_id: sessionId }
    })

    return subscription || null
}

/**
 * Update subscription with Stripe data
 */
const updateSubscriptionStripeData = async (
    subscriptionId: string,
    stripeSubscriptionId: string
) => {
    const subscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { subscription_id: stripeSubscriptionId }
    })

    return subscription
}

export const subscriptionService = {
    getAvailablePlans,
    getPlan,
    getPlanByName,
    createSubscription,
    getUserActiveSubscription,
    getUserSubscriptions,
    activateSubscription,
    cancelSubscription,
    isSubscriptionValid,
    getUserSubscriptionStatus,
    renewSubscription,
    getSubscriptionByStripeSessionId,
    updateSubscriptionStripeData
}