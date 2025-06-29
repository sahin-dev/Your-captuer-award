import { Router } from "express";
import { getAuthenticatedUser, SignIn, SignOut } from "./auth.controller";
import auth from "../../middlewares/auth.middleware";
import { socialLogin } from "./socialLogin.service";
import passport from "passport";
import googleStrategy from "../../passportStrategies/google.strategy";
import facebookStrategy from "../../passportStrategies/facebook.strategy";

const router = Router()

router.post("/signin", SignIn)
router.post('/signout',auth(), SignOut)
router.get("/me",auth(), getAuthenticatedUser)


//Social Logins
//initial google login route
router.get("/google", passport.use(googleStrategy).authenticate("google",{
  scope: ["profile", "email"],
} ))

//google callback

router.get("/google/callback", socialLogin.googleCallback);

router.get("/facebook", passport.use(facebookStrategy).authenticate("facebook"))

router.get("/facebook/callback", socialLogin.facebookCallback)



export const authRoutes = router