import { Router } from "express";
import { AdminSignIn, getAuthenticatedUser, registerUser, SignIn, SignOut } from "./auth.controller";
import auth from "../../middlewares/auth.middleware";
import { socialLogin } from "./socialLogin.service";
import passport from "passport";
import validateRequest from "../../middlewares/validation.middleware";
import { SignInSchema, userRegistrationSchema } from "./auth.validation";
import { UserRole } from "../../../prismaClient";


const router = Router()

router.post("/signin", validateRequest(SignInSchema), SignIn)

router.post("/admin/signin", validateRequest(SignInSchema), AdminSignIn)

router.post('/signout',auth(), SignOut)

router.get("/me",auth(), getAuthenticatedUser)

router.post("/register", validateRequest(userRegistrationSchema), registerUser)


router.get("/google", passport.authenticate("google", {
  scope: ["profile", "email"],
}))


router.get("/google/callback", socialLogin.googleCallback);

router.get("/facebook", passport.authenticate("facebook", {
  scope: ["email"]
}))

router.get("/facebook/callback", socialLogin.facebookCallback)



export const authRoutes = router