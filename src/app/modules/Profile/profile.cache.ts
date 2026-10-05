import config from "../../../config";
import logger from "../../../shared/logger";
import { cacheMetrics } from "../../../shared/cacheMetrics";
import { redisClient } from "../../../shared/redis";

type CacheOptions = {
  ttlSeconds?: number;
};

const DATA_TTL_SECONDS = 10 * 60;
const VERSION_TTL_SECONDS = 24 * 60 * 60;

const userVersionKey = (userId: string) => `profile:user:${userId}:ver`;
const photoVersionKey = (photoId: string) => `profile:photo:${photoId}:ver`;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const reviveDates = (_key: string, value: unknown) =>
  typeof value === "string" && isoDatePattern.test(value)
    ? new Date(value)
    : value;

const canUseCache = () => config.cache.enabled && redisClient.isReady;

const stableStringify = (value: Record<string, unknown> = {}) =>
  JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = value[key];
        return acc;
      }, {}),
  );

const getVersion = async (key: string) => (await redisClient.get(key)) ?? "0";

const getOrSet = async <T>(
  key: string,
  load: () => Promise<T>,
  ttlSeconds: number,
  label: string,
  part: string,
) => {
  if (!canUseCache()) {
    cacheMetrics.recordLookup("bypass", { scope: "profile", part });
    return load();
  }

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      cacheMetrics.recordLookup("hit", { scope: "profile", part });
      return JSON.parse(cached, reviveDates) as T;
    }
    cacheMetrics.recordLookup("miss", { scope: "profile", part });
  } catch (error) {
    logger.error({ err: error, key, label }, "Profile cache read failed");
    cacheMetrics.recordLookup("error", { scope: "profile", part });
    return load();
  }

  const fresh = await load();
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(fresh));
    cacheMetrics.recordWrite("success", { scope: "profile", part });
  } catch (error) {
    logger.error({ err: error, key, label }, "Profile cache write failed");
    cacheMetrics.recordWrite("error", { scope: "profile", part });
  }
  return fresh;
};

const getUserData = async <T>(
  userId: string,
  part: string,
  params: Record<string, unknown>,
  load: () => Promise<T>,
  options: CacheOptions = {},
) => {
  if (!canUseCache()) {
    cacheMetrics.recordLookup("bypass", {
      scope: "profile",
      part: `user-${part}`,
    });
    return load();
  }

  const version = await getVersion(userVersionKey(userId));
  return getOrSet(
    `profile:user:${userId}:v${version}:${part}:${stableStringify(params)}`,
    load,
    options.ttlSeconds ?? DATA_TTL_SECONDS,
    `profile-user-${part}`,
    `user-${part}`,
  );
};

const getPhotoData = async <T>(
  photoId: string,
  part: string,
  params: Record<string, unknown>,
  load: () => Promise<T>,
  options: CacheOptions = {},
) => {
  if (!canUseCache()) {
    cacheMetrics.recordLookup("bypass", {
      scope: "profile",
      part: `photo-${part}`,
    });
    return load();
  }

  const version = await getVersion(photoVersionKey(photoId));
  return getOrSet(
    `profile:photo:${photoId}:v${version}:${part}:${stableStringify(params)}`,
    load,
    options.ttlSeconds ?? DATA_TTL_SECONDS,
    `profile-photo-${part}`,
    `photo-${part}`,
  );
};

const bumpVersion = async (key: string, label: string) => {
  if (!canUseCache()) {
    cacheMetrics.recordInvalidation("bypass", {
      scope: "profile",
      part: label,
    });
    return;
  }

  try {
    await redisClient.multi().incr(key).expire(key, VERSION_TTL_SECONDS).exec();
    cacheMetrics.recordInvalidation("success", {
      scope: "profile",
      part: label,
    });
  } catch (error) {
    logger.error(
      { err: error, key, label },
      "Profile cache invalidation failed",
    );
    cacheMetrics.recordInvalidation("error", { scope: "profile", part: label });
  }
};

const invalidateUser = async (userId: string) => {
  await bumpVersion(userVersionKey(userId), "profile-user");
};

const invalidateUsers = async (userIds: string[]) => {
  await Promise.all(
    Array.from(new Set(userIds)).map((userId) => invalidateUser(userId)),
  );
};

const invalidatePhoto = async (photoId: string) => {
  await bumpVersion(photoVersionKey(photoId), "profile-photo");
};

export const profileCache = {
  getUserData,
  getPhotoData,
  invalidateUser,
  invalidateUsers,
  invalidatePhoto,
};
