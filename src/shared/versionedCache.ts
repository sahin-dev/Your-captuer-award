import { createHash } from "crypto";
import config from "../config";
import logger from "./logger";
import { cacheMetrics } from "./cacheMetrics";
import { redisClient } from "./redis";
import { cache } from "./cache";

type VersionedCacheOptions = {
  ttlSeconds?: number;
  versionTtlSeconds?: number;
  label?: string;
};

const DEFAULT_TTL_SECONDS = 10 * 60;
const DEFAULT_VERSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const versionKey = (scope: string) => `cache:${scope}:version`;

const stableStringify = (value: unknown): string => {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
};

const paramsHash = (params: unknown) =>
  createHash("sha1").update(stableStringify(params)).digest("hex");

const getVersion = async (
  scope: string,
  options: VersionedCacheOptions = {},
) => {
  return cache.getOrSet<number>(
    versionKey(scope),
    options.versionTtlSeconds ?? DEFAULT_VERSION_TTL_SECONDS,
    async () => 1,
    { label: options.label ?? scope, scope, part: "version", metrics: false },
  );
};

const get = async <T>(
  scope: string,
  part: string,
  params: unknown,
  load: () => Promise<T>,
  options: VersionedCacheOptions = {},
): Promise<T> => {
  const version = await getVersion(scope, options);
  const key = `cache:${scope}:v${version}:${part}:${paramsHash(params)}`;

  return cache.getOrSet<T>(
    key,
    options.ttlSeconds ?? DEFAULT_TTL_SECONDS,
    load,
    { label: options.label ?? `${scope}:${part}`, scope, part },
  );
};

const invalidate = async (
  scope: string,
  options: VersionedCacheOptions = {},
) => {
  if (!config.cache.enabled || !redisClient.isReady) {
    cacheMetrics.recordInvalidation("bypass", { scope, part: "version" });
    return;
  }

  const key = versionKey(scope);

  try {
    await redisClient.incr(key);
    await redisClient.expire(
      key,
      options.versionTtlSeconds ?? DEFAULT_VERSION_TTL_SECONDS,
    );
    cacheMetrics.recordInvalidation("success", { scope, part: "version" });
  } catch (error) {
    logger.error(
      { err: error, scope, label: options.label },
      "Versioned cache invalidation failed",
    );
    cacheMetrics.recordInvalidation("error", { scope, part: "version" });
  }
};

export const versionedCache = {
  get,
  invalidate,
};
