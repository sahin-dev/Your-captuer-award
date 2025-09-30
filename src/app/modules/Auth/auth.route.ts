import { Router } from "express";
import { AdminSignIn, getAuthenticatedUser, registerUser, SignIn, SignOut } from "./auth.controller";
import auth from "../../middlewares/auth.middleware";
import { socialLogin } from "./socialLogin.service";
import passport from "passport";
import googleStrategy from "../../passportStrategies/google.strategy";
import facebookStrategy from "../../passportStrategies/facebook.strategy";
import validateRequest from "../../middlewares/validation.middleware";
import { SignInSchema, userRegistrationSchema } from "./auth.validation";


const router = Router()

router.post("/signin", validateRequest(SignInSchema), SignIn)
router.post("/admin/signin", validateRequest(SignInSchema), AdminSignIn)

router.post('/signout',auth(), SignOut)

router.get("/me",auth(), getAuthenticatedUser)

router.post("/register", validateRequest(userRegistrationSchema), registerUser)


router.get("/google", passport.use(googleStrategy).authenticate("google",{
  scope: ["profile", "email"],
} ))


router.get("/google/callback", socialLogin.googleCallback);

router.get("/facebook", passport.use(facebookStrategy).authenticate("facebook"))

router.get("/facebook/callback", socialLogin.facebookCallback)



export const authRoutes = router