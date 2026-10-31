import { cache } from "../../../shared/cache";

const key = (userId: string) => `user:${userId}:authenticated`;
const requestUserKey = (userId: string) => `user:${userId}:request`;
const AUTH_USER_TTL_SECONDS = 15 * 60;
const REQUEST_USER_TTL_SECONDS = 60;

const getAuthenticatedUserFromCache = async <T>(
  userId: string,
  loadFromDatabase: (userId: string) => Promise<T>,
) => {
  return cache.getOrSet(
    key(userId),
    AUTH_USER_TTL_SECONDS,
    () => loadFromDatabase(userId),
    {
      label: "authenticated-user",
      scope: "auth",
      part: "authenticated-user",
    },
  );
};

// The small record the auth middleware needs on every request. A missing user
// is not cached, so a new account works immediately.
const getRequestUser = async <T>(userId: string, loadFromDatabase: () => Promise<T>) => {
  return cache.getOrSet(requestUserKey(userId), REQUEST_USER_TTL_SECONDS, loadFromDatabase, {
    label: "request-user",
    scope: "auth",
    part: "request-user",
    cacheNull: false,
  });
};

const deleteAuthenticatedUserFromCache = async (userId: string) => {
  await cache.del([key(userId), requestUserKey(userId)], {
    label: "authenticated-user",
    scope: "auth",
    part: "authenticated-user",
  });
};

export const authCache = {
  getAuthenticatedUserFromCache,
  getRequestUser,
  deleteAuthenticatedUserFromCache,
  invalidateAuthenticatedUser: deleteAuthenticatedUserFromCache,
};
