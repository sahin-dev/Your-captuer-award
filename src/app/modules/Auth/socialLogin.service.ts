import {NextFunction, Request, Response} from 'express'
import { generateToken } from "../../../helpers/jwt";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import prisma from '../../../shared/prisma';
import passport from 'passport';
import config from '../../../config';

const googleCallback = (req: Request, res: Response, next: NextFunction) => {
  const successRedirectBase = config.web_redirect_success || "https://your-capture-awards-frontend.vercel.app";
  const failureRedirectUrl = config.web_redirect_failure || "https://your-capture-awards-frontend.vercel.app/login";

  passport.authenticate("google", { failureRedirect: failureRedirectUrl, session: false },
    async (err: any, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return next(new ApiError(httpStatus.NOT_FOUND, 'User not found'));
      }
     
      try {
        const token = generateToken({ id: user.id, role: user.role });

        await prisma.user.update({ where: { id: user.id }, data: { accessToken: token } });
        
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });
        
        const redirectUrl = successRedirectBase.includes('?') 
          ? `${successRedirectBase}&token=${token}` 
          : `${successRedirectBase}?token=${token}`;
          
        return res.redirect(redirectUrl);
      } catch (error) {
        return next(error);
      }
    }
  )(req, res, next);
};

const facebookCallback = (req: Request, res: Response, next: NextFunction) => {
  const successRedirectBase = config.web_redirect_success || "https://your-capture-awards-frontend.vercel.app";
  const failureRedirectUrl = config.web_redirect_failure || "https://your-capture-awards-frontend.vercel.app/login";

  passport.authenticate(
    "facebook",
    { failureRedirect: failureRedirectUrl, session: false },
    async (err: any, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return next(new ApiError(httpStatus.NOT_FOUND, 'User not found'));
      }

      try {
        const token = generateToken({ id: user.id, role: user.role });

        await prisma.user.update({ where: { id: user.id }, data: { accessToken: token } });
        
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });

        const redirectUrl = successRedirectBase.includes('?') 
          ? `${successRedirectBase}&token=${token}` 
          : `${successRedirectBase}?token=${token}`;
          
        return res.redirect(redirectUrl);
      } catch (error) {
        return next(error);
      }
    }
  )(req, res, next);
};

export const socialLogin = {
    googleCallback,
    facebookCallback
}