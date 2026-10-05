import { cache } from "../../../shared/cache";

const USER_DETAILS_TTL_SECONDS = 15 * 60;

export const getKey = (userId:string) => `user:${userId}:details`;

const getUserFromCache = async <T>(userId: string, loadFromDatabase: (userId:string) => Promise<T>) => {
    return cache.getOrSet(getKey(userId), USER_DETAILS_TTL_SECONDS, () => loadFromDatabase(userId), {
        label:"user-details"
    });
};

const setUserInCache = async <T>(userId: string, userData: T, expirationInSeconds = USER_DETAILS_TTL_SECONDS) => {
    await cache.setJson(getKey(userId), userData, expirationInSeconds, {label:"user-details"});
}

const invalidateUser = async (userId:string) => {
    await cache.del(getKey(userId), {label:"user-details"});
}

export const userCache = {
    getUserFromCache,
    setUserInCache,
    updateUserInCache:setUserInCache,
    invalidateUser
};
