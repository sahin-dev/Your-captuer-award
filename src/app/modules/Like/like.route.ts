import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { getMyLikedPhotos, toggleLike } from "./like.controller";



let route = Router()

route.get("/photos", auth(), getMyLikedPhotos)
route.post("/", auth(), toggleLike)

export const likeRoutes = route