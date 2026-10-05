import logger from "./logger";
import { redisClient } from "./redis";
import config from "../config";
import { cacheMetrics } from "./cacheMetrics";

type CacheOptions = {
  label?: string;
  scope?: string;
  part?: string;
  metrics?: boolean;
  cacheNull?: boolean;
};

type CacheReadResult<T> =
  | { status: "hit"; value: T }
  | { status: "miss" | "bypass" | "error"; value: null };

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const reviveDates = (_key: string, value: unknown) =>
  typeof value === "string" && isoDatePattern.test(value)
    ? new Date(value)
    : value;

const canUseCache = () => config.cache.enabled && redisClient.isReady;

const shouldRecordMetrics = (options: CacheOptions) =>
  options.metrics !== false;

const readJson = async <T>(
  key: string,
  options: CacheOptions = {},
): Promise<CacheReadResult<T>> => {
  if (!canUseCache()) {
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordLookup("bypass", options);
    }
    return { status: "bypass", value: null };
  }

  try {
    const cached = await redisClient.get(key);
    if (cached === null) {
      if (shouldRecordMetrics(options)) {
        cacheMetrics.recordLookup("miss", options);
      }
      return { status: "miss", value: null };
    }

    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordLookup("hit", options);
    }
    return { status: "hit", value: JSON.parse(cached, reviveDates) };
  } catch (error) {
    logger.error(
      { err: error, key, label: options.label },
      "Cache read failed",
    );
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordLookup("error", options);
    }
    return { status: "error", value: null };
  }
};

const getJson = async <T>(
  key: string,
  options: CacheOptions = {},
): Promise<T | null> => {
  const result = await readJson<T>(key, options);
  return result.status === "hit" ? result.value : null;
};

const setJson = async <T>(
  key: string,
  value: T,
  ttlSeconds: number,
  options: CacheOptions = {},
) => {
  if (!canUseCache()) {
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordWrite("bypass", options);
    }
    return;
  }

  if (value === null && options.cacheNull === false) {
    await del(key, options);
    return;
  }

  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordWrite("success", options);
    }
  } catch (error) {
    logger.error(
      { err: error, key, label: options.label },
      "Cache write failed",
    );
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordWrite("error", options);
    }
  }
};

const getOrSet = async <T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> => {
  const cached = await readJson<T>(key, options);
  if (cached.status === "hit") {
    return cached.value;
  }

  const fresh = await load();
  await setJson(key, fresh, ttlSeconds, options);
  return fresh;
};

const del = async (keys: string | string[], options: CacheOptions = {}) => {
  const keyList = Array.isArray(keys) ? keys : [keys];
  if (!canUseCache() || keyList.length === 0) {
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordInvalidation("bypass", options, keyList.length || 1);
    }
    return;
  }

  try {
    await redisClient.del(keyList);
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordInvalidation("success", options, keyList.length);
    }
  } catch (error) {
    logger.error(
      { err: error, keys: keyList, label: options.label },
      "Cache invalidation failed",
    );
    if (shouldRecordMetrics(options)) {
      cacheMetrics.recordInvalidation("error", options, keyList.length);
    }
  }
};

export const cache = {
  getJson,
  setJson,
  getOrSet,
  del,
};
