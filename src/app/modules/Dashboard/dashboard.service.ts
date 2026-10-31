import { ContestStatus, PaymentStatus, PaymentType, Prisma, SubscriptionPlanEnum, SubscriptionPlanStatus } from "../../../prismaClient"
import prisma from "../../../shared/prisma"
import { notificationService } from "../Notification/notification.service"
import { getVoteTotalsByUser } from "../Vote/voteWeight.service"
import { userCache } from "../User/user.cache"
import { authCache } from "../Auth/auth.cache"
import { profileCache } from "../Profile/profile.cache"
import { versionedCache } from "../../../shared/versionedCache"



const getContestStats = async () => {
    const runningContestCount = await prisma.contest.count({where:{status:ContestStatus.ACTIVE}})
    const upcomignContestCount = await prisma.contest.count({where:{status:ContestStatus.UPCOMING}})
    const completedContestCount = await prisma.contest.count({where:{status:{in:[ContestStatus.COMPLETED, ContestStatus.CLOSED]}}})

    return {running:runningContestCount, upcoming:upcomignContestCount, completed:completedContestCount}
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

 
  const result: Record<number, { premium: number; pro: number }> = {}
  for (let m = 1; m <= 12; m++) {
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

type PaymentMonthTotal = {month:number; type:PaymentType; planName:SubscriptionPlanEnum | null; total:number}

const yearRange = (year:string) => ({
    gte:new Date(`${year}-01-01`),
    lt:new Date(`${Number(year) + 1}-01-01`)
})

// Successful payments added up per month, type and plan by the database. Every
// income figure on the dashboard comes from these totals, so the payments
// themselves are never loaded into memory.
const loadPaymentMonthTotals = async (range?:{gte:Date; lt:Date}):Promise<PaymentMonthTotal[]> => {
    const rows = await prisma.payment.aggregateRaw({
        pipeline:[
            {$match:{
                status:PaymentStatus.SUCCEEDED,
                ...(range && {createdAt:{$gte:{$date:range.gte.toISOString()}, $lt:{$date:range.lt.toISOString()}}})
            }},
            {$group:{
                _id:{month:{$month:"$createdAt"}, type:"$type", planName:"$planName"},
                total:{$sum:"$amount"}
            }}
        ]
    }) as unknown as {_id:{month:number; type:PaymentType; planName?:SubscriptionPlanEnum | null}; total:number}[]

    return rows.map(row => ({
        month:row._id.month,
        type:row._id.type,
        planName:row._id.planName ?? null,
        total:row.total
    }))
}

const sumTotals = (rows:PaymentMonthTotal[]) => rows.reduce((sum, row) => sum + row.total, 0)

const totalsByMonth = (rows:PaymentMonthTotal[]) => {
    const byMonth:Record<string, number> = {}
    rows.forEach(row => {
        byMonth[row.month] = (byMonth[row.month] ?? 0) + row.total
    })
    return byMonth
}

const subscriptionRows = (rows:PaymentMonthTotal[], plan:SubscriptionPlanEnum) =>
    rows.filter(row => row.type === PaymentType.SUBSCRIPTION && row.planName === plan)

const calcIncomeDataByYear = async (year: string) => {
    const rows = await loadPaymentMonthTotals(yearRange(year))

    return {
        totalIncome:sumTotals(rows),
        totalProIncome:sumTotals(subscriptionRows(rows, SubscriptionPlanEnum.PRO)),
        totalPremiumIncome:sumTotals(subscriptionRows(rows, SubscriptionPlanEnum.PREMIUM)),
        incomeByMonth:totalsByMonth(rows)
    }
}

const getProPreminumIncomeByYear = async (year: string) => {
    const rows = await loadPaymentMonthTotals(yearRange(year))

    return {
        proIncomeByMonth:totalsByMonth(subscriptionRows(rows, SubscriptionPlanEnum.PRO)),
        premiumIncomeByMonth:totalsByMonth(subscriptionRows(rows, SubscriptionPlanEnum.PREMIUM))
    }
}

const calcIncomeData = async () => {
    const rows = await loadPaymentMonthTotals()

    return {totalIncome:sumTotals(rows), incomeByMonth:totalsByMonth(rows)}
}

const getAllPaymentsHistory = async (query:{page:string, limit:string}) => {

    const paginationData = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 10,
    
    }

    const payments = await prisma.payment.findMany({where:{status:PaymentStatus.SUCCEEDED},include:{user:{
        select:{id:true,avatar:true, fullName:true, email:true}}},
         orderBy:{createdAt:'desc'}, skip:(paginationData.page - 1) * paginationData.limit, take: paginationData.limit})

    const total = await prisma.payment.count({where:{status:PaymentStatus.SUCCEEDED}})
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
    const users = await prisma.user.count({where:{isActive:true}})
    return users
}

const inactiveUsers = async () => {
    const users = await prisma.user.count({where:{isActive:false}})
    return users
}
const getpaidMembers = async () => {
    const users = await prisma.user.count({where:{purchased_plan:{in:[SubscriptionPlanEnum.PREMIUM, SubscriptionPlanEnum.PRO]}}})
    return users
}

const getProMemberCount = async () => {
    return await prisma.user.count({where:{purchased_plan:SubscriptionPlanEnum.PRO}})
}

const getPremiumMemberCount = async () => {
    return await prisma.user.count({where:{purchased_plan:SubscriptionPlanEnum.PREMIUM}})
}

const getRevenueByType = async (year: string) => {
    const revenueByMonth: Record<number, {store: number, contest: number, subscription: number, total: number}> = {}
    for (let m = 1; m <= 12; m++) {
        revenueByMonth[m] = { store: 0, contest: 0, subscription: 0, total: 0 }
    }

    const rows = await loadPaymentMonthTotals(yearRange(year))
    rows.forEach(row => {
        const type = row.type === PaymentType.SUBSCRIPTION ? 'subscription' :
                     row.type === PaymentType.STORE ? 'store' : 'contest'

        revenueByMonth[row.month][type] += row.total
        revenueByMonth[row.month].total += row.total
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
            _count: { select: { participants: true ,} }
        }
    })

    const photoCounts = await prisma.contestPhoto.groupBy({
        by: ["contestId"],
        where: { contestId: { in: contests.map(contest => contest.id) } },
        _count: { _all: true }
    })
    const photoCountByContestId = new Map(photoCounts.map(group => [group.contestId, group._count._all]))

    return contests.map(contest => ({
        ...contest,
        totalPhoto: photoCountByContestId.get(contest.id) ?? 0,
        participantCount: contest._count.participants
    }))
}

