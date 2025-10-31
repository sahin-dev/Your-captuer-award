import {NextFunction, Request, Response} from 'express'
import { generateToken } from "../../../helpers/jwt";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import { failureRedirect } from './auth.constant';
import prisma from '../../../shared/prisma';
import passport from 'passport';
import sendResponse from '../../../shared/ApiResponse';



const googleCallback =  (req:Request, res:Response, next:NextFunction) => {
  passport.authenticate("google",{ failureRedirect: failureRedirect, session:false },
    async (err:any, user:any, info:any) => {
        
      if (err || !user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found')
      }
     
      const token = generateToken({id:user.id, role:user.role})

      await prisma.user.update({where:{id:user.id}, data:{accessToken:token}})
      
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        maxAge: 365 * 24 * 60 * 60 * 1000,
      })
      
      res.redirect(`https://your-capture-awards-frontend.vercel.app?token=${token}`)
    }
  )(req, res, next);
};


const facebookCallback = (req:Request, res:Response, next:NextFunction) => {
  passport.authenticate(
    "facebook",
    { failureRedirect: failureRedirect },
    async (err:any, user:any, info:any) => {
        
      if (err || !user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found')
      }

     
      const token = generateToken({id:user.id, role:user.role})

      await prisma.user.update({where:{id:user.id}, data:{accessToken:token}})
      
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        maxAge: 365 * 24 * 60 * 60 * 1000,
      })
      res.redirect("/success")
    }
  )(req, res, next);
};



export const socialLogin = {
    googleCallback,
    facebookCallback
}