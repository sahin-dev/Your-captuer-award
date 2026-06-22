import { NextFunction, Request, Response } from 'express'
import { generateToken } from "../../../helpers/jwt";
import prisma from '../../../shared/prisma';
import passport from 'passport';
import config from '../../../config';

const googleCallback = (req: Request, res: Response, next: NextFunction) => {
  const successRedirectBase = config.web_redirect_success || "https://your-capture-awards-frontend.vercel.app";
  const failureRedirectUrl = config.web_redirect_failure || "https://your-capture-awards-frontend.vercel.app/login";

  passport.authenticate("google", { session: false },
    async (err: any, user: any, info: any) => {
      if (err || !user) {
        const errorMsg = err?.message || info?.message || "Authentication failed";
        const redirectUrl = failureRedirectUrl.includes('?')
          ? `${failureRedirectUrl}&error=${encodeURIComponent(errorMsg)}`
          : `${failureRedirectUrl}?error=${encodeURIComponent(errorMsg)}`;
        return res.redirect(redirectUrl);
      }

      try {
        const token = generateToken({ id: user.id, role: user.role, email: user.email });

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
        const errorMsg = error instanceof Error ? error.message : "Internal server error";
        const redirectUrl = failureRedirectUrl.includes('?')
          ? `${failureRedirectUrl}&error=${encodeURIComponent(errorMsg)}`
          : `${failureRedirectUrl}?error=${encodeURIComponent(errorMsg)}`;
        return res.redirect(redirectUrl);
      }
    }
  )(req, res, next);
};

const facebookCallback = (req: Request, res: Response, next: NextFunction) => {
  const successRedirectBase = config.web_redirect_success || "https://your-capture-awards-frontend.vercel.app";
  const failureRedirectUrl = config.web_redirect_failure || "https://your-capture-awards-frontend.vercel.app/login";

  passport.authenticate(
    "facebook",
    { session: false },
    async (err: any, user: any, info: any) => {
      if (err || !user) {
        const errorMsg = err?.message || info?.message || "Authentication failed";
        const redirectUrl = failureRedirectUrl.includes('?')
          ? `${failureRedirectUrl}&error=${encodeURIComponent(errorMsg)}`
          : `${failureRedirectUrl}?error=${encodeURIComponent(errorMsg)}`;
        return res.redirect(redirectUrl);
      }

      try {
        const token = generateToken({ id: user.id, role: user.role, email: user.email });

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
        const errorMsg = error instanceof Error ? error.message : "Internal server error";
        const redirectUrl = failureRedirectUrl.includes('?')
          ? `${failureRedirectUrl}&error=${encodeURIComponent(errorMsg)}`
          : `${failureRedirectUrl}?error=${encodeURIComponent(errorMsg)}`;
        return res.redirect(redirectUrl);
      }
    }
  )(req, res, next);
};

export const socialLogin = {
  googleCallback,
  facebookCallback
}