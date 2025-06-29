import {NextFunction, Request, Response} from 'express'
import { Profile } from "passport-google-oauth20";
import { generateToken } from "../../../helpers/jwt";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import googlePassport from "../../passportStrategies/google.strategy"
import { failureRedirect } from './auth.constant';
import { userService } from '../User/user.service';
import prisma from '../../../shared/prisma';
import { IUserRegister } from '../User/user.interface';
import passport from 'passport';



//google login
// const initiateGoogleAuth = googlePassport.authenticate("google", {
//   scope: ["profile", "email"],
// });



const googleCallback = (req:Request, res:Response, next:NextFunction) => {
  passport.authenticate(
    "google",
    { failureRedirect: failureRedirect },
    async (err:any, user:any, info:any) => {
        
      if (err || !user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found')
      }

     
      const token = await generateToken({id:user.id, role:user.role})

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

//FaceBook login

// const facebookAuth = passport.authenticate("facebook");

const facebookCallback = (req:Request, res:Response, next:NextFunction) => {
  passport.authenticate(
    "facebook",
    { failureRedirect: failureRedirect },
    async (err:any, user:any, info:any) => {
        
      if (err || !user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found')
      }

     
      const token = await generateToken({id:user.id, role:user.role})

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
    // facebookAuth,
    facebookCallback
}