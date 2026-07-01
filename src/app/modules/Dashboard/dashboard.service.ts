import { get } from "http"
import { ContestStatus, PaymentStatus, PaymentType, PlanRecurringType, SubscriptionPlanEnum, SubscriptionPlanStatus } from "../../../prismaClient"
import prisma from "../../../shared/prisma"
import { paginationHelper } from "../../../helpers/paginationHelper"
import { notificationService } from "../Notification/notification.service"
import { voteService } from "../Vote/vote.service"
import { contestService } from "../Contest/contest.service"
import ApiError from "../../../errors/ApiError"
import httpStatus from "http-status"



const getContestStats = async () => {
    const runningContestCount = await prisma.contest.count({ where: { status: ContestStatus.ACTIVE } })
    const upcomignContestCount = await prisma.contest.count({ where: { status: ContestStatus.UPCOMING } })
    const completedContestCount = await prisma.contest.count({ where: { status: ContestStatus.CLOSED } })

    return { running: runningContestCount, upcoming: upcomignContestCount, completed: completedContestCount }
}

const calcMemberRatio = async (year: string) => {

    const users = await prisma.user.findMany({
        where: {
            purchased_plan: { in: [SubscriptionPlanEnum.PREMIUM, SubscriptionPlanEnum.PRO] },
            createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${Number(year) + 1}-01-01`)
            }
        },
        select: { purchased_plan: true, createdAt: true }
    })


    const result: Record<number, { premium: number; pro: number }> = []
    for (let m = 0; m < 12; m++) {
        result[m] = { premium: 0, pro: 0 }
    }

    users.forEach(user => {
        const month = user.createdAt.getMonth() + 1
        if (user.purchased_plan === SubscriptionPlanEnum.PREMIUM) {
            result[month].premium++
        } else if (user.purchased_plan === SubscriptionPlanEnum.PRO) {
            result[month].pro++
        }
    })

    return result
}

const calcIncomeDataByYear = async (year: string) => {
    const allPayments = await prisma.payment.findMany({
        where: {
            status: PaymentStatus.SUCCEEDED,
            createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${Number(year) + 1}-01-01`)
            }
        }
    })

    const totalIncome = allPayments.reduce((acc, payment) => acc + payment.amount, 0);
    const totalProIncome = allPayments
        .filter(payment => payment.method === 'SUBSCRIPTION' && payment.planName === SubscriptionPlanEnum.PRO)
        .reduce((acc, payment) => acc + payment.amount, 0);
    const totalPremiumIncome = allPayments
        .filter(payment => payment.method === 'SUBSCRIPTION' && payment.planName === SubscriptionPlanEnum.PREMIUM)
        .reduce((acc, payment) => acc + payment.amount, 0);
    let incomeByMonth: Record<string, number> = {};
    allPayments.forEach(payment => {
        const month = new Date(payment.createdAt).getMonth() + 1;
        if (incomeByMonth[month]) {
            incomeByMonth[month] += payment.amount;
        }
        else {
            incomeByMonth[month] = payment.amount;
        }
    });
    return { totalIncome, totalProIncome, totalPremiumIncome, incomeByMonth }
}


