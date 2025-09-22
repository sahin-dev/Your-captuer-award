import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { getFollowers, getFollowings, toggoleFollow } from "./follow.controller";


const route = Router()

route.post("/toggole", auth(), toggoleFollow)
route.get("/followers",auth(), getFollowers)
route.get("/followings", auth(), getFollowings)

export const followRoutes = route