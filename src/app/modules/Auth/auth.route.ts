import { Router } from "express";
import { getAuthenticatedUser, SignIn, SignOut } from "./auth.controller";
import auth from "../../middlewares/auth.middleware";

const router = Router()

router.post("/signin", SignIn)
router.post('/signout',auth(), SignOut)
router.post("/me", getAuthenticatedUser)

export const authRoutes = router