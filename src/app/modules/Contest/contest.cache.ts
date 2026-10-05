import { metrics } from "@opentelemetry/api";
import { redisClient } from "../../../shared/redis";
import logger from "../../../shared/logger";
import config from "../../../config";
import { cacheMetrics } from "../../../shared/cacheMetrics";

// Redis cache for the slow-changing data hung off a contest (rules, prizes,
// level awards, finalization, award selections, winners).
//
// Deliberately NOT cached here:
// - the contest row itself: one cheap query, and it is where status, dates
//   and soft-delete change (Agenda jobs, finalization, votes' guards), so
//   keeping it live means none of those writers need to know about the cache.
// - vote totals: they change on every vote, so they are always read live and
//   overlaid on the cached part.
//
// Invalidation is versioned: every key embeds the contest's current version,
// and invalidateContest() just bumps it. That avoids tracking which keys
// exist, and closes the read/write race - a reader that loaded stale rows
// before a write finished stores them under the old version, which nothing
// reads any more. The contest status is part of the key too, so a status
// change (e.g. ACTIVE -> COMPLETED, which adds winners) misses automatically.
//
// Every operation fails open: if Redis is down or errors, callers get a fresh
// database load and the request still succeeds.

export type ContestCachePart = "detail" | "list" | "winners" | "completedCard";

type CacheableContest = { id: string; status: string };

type CacheOptions = {
  // Extra key segment for per-viewer entries, e.g. a user id.
  scope?: string;
  ttlSeconds?: number;
};

const DATA_TTL_SECONDS = 10 * 60;
// Must outlive every data TTL: if a version key expired while data written
// under a later version were still alive, the counter would restart and could
// collide with those entries.
const VERSION_TTL_SECONDS = 24 * 60 * 60;

// Counts every contest looked up through the cache. result is hit, miss, or
// bypass (Redis unavailable). A no-op when telemetry is off.
const cacheLookups = metrics
  .getMeter("contest-cache")
  .createCounter("yca.contest_cache.lookups", {
    description: "Contest cache lookups by part and result",
  });

const versionKey = (contestId: string) => `contest:${contestId}:ver`;

const dataKey = (
  part: ContestCachePart,
  contest: CacheableContest,
  version: string,
  scope?: string,
) =>
  `contest:${contest.id}:v${version}:${contest.status}:${part}${scope ? `:${scope}` : ""}`;

// JSON turns Dates into ISO strings; turn them back so cached values have the
// same shape as freshly loaded Prisma rows.
const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const reviveDates = (_key: string, value: unknown) =>
  typeof value === "string" && isoDatePattern.test(value)
    ? new Date(value)
    : value;

const getMany = async <T>(
  part: ContestCachePart,
  contests: CacheableContest[],
  load: (contests: CacheableContest[]) => Promise<Map<string, T>>,
  options: CacheOptions = {},
): Promise<Map<string, T>> => {
  const ttlSeconds = Math.min(
    options.ttlSeconds ?? DATA_TTL_SECONDS,
    VERSION_TTL_SECONDS,
  );
  if (contests.length === 0) {
    return new Map();
  }
  if (!config.cache.enabled) {
    logger.debug({ part }, "Contest cache bypassed because cache is disabled");
    cacheLookups.add(contests.length, { part, result: "bypass" });
    cacheMetrics.recordLookup(
      "bypass",
      { scope: "contest", part },
      contests.length,
    );
    return load(contests);
  }
  if (!redisClient.isReady) {
    logger.debug({ part }, "Contest cache bypassed because Redis is not ready");
    cacheLookups.add(contests.length, { part, result: "bypass" });
    cacheMetrics.recordLookup(
      "bypass",
      { scope: "contest", part },
      contests.length,
    );
    return load(contests);
  }

  let keys: string[];
  let cached: (string | null)[];
  try {
    const versions = await redisClient.mGet(
      contests.map((contest) => versionKey(contest.id)),
    );
    keys = contests.map((contest, index) =>
      dataKey(part, contest, versions[index] ?? "0", options.scope),
    );
    cached = await redisClient.mGet(keys);
  } catch (error) {
    logger.error({ err: error, part }, "Contest cache read failed");
    cacheLookups.add(contests.length, { part, result: "bypass" });
    cacheMetrics.recordLookup(
      "error",
      { scope: "contest", part },
      contests.length,
    );
    return load(contests);
  }

  const result = new Map<string, T>();
  const misses: CacheableContest[] = [];
  const missKeys = new Map<string, string>();

  contests.forEach((contest, index) => {
    const raw = cached[index];
    if (raw !== null) {
      result.set(contest.id, JSON.parse(raw, reviveDates));
    } else {
      misses.push(contest);
      missKeys.set(contest.id, keys[index]);
    }
  });

  cacheLookups.add(contests.length - misses.length, { part, result: "hit" });
  cacheLookups.add(misses.length, { part, result: "miss" });
  cacheMetrics.recordLookup(
    "hit",
    { scope: "contest", part },
    contests.length - misses.length,
  );
  cacheMetrics.recordLookup("miss", { scope: "contest", part }, misses.length);

  if (misses.length > 0) {
    const loaded = await load(misses);
    const write = redisClient.multi();
    let shouldWrite = false;
    loaded.forEach((value, contestId) => {
      result.set(contestId, value);
      const key = missKeys.get(contestId);
      if (key) {
        shouldWrite = true;
        write.setEx(key, ttlSeconds, JSON.stringify(value));
      }
    });
    if (shouldWrite) {
      try {
        await write.exec();
        cacheMetrics.recordWrite(
          "success",
          { scope: "contest", part },
          loaded.size,
        );
      } catch (error) {
        logger.error({ err: error, part }, "Contest cache write failed");
        cacheMetrics.recordWrite(
          "error",
          { scope: "contest", part },
          loaded.size,
        );
      }
    }
  }

  return result;
};

const getOne = async <T>(
  part: ContestCachePart,
  contest: CacheableContest,
  load: (contest: CacheableContest) => Promise<T>,
  options: CacheOptions = {},
): Promise<T> => {
  const result = await getMany(
    part,
    [contest],
    async ([only]) => new Map([[only.id, await load(only)]]),
    options,
  );
  return result.get(contest.id) as T;
};

// Call after the database write has committed. Never throws: a failed
// invalidation leaves entries to expire on their TTL.
const invalidateContest = async (contestId: string) => {
  if (!config.cache.enabled || !redisClient.isReady) {
    cacheMetrics.recordInvalidation("bypass", {
      scope: "contest",
      part: "contest",
    });
    return;
  }
  try {
    await redisClient
      .multi()
      .incr(versionKey(contestId))
      .expire(versionKey(contestId), VERSION_TTL_SECONDS)
      .exec();
    cacheMetrics.recordInvalidation("success", {
      scope: "contest",
      part: "contest",
    });
  } catch (error) {
    logger.error(
      { err: error, contestId },
      "Contest cache invalidation failed",
    );
    cacheMetrics.recordInvalidation("error", {
      scope: "contest",
      part: "contest",
    });
  }
};

export const contestCache = {
  getMany,
  getOne,
  invalidateContest,
};
