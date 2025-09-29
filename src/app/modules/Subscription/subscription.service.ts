import prisma from "../../../shared/prisma"


const getAvailablePlans = async () => {
    const plans  = await prisma.subscriptionPlan.findMany()

    return plans
}

const getPlan = async (palnId:string) => {
    const plan = await prisma.subscriptionPlan.findUnique({where:{id:palnId}})

    return plan
}


export const subscriptionService = {
    getAvailablePlans,
    getPlan
}