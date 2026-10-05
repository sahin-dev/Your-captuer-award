import config from "../../../config";
import logger from "../../../shared/logger";
import { cacheMetrics } from "../../../shared/cacheMetrics";
import { redisClient } from "../../../shared/redis";

type CacheOptions = {
  ttlSeconds?: number;
};

const DATA_TTL_SECONDS = 10 * 60;
const VERSION_TTL_SECONDS = 24 * 60 * 60;

const catalogVersionKey = "store:products:ver";
const productVersionKey = (productId: string) =>
  `store:product:${productId}:ver`;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const reviveDates = (_key: string, value: unknown) =>
  typeof value === "string" && isoDatePattern.test(value)
    ? new Date(value)
    : value;

const canUseCache = () => config.cache.enabled && redisClient.isReady;

const stableStringify = (value: Record<string, unknown>) =>
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
    cacheMetrics.recordLookup("bypass", { scope: "store", part });
    cacheMetrics.recordWrite("bypass", { scope: "store", part });
    return load();
  }

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      cacheMetrics.recordLookup("hit", { scope: "store", part });
      return JSON.parse(cached, reviveDates) as T;
    }
    cacheMetrics.recordLookup("miss", { scope: "store", part });
  } catch (error) {
    logger.error({ err: error, key, label }, "Store cache read failed");
    cacheMetrics.recordLookup("error", { scope: "store", part });
    return load();
  }

  const fresh = await load();
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(fresh));
    cacheMetrics.recordWrite("success", { scope: "store", part });
  } catch (error) {
    logger.error({ err: error, key, label }, "Store cache write failed");
    cacheMetrics.recordWrite("error", { scope: "store", part });
  }
  return fresh;
};

const getProduct = async <T>(
  productId: string,
  load: () => Promise<T>,
  options: CacheOptions = {},
) => {
  if (!canUseCache()) {
    cacheMetrics.recordLookup("bypass", { scope: "store", part: "product" });
    return load();
  }

  const version = await getVersion(productVersionKey(productId));
  return getOrSet(
    `store:product:${productId}:v${version}:details`,
    load,
    options.ttlSeconds ?? DATA_TTL_SECONDS,
    "store-product",
    "product",
  );
};

const getProductPrices = async <T>(
  productId: string,
  load: () => Promise<T>,
  options: CacheOptions = {},
) => {
  if (!canUseCache()) {
    cacheMetrics.recordLookup("bypass", {
      scope: "store",
      part: "product-prices",
    });
    return load();
  }

  const version = await getVersion(productVersionKey(productId));
  return getOrSet(
    `store:product:${productId}:v${version}:prices`,
    load,
    options.ttlSeconds ?? DATA_TTL_SECONDS,
    "store-product-prices",
    "product-prices",
  );
};

const getProductList = async <T>(
  scope: string,
  params: Record<string, unknown>,
  load: () => Promise<T>,
  options: CacheOptions = {},
) => {
  if (!canUseCache()) {
    cacheMetrics.recordLookup("bypass", {
      scope: "store",
      part: `products-${scope}`,
    });
    return load();
  }

  const version = await getVersion(catalogVersionKey);
  return getOrSet(
    `store:products:v${version}:${scope}:${stableStringify(params)}`,
    load,
    options.ttlSeconds ?? DATA_TTL_SECONDS,
    `store-products-${scope}`,
    `products-${scope}`,
  );
};

const bumpVersion = async (key: string, label: string) => {
  if (!canUseCache()) {
    cacheMetrics.recordInvalidation("bypass", { scope: "store", part: label });
    return;
  }

  try {
    await redisClient.multi().incr(key).expire(key, VERSION_TTL_SECONDS).exec();
    cacheMetrics.recordInvalidation("success", { scope: "store", part: label });
  } catch (error) {
    logger.error({ err: error, key, label }, "Store cache invalidation failed");
    cacheMetrics.recordInvalidation("error", { scope: "store", part: label });
  }
};

const invalidateCatalog = async () => {
  await bumpVersion(catalogVersionKey, "store-products");
};

const invalidateProduct = async (productId: string) => {
  await Promise.all([
    bumpVersion(productVersionKey(productId), "store-product"),
    invalidateCatalog(),
  ]);
};

export const storeCache = {
  getProduct,
  getProductPrices,
  getProductList,
  invalidateCatalog,
  invalidateProduct,
};