const getUserGrowthByMonth = async (year: string) => {
    const startDate = new Date(`${year}-01-01`)
    const endDate = new Date(`${Number(year) + 1}-01-01`)
    
    const userGrowth: Record<number, number> = {}
    
    // Initialize all months
    for (let m = 1; m <= 12; m++) {
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
            type: PaymentType.STORE
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

const OVERVIEW_TTL_SECONDS = 60

const loadDashboardOverview = async () => {
    const currentYear = new Date().getFullYear().toString()

    const [
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
        totalStoreSalesRevenue
    ] = await Promise.all([
        prisma.user.count(),
        getContestStatsWithTotal(),
        prisma.payment.count({where:{status:PaymentStatus.SUCCEEDED}}),
        calcIncomeData(),
        activeUsers(),
        inactiveUsers(),
        getpaidMembers(),
        getProMemberCount(),
        getPremiumMemberCount(),
        calcMemberRatio(currentYear),
        getRevenueByType(currentYear),
        getRecentContests(5),
        getUserGrowthByMonth(currentYear),
        getTotalStoreSalesRevenue()
    ])

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
        totalRevenue:totalIncomeData.totalIncome,
        totalActiveContests:totalContests.running,
        totalStoreSalesRevenue
    }
}

const getDashboardOverview = () =>
    versionedCache.get("dashboard", "overview", {}, loadDashboardOverview, {ttlSeconds:OVERVIEW_TTL_SECONDS})


const getAdminNotifications = async () => {
    const notifications = await notificationService.getAdminNotification()
    return notifications
}


const getUserStats  = async () => {
    const [totalUsers, active_user_count, inactive_user_count, blocked_user_count, paid_members_count] = await Promise.all([
        prisma.user.count(),
        activeUsers(),
        inactiveUsers(),
        prisma.user.count({where:{isBlocked:true}}),
        getpaidMembers()
    ])
    return {totalUsers, active_user_count, inactive_user_count, blocked_user_count, paid_members_count}
}

const getAllUsers = async (pagination:{page:string, limit:string}) => {
    const limit = parseInt(pagination.limit)
    const users = await prisma.user.findMany({
        select:{id:true, firstName:true, lastName:true, fullName:true, email:true, username:true, avatar:true, role:true, isActive:true, createdAt:true},
        skip:(parseInt(pagination.page) - 1) * limit,
        take:limit
    })
    const votesByUserId = await getVoteTotalsByUser(users.map(user => user.id))

    return users.map(user => ({...user, votes:votesByUserId.get(user.id) ?? 0}))
}

const toggleBlockStatus = async (userId: string) => {
    const user = await prisma.user.findUnique({where:{id:userId}})
    if (!user) {
        throw new Error('User not found')
    }
    
    const updatedUser = await prisma.user.update({
        where:{id:userId},
        data:{isBlocked:!user.isBlocked, isActive:user.isBlocked},
        select:{id:true, fullName:true, email:true, isActive:true, isBlocked:true, isDeleted:true}
    })
    await Promise.all([
        userCache.invalidateUser(userId),
        authCache.invalidateAuthenticatedUser(userId),
        profileCache.invalidateUser(userId)
    ])
    
    return updatedUser
}

const getStoreStats = async () => {
    const totalProducts = await prisma.product.count()
    const totalActiveProducts = await prisma.product.count({where:{status:"ACTIVE"}})
    const totalPurchases = await prisma.payment.count({where:{type:PaymentType.STORE, status:PaymentStatus.SUCCEEDED}})
    const totalRevenue = await prisma.payment.aggregate({
        where: {
            type: PaymentType.STORE,
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

const getPlans = async (status?:SubscriptionPlanStatus) => {
    return versionedCache.get("subscription-plan", "dashboard-list", {status}, () =>
        prisma.subscriptionPlan.findMany({
            where:{status},
            select:{id:true, planName:true, amount:true, currency:true, recurring:true,status:true}
        }),
        {ttlSeconds: 30 * 60}
    )
}

const getPlansStats = async () => {
    const plans = await prisma.subscriptionPlan.findMany()
    
    const plansWithStats = await Promise.all(plans.map(async (plan) => {
        const subscribers = await prisma.subscription.count({where:{plan:plan.planName}})
        const totalRevenue = await prisma.payment.aggregate({
            where:{
                planName:plan.planName,
                status:PaymentStatus.SUCCEEDED,
                type:PaymentType.SUBSCRIPTION
            },
            _sum:{amount:true}
        })
        
        return {
            ...plan,
            subscribers,
            totalRevenue:totalRevenue._sum.amount || 0
        }
    }))
    
    return plansWithStats
}

const getTransactions = async (query:{page:string, limit:string, search?:string}) => {
    const paginationData = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 10,
    }

    const search = query.search?.trim()
    const where = search ? {
        OR: [
            { currency: { contains: search, mode: 'insensitive' as const } },
            { method: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
            ...(Object.values(PaymentStatus).includes(search.toUpperCase() as PaymentStatus)
                ? [{ status: search.toUpperCase() as PaymentStatus }]
                : []),
            ...(Object.values(PaymentType).includes(search.toUpperCase() as PaymentType)
                ? [{ type: search.toUpperCase() as PaymentType }]
                : []),
            ...(Object.values(SubscriptionPlanEnum).includes(search.toUpperCase() as SubscriptionPlanEnum)
                ? [{ planName: search.toUpperCase() as SubscriptionPlanEnum }]
                : []),
        ]
    } : {}

    const payments = await prisma.payment.findMany({
        where,
        include:{user:{
            select:{id:true,avatar:true, fullName:true, email:true}
        }},
        orderBy:{createdAt:'desc'},
        skip:(paginationData.page - 1) * paginationData.limit,
        take:paginationData.limit
    })

    const total = await prisma.payment.count({where})

    return {payments, total, page:paginationData.page, limit:paginationData.limit}
}

const getTransactionStats = async () => {
    const succeeded = {status:PaymentStatus.SUCCEEDED}
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const sumAmount = (where:Prisma.PaymentWhereInput) =>
        prisma.payment.aggregate({where:{...succeeded, ...where}, _sum:{amount:true}}).then(result => result._sum.amount || 0)

    const [
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        averages,
        totalRevenue,
        thisMonthTotalRevenue,
        totalStoreRevenue,
        totalSubscriptionRevenue
    ] = await Promise.all([
        prisma.payment.count(),
        prisma.payment.count({where:succeeded}),
        prisma.payment.count({where:{status:PaymentStatus.FAILED}}),
        prisma.payment.count({where:{status:PaymentStatus.PENDING}}),
        prisma.payment.aggregate({where:succeeded, _avg:{amount:true}}),
        sumAmount({}),
        sumAmount({createdAt:{gte:monthStart, lt:nextMonthStart}}),
        sumAmount({type:PaymentType.STORE}),
        sumAmount({type:PaymentType.SUBSCRIPTION})
    ])

    return {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        totalRevenue,
        averageTransactionValue:averages._avg.amount ?? 0,
        totalSuccessfulPayments:successfulTransactions,
        thisMonthTotalRevenue,
        totalStoreRevenue,
        totalSubscriptionRevenue
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
            type: PaymentType.SUBSCRIPTION,
            status: PaymentStatus.SUCCEEDED
        },
        _sum: { amount: true }
    })
    
    // Monthly subscription revenue
    const monthlySubscriptionRevenue: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) {
        monthlySubscriptionRevenue[m] = 0
    }
    const rows = await loadPaymentMonthTotals()
    rows.filter(row => row.type === PaymentType.SUBSCRIPTION).forEach(row => {
        monthlySubscriptionRevenue[row.month] += row.total
    })

    return {
        totalPlans,
        totalActiveSubscribers,
        totalSubscriptionRevenue: totalSubscriptionRevenue._sum.amount || 0,
        monthlySubscriptionRevenue
    }
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
}
