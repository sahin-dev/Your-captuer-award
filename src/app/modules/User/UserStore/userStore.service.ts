import ApiError from "../../../../errors/ApiError"
import prisma from "../../../../shared/prisma"
import httpStatus from "http-status"

const getStoreData = async (userId:string)=>{

    const store = await prisma.userStore.findUnique({where:{userId}, select:{keys:true, trades:true,charges:true}})
    if(!store){
        throw new ApiError(httpStatus.NOT_FOUND, 'user store not found')
    }
    return store
}



export const userStoreService = {
    getStoreData
}