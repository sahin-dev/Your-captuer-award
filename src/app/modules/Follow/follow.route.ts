import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { getFollowers, getFollowings, getOtherUserFollowers, getOtherUserFollowings, toggoleFollow } from "./follow.controller";


const route = Router()

route.post("/toggole", auth(), toggoleFollow)
route.get("/followers",auth(), getFollowers)
route.get("/followings", auth(), getFollowings)
route.get("/followers/:userId", auth(), getOtherUserFollowers)
route.get("/followings/:userId", auth(), getOtherUserFollowings)

export const followRoutes = route