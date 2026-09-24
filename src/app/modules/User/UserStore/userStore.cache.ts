import { redisClient } from "../../../../../src/shared/redis";


const generateKey = (userId:string) => `user:${userId}:store`;

const getStore = async (userId:string, loadStore: (userId: string) => Promise<unknown>) => {
  const key = generateKey(userId);
  if(!redisClient.isReady){
    return loadStore(userId);
  }
  const storeData = await redisClient.get(key);
    if (storeData) {    
        return JSON.parse(storeData);
    }
    const store = await loadStore(userId);
    await redisClient.setEx(key, 3600, JSON.stringify(store));
    return store;
}

const updateCachedStore = async (userId:string, storeData: unknown) => {
  const key = generateKey(userId);
    if(!redisClient.isReady){
        return;
    }
    await redisClient.setEx(key, 3600, JSON.stringify(storeData));
}

export const userStoreCache = {
  getStore,
  updateCachedStore
};
