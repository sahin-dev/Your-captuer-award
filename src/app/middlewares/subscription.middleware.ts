import { Request, Response, NextFunction } from "express";
import prisma from "../../shared/prisma";
import ApiError from "../../errors/ApiError";
import httpstatus from "http-status";

const checkSubscription = async (req:Request, res:Response, next:NextFunction) => {
  const user = req.user; // Assuming user is set in the request by a previous middleware

  if (!user) {
    throw new ApiError(httpstatus.UNAUTHORIZED, "Unauthorized, token missing")
  }

  if (user.boosted && new Date(user.boostedTill || Date.now()) < new Date()) {
      await prisma.user.update({where:{id:user.id}, data:{boosted:false, boostedTill:null}})
  }

  if (user.superMessages <= 0){
    throw new ApiError(httpstatus.BAD_REQUEST, "0 super message remained, please buy super message or upgrade to premium")
  }
  
  if (user.planName === 'FREE'){
    throw new ApiError(httpstatus.BAD_REQUEST, "Your are currenly using free plan, Please upgrade")
  }
  next()

}

export default checkSubscription