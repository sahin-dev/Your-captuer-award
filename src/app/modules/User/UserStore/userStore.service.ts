
import { UserStore } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";




const getStoreData = async (userId: string) => {
  try {
    const storeData = await prisma.userStore.findUnique({
      where: { userId },
    });
    return storeData;
  } catch (error) {
    console.error("Error fetching store data:", error);
    throw new Error("Failed to fetch store data");
  }
}   

const addStoreData = async (userId: string, data: {trades:number, promotes:number, charges:number}) => {  
    const store  = await prisma.userStore.findUnique({where:{userId}})
    if (store) {
        throw new Error("User store already exists");
    }
    const newStore = await prisma.userStore.create({
      data: {
        userId,
        promotes: data.promotes || 0,
        trades: data.trades || 0,
        charges: data.charges || 0
      }
    });
    return newStore;

 }

const updateStoreData = async (userId: string, data: Partial<UserStore>) => {

    const store = await prisma.userStore.findUnique({where:{userId}})
    if (!store) {
      throw new Error("User store not found");
    }

    const updatedStore = await prisma.userStore.update({
      where: { userId },
      data:{
        promotes: data.promotes || store.promotes,
        trades: data.trades || store.trades,
        charges: data.charges || store.charges    
      }
    });

    return updatedStore;

}   


export const UserStoreService = {
  getStoreData, 
  addStoreData,
  updateStoreData
}