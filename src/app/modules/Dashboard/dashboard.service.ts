import { ContestStatus, SubscriptionPlanEnum } from "../../../prismaClient"
import prisma from "../../../shared/prisma"


const getContestStats = async () => {
    const runningContestCount = await prisma.contest.count({where:{status:ContestStatus.ACTIVE}})
    const upcomignContestCount = await prisma.contest.count({where:{status:ContestStatus.UPCOMING}})
    const completedContestCount = await prisma.contest.count({where:{status:ContestStatus.CLOSED}})

    return {running:runningContestCount, upcoming:upcomignContestCount, completed:completedContestCount}
}


const clacMemberRatio = async (year:string) => {
    const premium = await prisma.user.findMany({where:{purchased_plan:SubscriptionPlanEnum.PREMIUM}})
    const pro = await prisma.user.findMany({where:{purchased_plan:SubscriptionPlanEnum.PRO}})

    let result :Record<string, any> = {}

    premium.forEach( user => {
        const date = new Date(user.createdAt)
        const month = date.getMonth() + 1
        if(result[month]){
            result[month] = result[month].premium? {"premium":result[month].premium + 1}:{"premium":1}
        }else {
            result[month] = {"premium":1}
        }
    })

    pro.forEach( user => {
        const date = new Date(user.createdAt)
        const month = date.getMonth() + 1
        if(result[month]){
            result[month] = result[month].premium? {"pro":result[month].premium + 1}:{"pro":1}
        }else {
            result[month] = {"pro":1}
        }
    })

    return result
}



const calcIncomeDate = async () =>{

}

export const dashboardService = {}