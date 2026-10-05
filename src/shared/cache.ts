import logger from "./logger";
import { redisClient } from "./redis";
import config from "../config";

type CacheOptions = {
  label?: string;
  cacheNull?: boolean;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const reviveDates = (_key: string, value: unknown) =>
  typeof value === "string" && isoDatePattern.test(value) ? new Date(value) : value;

const canUseCache = () => config.cache.enabled && redisClient.isReady;

const getJson = async <T>(key: string, options: CacheOptions = {}): Promise<T | null> => {
  if (!canUseCache()) {
    return null;
  }

  try {
    const cached = await redisClient.get(key);
    return cached ? JSON.parse(cached, reviveDates) : null;
  } catch (error) {
    logger.error({ err: error, key, label: options.label }, "Cache read failed");
    return null;
  }
};

const setJson = async <T>(
  key: string,
  value: T,
  ttlSeconds: number,
  options: CacheOptions = {}
) => {
  if (!canUseCache()) {
    return;
  }

  if (value === null && options.cacheNull === false) {
    await del(key, options);
    return;
  }

  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error({ err: error, key, label: options.label }, "Cache write failed");
  }
};

const getOrSet = async <T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> => {
  const cached = await getJson<T>(key, options);
  if (cached !== null) {
    return cached;
  }

  const fresh = await load();
  await setJson(key, fresh, ttlSeconds, options);
  return fresh;
};

const del = async (keys: string | string[], options: CacheOptions = {}) => {
  const keyList = Array.isArray(keys) ? keys : [keys];
  if (!canUseCache() || keyList.length === 0) {
    return;
  }

  try {
    await redisClient.del(keyList);
  } catch (error) {
    logger.error({ err: error, keys: keyList, label: options.label }, "Cache invalidation failed");
  }
};

export const cache = {
  getJson,
  setJson,
  getOrSet,
  del,
};
