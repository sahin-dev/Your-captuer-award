import { Request, Response, NextFunction } from "express";
import prisma from "../../shared/prisma";
import ApiError from "../../errors/ApiError";
import httpstatus from "http-status";

const checkSubscription = async (req:Request, res:Response, next:NextFunction) => {
  const user = req.user; // Assuming user is set in the request by a previous middleware

  if (!user) {
    throw new ApiError(httpstatus.UNAUTHORIZED, "Unauthorized, token missing")
  }

  next()

}

export default checkSubscription