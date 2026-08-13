
import { UserStore } from "../../../../prismaClient/client";
import prisma from "../../../../shared/prisma";




const getStoreData = async (userId: string) => {
  
    const storeData = await prisma.userStore.findUnique({
      where: { userId },
      select:{id:true,key:true, boost:true, swap:true, coins:true}
    });
    return storeData;
  
}   

const addStoreData = async (userId: string, data: {key:number, boost:number, swap:number}) => {  
    const store  = await prisma.userStore.findUnique({where:{userId}})
    if (store) {
        throw new Error("User store already exists");
    }
    const newStore = await prisma.userStore.create({
      data: {
        userId,
        boost: data.boost || 0,
        key: data.key || 0,
        swap: data.swap || 0,
        coins: 0
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
        boost: {increment:(data.boost || 0)},
        swap: {increment:(data.swap || 0)},
        key: {increment: (data.key || 0)},
        coins: data.coins ? { increment: data.coins } : undefined
      }
    });

    return updatedStore;

}   


const addUserStoreBasedOnType = async (userId: string, type: "key" | "boost" | "swap", amount: number) => {
    const store = await prisma.userStore.findUnique({where:{userId}})
    if (!store) {
      throw new Error("User store not found");
    }
    // Update the store based on the type and amount
    const updatedStore = await prisma.userStore.update({
        where: { userId },
        data: {
            [type]: { increment: amount }
        }
    });
    return updatedStore;
};

const deductCoinsFromStore = async (userId: string, amount: number) => {
    const store = await prisma.userStore.findUnique({where:{userId}})
    if (!store) {
      throw new Error("User store not found");
    }
    if (store.coins < amount) {
      throw new Error("Insufficient coins");
    }
    const updatedStore = await prisma.userStore.update({
        where: { userId },
        data: {
            coins: { decrement: amount }
        }
    });
    return updatedStore;
};

export const userStoreService = {
  getStoreData, 
  addStoreData,
  updateStoreData,
  addUserStoreBasedOnType,
  deductCoinsFromStore
};
