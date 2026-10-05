import { cache } from "../../../shared/cache";

const key = (userId:string) => `user:${userId}:authenticated`;
const AUTH_USER_TTL_SECONDS = 15 * 60;

const getAuthenticatedUserFromCache = async <T>(userId:string, loadFromDatabase: (userId:string) => Promise<T>) => {
    return cache.getOrSet(key(userId), AUTH_USER_TTL_SECONDS, () => loadFromDatabase(userId), {
        label:"authenticated-user"
    });
}

const deleteAuthenticatedUserFromCache = async (userId:string) => {
    await cache.del(key(userId), {label:"authenticated-user"});
}

export const authCache = {
    getAuthenticatedUserFromCache,
    deleteAuthenticatedUserFromCache,
    invalidateAuthenticatedUser:deleteAuthenticatedUserFromCache
};
