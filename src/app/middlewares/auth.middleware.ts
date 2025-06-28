import { NextFunction, Request, Response } from "express";

import { JwtPayload, Secret } from "jsonwebtoken";
import config from "../../config"

import httpStatus from "http-status";
import ApiError from "../../errors/ApiError";
import { verifyToken } from "../../helpers/jwt";
import prisma from "../../shared/prisma";
import { User } from "@prisma/client";

const auth = (...roles: string[]) => {
  return async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
    

      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized!");
      }

      const verifiedUser = verifyToken(
        token,
        config.jwt.jwt_secret as Secret
      );
      console.log(verifiedUser)
      const { id, phone, iat } = verifiedUser;

      const user = await prisma.user.findUnique({
        where: {
          id: id,
        },
      });
      
      if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
      }

      // if (user.status === "BLOCKED") {
      //   throw new ApiError(httpStatus.FORBIDDEN, "Your account is blocked!");
      // }
      // if (user.deleted){
      //   throw new ApiError(httpStatus.BAD_REQUEST, "account is deleted")
      // }
      // if (!user.isCompleteProfile){
      //   throw new ApiError(httpStatus.BAD_REQUEST, "Your profile is not completed")
      //  }

      req.user = user;
      console.log(user.role)
      if (roles.length && !roles.includes(user.role)) {
        throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

export default auth;
