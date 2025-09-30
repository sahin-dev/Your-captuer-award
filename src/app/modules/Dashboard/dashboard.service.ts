import { get } from "http"
import { ContestStatus, PaymentStatus, SubscriptionPlanEnum } from "../../../prismaClient"
import prisma from "../../../shared/prisma"
import { notificationService } from "../Notification/notification.service"
import { voteService } from "../Vote/vote.service"



const getContestStats = async () => {
    const runningContestCount = await prisma.contest.count({where:{status:ContestStatus.ACTIVE}})
    const upcomignContestCount = await prisma.contest.count({where:{status:ContestStatus.UPCOMING}})
    const completedContestCount = await prisma.contest.count({where:{status:ContestStatus.CLOSED}})

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


const calcIncomeData = async () =>{
    const allPayments = await prisma.payment.findMany({where:{status:PaymentStatus.SUCCEEDED}})

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

    return {totalIncome, incomeByMonth}

}

const getAllPaymentsHistory = async (query:{page:string, limit:string}) => {

    const paginationData = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 10,
    
    }

    const payments = await prisma.payment.findMany({include:{user:{select:{id:true,avatar:true, fullName:true, email:true}}}, orderBy:{createdAt:'desc'}, skip:(paginationData.page - 1) * paginationData.limit, take: paginationData.limit})
    return payments
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
const getDashboardOverview = async () => {
    const totalUsers = await prisma.user.count()
    const totalContests = await getContestStats()

    const totalPayments = await prisma.payment.count({where:{status:PaymentStatus.SUCCEEDED}})
    const totalIncomeData = await calcIncomeData()
    const active_user_count = await activeUsers()
    const inactive_user_count = await inactiveUsers()
    const paid_members_count = await getpaidMembers()
    const member_ratio = await calcMemberRatio(new Date().getFullYear().toString())

    return {totalUsers, totalContests, totalPayments, totalIncomeData, active_user_count, inactive_user_count, paid_members_count, member_ratio}
}


const getAdminNotifications = async () => {
    const notifications = await notificationService.getAdminNotification()
    return notifications
}


const getUserStats  = async () => {
    const totalUsers = await prisma.user.count()
    const active_user_count = await activeUsers()
    const inactive_user_count = await inactiveUsers()
    const paid_members_count = await getpaidMembers()
    return {totalUsers, active_user_count, inactive_user_count, paid_members_count}
}

const getAllUsers = async (pagination:{page:string, limit:string}) => {
    const users = await prisma.user.findMany({select:{id:true, firstName:true, lastName:true, fullName:true, email:true, username:true, avatar:true, role:true, isActive:true, createdAt:true}, skip:(parseInt(pagination.page) - 1) * 10, take:parseInt(pagination.limit)})
    let mappedUsers = users.map(async user => {
        
        let votes = await voteService.getUserTotalVotes(user.id)
        return {...user, votes}
      })
    return await Promise.all(mappedUsers)
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
}