const getProPreminumIncomeByYear = async (year: string) => {
    const allPayments = await prisma.payment.findMany({
        where: {
            status: PaymentStatus.SUCCEEDED,
            method: 'SUBSCRIPTION',
            createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${Number(year) + 1}-01-01`)
            }
        }
    })

    let proIncomeByMonth: Record<string, number> = {};
    let premiumIncomeByMonth: Record<string, number> = {};
    allPayments.forEach(payment => {
        const month = new Date(payment.createdAt).getMonth() + 1;
        if (payment.planName === SubscriptionPlanEnum.PRO) {
            if (proIncomeByMonth[month]) {
                proIncomeByMonth[month] += payment.amount;
            } else {
                proIncomeByMonth[month] = payment.amount;
            }
        } else if (payment.planName === SubscriptionPlanEnum.PREMIUM) {
            if (premiumIncomeByMonth[month]) {
                premiumIncomeByMonth[month] += payment.amount;
            } else {
                premiumIncomeByMonth[month] = payment.amount;
            }
        }
    });

    return { proIncomeByMonth, premiumIncomeByMonth }
}


const calcIncomeData = async () => {
    const allPayments = await prisma.payment.findMany({ where: { status: PaymentStatus.SUCCEEDED } })

    const totalIncome = allPayments.reduce((acc, payment) => acc + payment.amount, 0);
    const totalProIncome = allPayments
        .filter(payment => payment.method === 'SUBSCRIPTION' && payment.planName === SubscriptionPlanEnum.PRO)
        .reduce((acc, payment) => acc + payment.amount, 0);

    const totalPremiumIncome = allPayments
        .filter(payment => payment.method === 'SUBSCRIPTION' && payment.planName === SubscriptionPlanEnum.PREMIUM)
        .reduce((acc, payment) => acc + payment.amount, 0);

    let incomeByMonth: Record<string, number> = {};
    allPayments.forEach(payment => {
        const month = new Date(payment.createdAt).getMonth() + 1;
        if (incomeByMonth[month]) {
            incomeByMonth[month] += payment.amount;
        } else {
            incomeByMonth[month] = payment.amount;
        }
    });

    return { totalIncome, incomeByMonth }

}

const getAllPaymentsHistory = async (query: { page?: string, limit?: string, search?: string, status?: string, method?: string, planName?: string }) => {

    const paginationData = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 10,
    }

    const whereCondition: any = {}

    if (query.status && Object.values(PaymentStatus).includes(query.status as PaymentStatus)) {
        whereCondition.status = query.status as PaymentStatus
    }

    if (query.method) {
        whereCondition.method = query.method
    }

    if (query.planName && Object.values(SubscriptionPlanEnum).includes(query.planName as SubscriptionPlanEnum)) {
        whereCondition.planName = query.planName as SubscriptionPlanEnum
    }

    if (query.search) {
        whereCondition.OR = [
            { stripe_payment_id: { contains: query.search, mode: 'insensitive' } },
            { stripe_session_id: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
            { amount: { equals: Number(query.search) } },
            { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ]
    }

    const payments = await prisma.payment.findMany({
        where: whereCondition,
        include: {
            user: {
                select: { id: true, avatar: true, fullName: true, email: true }
            }
        },
        orderBy: { createdAt: 'desc' },
        skip: (paginationData.page - 1) * paginationData.limit,
        take: paginationData.limit
    })

    const total = await prisma.payment.count({ where: whereCondition })
    const totalPages = Math.ceil(total / paginationData.limit)

    return {
        meta: {
            page: paginationData.page,
            limit: paginationData.limit,
            total,
            totalPages
        },
        data: payments
    }
}

const activeUsers = async () => {
    const users = await prisma.user.count({ where: { isActive: true } })
    return users
}

const inactiveUsers = async () => {
    const users = await prisma.user.count({ where: { isActive: false } })
    return users
}

const blockedUsersCount = async () => {
    const users = await prisma.user.count({ where: { isBlocked: true } })
    return users
}
const getpaidMembers = async () => {
    const users = await prisma.user.count({ where: { purchased_plan: { in: [SubscriptionPlanEnum.PREMIUM, SubscriptionPlanEnum.PRO] } } })
    return users
}

const getProMemberCount = async () => {
    return await prisma.user.count({ where: { purchased_plan: SubscriptionPlanEnum.PRO } })
}

const getPremiumMemberCount = async () => {
    return await prisma.user.count({ where: { purchased_plan: SubscriptionPlanEnum.PREMIUM } })
}

const getRevenueByType = async (year: string) => {
    const currentYear = new Date().getFullYear().toString()
    const startDate = new Date(`${year}-01-01`)
    const endDate = new Date(`${Number(year) + 1}-01-01`)

    const revenueByMonth: Record<number, { store: number, contest: number, subscription: number, total: number }> = []

    // Initialize all months
    for (let m = 0; m < 12; m++) {
        revenueByMonth[m] = { store: 0, contest: 0, subscription: 0, total: 0 }
    }

    // Get all payments for the year
    const payments = await prisma.payment.findMany({
        where: {
            status: PaymentStatus.SUCCEEDED,
            createdAt: { gte: startDate, lt: endDate }
        }
    })

    payments.forEach(payment => {
        const month = new Date(payment.createdAt).getMonth() + 1
        const type = payment.method === 'SUBSCRIPTION' ? 'subscription' :
            payment.method === 'STORE' ? 'store' : 'contest'

        revenueByMonth[month][type] += payment.amount
        revenueByMonth[month].total += payment.amount
    })

    return revenueByMonth
}

const getRecentContests = async (limit: number = 5) => {
    const contests = await prisma.contest.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { participants: true, } }
        }
    })

    const mappedContests = await Promise.all(contests.map(async contest => {

        const totalPhotoEntries = await contestService.getContestPhotoCount(contest.id)

        return {
            ...contest,
            totalPhoto: totalPhotoEntries,
            participantCount: contest._count.participants
        }
    }))

    return mappedContests
}

const getUserGrowthByMonth = async (year: string) => {
    const startDate = new Date(`${year}-01-01`)
    const endDate = new Date(`${Number(year) + 1}-01-01`)

    const userGrowth: Record<number, number> = []

    // Initialize all months
    for (let m = 0; m < 12; m++) {
        userGrowth[m] = 0
    }

    const users = await prisma.user.findMany({
        where: {
            createdAt: { gte: startDate, lt: endDate }
        },
        select: { createdAt: true }
    })

    users.forEach(user => {
        const month = user.createdAt.getMonth() + 1
        userGrowth[month]++
    })

    return userGrowth
}

const getTotalStoreSalesRevenue = async () => {
    const storePayments = await prisma.payment.aggregate({
        where: {
            status: PaymentStatus.SUCCEEDED,
            method: 'STORE'
        },
        _sum: { amount: true }
    })

    return storePayments._sum.amount || 0
}

const getContestStatsWithTotal = async () => {
    const stats = await getContestStats()
    const total = stats.running + stats.upcoming + stats.completed
    return { ...stats, total }
}

const getDashboardOverview = async () => {
    const currentYear = new Date().getFullYear().toString()

    const totalUsers = await prisma.user.count()
    const totalContests = await getContestStatsWithTotal()
    const totalActiveContests = totalContests.running

    const totalPayments = await prisma.payment.count({ where: { status: PaymentStatus.SUCCEEDED } })
    const totalIncomeData = await calcIncomeData()
    const active_user_count = await activeUsers()
    const inactive_user_count = await inactiveUsers()
    const paid_members_count = await getpaidMembers()
    const pro_member_count = await getProMemberCount()
    const premium_member_count = await getPremiumMemberCount()

    // Get member ratio with all 12 months
    const member_ratio = await calcMemberRatio(currentYear)

    // Get revenue by type
    const revenueByType = await getRevenueByType(currentYear)

    // Get recent contests
    const recentContests = await getRecentContests(5)

    // Get user growth by month
    const userGrowthByMonth = await getUserGrowthByMonth(currentYear)

    // Get total store sales revenue
    const totalStoreSalesRevenue = await getTotalStoreSalesRevenue()

    // Calculate total revenue
    const totalRevenue = totalIncomeData.totalIncome + totalStoreSalesRevenue



    return {
        totalUsers,
        totalContests,
        totalPayments,
        totalIncomeData,
        active_user_count,
        inactive_user_count,
        paid_members_count,
        pro_member_count,
        premium_member_count,
        member_ratio,
        revenueByType,
        recentContests,
        userGrowthByMonth,
        totalRevenue,
        totalActiveContests,
        totalStoreSalesRevenue
    }
}


const getAdminNotifications = async () => {
    const notifications = await notificationService.getAdminNotification()
    return notifications
}


const getUserStats = async () => {
    const totalUsers = await prisma.user.count()
    const active_user_count = await activeUsers()
    const blocked_user_count = await blockedUsersCount()
    
    return { totalUsers, active_user_count, blocked_user_count }
}

const getAllUsers = async (pagination: { page?: string, limit?: string, search?: string, status?: string, role?: string }) => {
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
        page: parseInt(pagination.page || '1') || 1,
        limit: parseInt(pagination.limit || '10') || 10
    });

    const whereCondition: any = {}

    if (pagination.status === 'active') {
        whereCondition.isActive = true
    } else if (pagination.status === 'inactive') {
        whereCondition.isActive = false
    }

    if (pagination.role) {
        whereCondition.role = pagination.role
    }

    if (pagination.search) {
        whereCondition.OR = [
            { fullName: { contains: pagination.search, mode: 'insensitive' } },
            { email: { contains: pagination.search, mode: 'insensitive' } },
            { username: { contains: pagination.search, mode: 'insensitive' } },
            { phone: { contains: pagination.search, mode: 'insensitive' } },
        ]
    }

    const users = await prisma.user.findMany({
        where: whereCondition,
        select: { id: true, firstName: true, lastName: true, fullName: true, email: true, username: true, avatar: true, role: true, isActive: true, createdAt: true },
        skip,
        take: paginationLimit,
        orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.user.count({ where: whereCondition });
    const paginationMetaData = paginationHelper.getPaginationMetaData(
        parseInt(pagination.page || '1') || 1,
        paginationLimit,
        total
    );

    let mappedUsers = users.map(async user => {
        let votes = await voteService.getUserTotalVotes(user.id)
        return { ...user, votes }
    })
    return {
        data: await Promise.all(mappedUsers),
        meta: paginationMetaData
    };
}

const toggleBlockStatus = async (userId: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
        throw new Error('User not found')
    }

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { isBlocked: !user.isBlocked, isActive: !user.isActive },
        select: { id: true, fullName: true, email: true, isActive: true, isBlocked: true }
    })

    return updatedUser
}

const getStoreStats = async () => {
    const totalProducts = await prisma.product.count()
    const totalActiveProducts = await prisma.product.count({ where: { status: "ACTIVE" } })
    const totalPurchases = await prisma.payment.count({ where: { method: 'STORE', status: PaymentStatus.SUCCEEDED } })
    const totalRevenue = await prisma.payment.aggregate({
        where: {
            method: 'STORE',
            status: PaymentStatus.SUCCEEDED
        },
        _sum: { amount: true }
    })

    const allPrices = await prisma.price.findMany()
    const totalStoreValue = allPrices.reduce((acc, price) => acc + (price.amount * price.quantity), 0)

    return {
        totalProducts,
        totalPurchases,
        totalRevenue: totalRevenue._sum.amount || 0,
        totalStoreValue,
        totalActiveProducts,
    }
}

const getPlans = async (status?: SubscriptionPlanStatus, search?: string) => {
    const whereCondition: any = {}
    if (status) {
        whereCondition.status = status
    }

    if (search) {
        whereCondition.OR = [
            { planName: { equals: search.toUpperCase() as SubscriptionPlanEnum } },
            { stripe_price_id: { contains: search, mode: 'insensitive' } },
            { stripe_product_id: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
        ]
    }

    const plans = await prisma.subscriptionPlan.findMany({
        where: whereCondition,
        select: { id: true, planName: true, amount: true, currency: true, recurring: true, status: true }
    })
    return plans
}

const getPlansStats = async () => {
    const plans = await prisma.subscriptionPlan.findMany()

    const plansWithStats = await Promise.all(plans.map(async (plan) => {
        const subscribers = await prisma.subscription.count({ where: { plan: plan.planName } })
        const totalRevenue = await prisma.payment.aggregate({
            where: {
                planName: plan.planName,
                status: PaymentStatus.SUCCEEDED,
                method: 'SUBSCRIPTION'
            },
            _sum: { amount: true }
        })

        return {
            ...plan,
            subscribers,
            totalRevenue: totalRevenue._sum.amount || 0
        }
    }))

    return plansWithStats
}

const getTransactions = async (query: { page?: string, limit?: string, search?: string, status?: string, method?: string, planName?: string }) => {
    const paginationData = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 10,
    }

    const whereCondition: any = {}

    if (query.status && Object.values(PaymentStatus).includes(query.status as PaymentStatus)) {
        whereCondition.status = query.status as PaymentStatus
    }

    if (query.method) {
        whereCondition.method = query.method
    }

    if (query.planName && Object.values(SubscriptionPlanEnum).includes(query.planName as SubscriptionPlanEnum)) {
        whereCondition.planName = query.planName as SubscriptionPlanEnum
    }

    if (query.search) {
        whereCondition.OR = [
            { stripe_payment_id: { contains: query.search, mode: 'insensitive' } },
            { stripe_session_id: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
            { amount: { equals: Number(query.search) } },
            { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ]
    }

    const payments = await prisma.payment.findMany({
        where: whereCondition,
        include: {
            user: {
                select: { id: true, avatar: true, fullName: true, email: true }
            }
        },
        orderBy: { createdAt: 'desc' },
        skip: (paginationData.page - 1) * paginationData.limit,
        take: paginationData.limit
    })

    const total = await prisma.payment.count({ where: whereCondition })

    return { data: payments, meta: { page: paginationData.page, limit: paginationData.limit, total } }
}

const getTransactionStats = async () => {

    const totalTransactions = await prisma.payment.count()
    const successfulTransactions = await prisma.payment.count({ where: { status: PaymentStatus.SUCCEEDED } })
    const failedTransactions = await prisma.payment.count({ where: { status: PaymentStatus.FAILED } })
    const pendingTransactions = await prisma.payment.count({ where: { status: PaymentStatus.PENDING } })

    const totalRevenue = await prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true }
    })

    // Fetch all successful payments once for derived stats
    const allSuccessfulPayments = await prisma.payment.findMany({ where: { status: PaymentStatus.SUCCEEDED } })

    const averageTransactionValue = allSuccessfulPayments.length > 0
        ? allSuccessfulPayments.reduce((acc, p) => acc + p.amount, 0) / allSuccessfulPayments.length
        : 0

    // Total successful payments count
    const totalSuccessfulPayments = allSuccessfulPayments.length

    // Current year for date filtering
    const currentYear = new Date().getFullYear()

    // Store revenue
    const totalStoreRevenue = allSuccessfulPayments
        .filter(p => p.type === 'STORE')
        .reduce((acc, p) => acc + p.amount, 0)

    // Subscription revenue
    const totalSubscriptionRevenue = allSuccessfulPayments
        .filter(p => p.method === 'SUBSCRIPTION')
        .reduce((acc, p) => acc + p.amount, 0)

    // This month's total revenue
    const now = new Date()
    const currentMonth = now.getMonth()
    const thisMonthTotalRevenue = allSuccessfulPayments
        .filter(p => {
            const d = new Date(p.createdAt)
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth
        })
        .reduce((acc, p) => acc + p.amount, 0)

    return {
        totalSuccessfulPayments,
        totalRevenue: totalRevenue._sum.amount || 0,
        thisMonthTotalRevenue,
        totalStoreRevenue,
        totalSubscriptionRevenue,
    }
}

const getSubscriptionStats = async () => {
    // Total plans
    const totalPlans = await prisma.subscriptionPlan.count()

    // Total active subscribers
    const totalActiveSubscribers = await prisma.user.count({
        where: { purchased_plan: { in: [SubscriptionPlanEnum.PREMIUM, SubscriptionPlanEnum.PRO] } }
    })

    // Total subscription revenue
    const totalSubscriptionRevenue = await prisma.payment.aggregate({
        where: {
            method: 'SUBSCRIPTION',
            status: PaymentStatus.SUCCEEDED
        },
        _sum: { amount: true }
    })

    // Monthly subscription revenue
    const monthlySubscriptionRevenue: Record<number, number> = {}

    // Initialize all months
    for (let m = 1; m <= 12; m++) {
        monthlySubscriptionRevenue[m] = 0
    }

    const subscriptionPayments = await prisma.payment.findMany({
        where: {
            method: 'SUBSCRIPTION',
            status: PaymentStatus.SUCCEEDED
        }
    })

    subscriptionPayments.forEach(payment => {
        const month = new Date(payment.createdAt).getMonth() + 1
        monthlySubscriptionRevenue[month] += payment.amount
    })

    return {
        totalPlans,
        totalActiveSubscribers,
        totalSubscriptionRevenue: totalSubscriptionRevenue._sum.amount || 0,
        monthlySubscriptionRevenue
    }
}

// ===================== Subscription Plan CRUD =====================

const createSubscriptionPlan = async (data: {
    planName: SubscriptionPlanEnum,
    features: string[],
    description: string,
    amount: number,
    recurring: PlanRecurringType,
    currency?: string,
    status?: SubscriptionPlanStatus,
}) => {
    const plan = await prisma.subscriptionPlan.create({
        data: {
            planName: data.planName,
            description: data.description,
            features: data.features,
            amount: data.amount,
            recurring: data.recurring,
            currency: data.currency || 'USD',
            status: data.status || SubscriptionPlanStatus.ACTIVE,

        }
    })
    return plan
}

const getAllSubscriptionPlans = async (query: {
    page?: string,
    limit?: string,
    search?: string,
    status?: string,
}) => {
    const paginationData = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 10,
    }

    const whereCondition: any = {}

    if (query.status && Object.values(SubscriptionPlanStatus).includes(query.status as SubscriptionPlanStatus)) {
        whereCondition.status = query.status as SubscriptionPlanStatus
    }

    if (query.search) {
        whereCondition.OR = [
            { planName: { equals: query.search.toUpperCase() as SubscriptionPlanEnum } },
            { stripe_price_id: { contains: query.search, mode: 'insensitive' } },
            { stripe_product_id: { contains: query.search, mode: 'insensitive' } },
        ]
    }

    const plans = await prisma.subscriptionPlan.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip: (paginationData.page - 1) * paginationData.limit,
        take: paginationData.limit,
    })

    const total = await prisma.subscriptionPlan.count({ where: whereCondition })
    const totalPages = Math.ceil(total / paginationData.limit)

    return {
        meta: {
            page: paginationData.page,
            limit: paginationData.limit,
            total,
            totalPages,
        },
        data: plans,
    }
}

const getSubscriptionPlanById = async (id: string) => {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } })
    if (!plan) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found')
    }
    return plan
}

const updateSubscriptionPlan = async (id: string, data: {
    planName?: SubscriptionPlanEnum,
    stripe_price_id?: string,
    stripe_product_id?: string,
    features?: string[],
    amount?: number,
    recurring?: PlanRecurringType,
    currency?: string,
    status?: SubscriptionPlanStatus,
}) => {
    const existingPlan = await prisma.subscriptionPlan.findUnique({ where: { id } })
    if (!existingPlan) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found')
    }

    const updatedPlan = await prisma.subscriptionPlan.update({
        where: { id },
        data,
    })
    return updatedPlan
}

const deleteSubscriptionPlan = async (id: string) => {
    const existingPlan = await prisma.subscriptionPlan.findUnique({ where: { id } })
    if (!existingPlan) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Subscription plan not found')
    }

    await prisma.subscriptionPlan.delete({ where: { id } })
    return { message: 'Subscription plan deleted successfully' }
}

export const dashboardService = {
    getAllPaymentsHistory,
    getProPreminumIncomeByYear,
    calcIncomeDataByYear,
    getContestStats,
    calcMemberRatio,
    getDashboardOverview,
    getAdminNotifications,
    getUserStats,
    getAllUsers,
    toggleBlockStatus,
    getStoreStats,
    getPlans,
    getPlansStats,
    getTransactions,
    getTransactionStats,
    getSubscriptionStats,
    createSubscriptionPlan,
    getAllSubscriptionPlans,
    getSubscriptionPlanById,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
}