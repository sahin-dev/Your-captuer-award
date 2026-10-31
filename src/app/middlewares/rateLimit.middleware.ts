import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import requestIp from "request-ip";
import ApiError from "../../errors/ApiError";
import logger from "../../shared/logger";
import { redisClient } from "../../shared/redis";

// Limits how often one address can call a route. The count is kept in Redis so
// all server processes share it. If Redis is unavailable requests are allowed,
// because a missing limit is better than an outage.
const rateLimit = (name: string, maxRequests: number, windowSeconds: number) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!redisClient.isReady) {
      return next();
    }

    let requestCount: number;
    try {
      const key = `rate-limit:${name}:${requestIp.getClientIp(req)}`;
      requestCount = await redisClient.incr(key);
      if (requestCount === 1) {
        await redisClient.expire(key, windowSeconds);
      }
    } catch (error) {
      logger.error({ err: error, name }, "Rate limit check failed");
      return next();
    }

    if (requestCount > maxRequests) {
      return next(new ApiError(httpStatus.TOO_MANY_REQUESTS, "Too many requests. Please try again shortly"));
    }
    next();
  };

export default rateLimit;
