import { createClient } from "redis";
import config from "../config";
import logger from "./logger";

const redisUrl = config.redis.url || `redis://${config.redis.host}:${config.redis.port}`;

// General-purpose client: cache reads/writes and Socket.IO adapter publishes.
export const redisClient = createClient({ url: redisUrl });
// A client in subscriber mode cannot run other commands, so the adapter's
// subscriber gets its own connection.
export const redisSubClient = redisClient.duplicate();

// node-redis emits "error" on connection problems; without a listener the
// process crashes, so log it and let the client's built-in reconnect retry.
redisClient.on("error", (error) => logger.error({ err: error }, "Redis error"));
redisSubClient.on("error", (error) => logger.error({ err: error }, "Redis subscriber error"));

// node-redis v4+ does not connect on creation. Any command before this
// resolves fails with ClientClosedError, so await it during startup.
export async function connectRedis() {
  if (!config.cache.enabled) {
    logger.info("Cache is disabled; Redis connection skipped");
    return;
  }

  try {
    await Promise.all([redisClient.connect(), redisSubClient.connect()]);
    logger.info("Redis connected");
  } catch (error) {
    logger.error({ err: error }, "Redis unavailable; cache will be bypassed");
  }
}

export async function disconnectRedis() {
  await Promise.all(
    [redisClient, redisSubClient].filter((client) => client.isOpen).map((client) => client.quit())
  );
}
