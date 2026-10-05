import { UserStoreType } from "./userStore.type";
import { cache } from "../../../../shared/cache";
import { userCache } from "../user.cache";

const USER_STORE_TTL_SECONDS = 15 * 60;

const generateKey = (userId: string) => `user:${userId}:store`;

const getStore = async (
  userId: string,
  loadStore: (userId: string) => Promise<UserStoreType | null>,
) => {
  return cache.getOrSet(
    generateKey(userId),
    USER_STORE_TTL_SECONDS,
    () => loadStore(userId),
    {
      label: "user-store",
      scope: "user-store",
      part: "details",
    },
  );
};

const updateCachedStore = async (
  userId: string,
  storeData: UserStoreType | null,
) => {
  await cache.setJson(generateKey(userId), storeData, USER_STORE_TTL_SECONDS, {
    label: "user-store",
    scope: "user-store",
    part: "details",
  });
  await userCache.invalidateUser(userId);
};

const invalidateStore = async (userId: string) => {
  await cache.del(generateKey(userId), {
    label: "user-store",
    scope: "user-store",
    part: "details",
  });
};

const invalidateUserStoreReadModels = async (userId: string) => {
  await Promise.all([
    invalidateStore(userId),
    userCache.invalidateUser(userId),
  ]);
};

export const userStoreCache = {
  getStore,
  updateCachedStore,
  invalidateStore,
  invalidateUserStoreReadModels,
};
