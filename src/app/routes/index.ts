import { Router } from "express";
import path from "path";
import { userRoutes } from "../modules/User/user.routes";
import { authRoutes } from "../modules/Auth/auth.route";
import { contestRoutes } from "../modules/Contest/contest.route";
import { likeRoutes } from "../modules/Like/like.route";
import { followRoutes } from "../modules/Follow/follow..routes";




const router = Router()

const moduleRoutes = [
    {path:"/users", route:userRoutes},
    {path:"/auth", route:authRoutes},
    {path:"/contests", route:contestRoutes},
    {path:"/likes", route:likeRoutes},
    {path:"/follows", route:followRoutes}

]

moduleRoutes.forEach((route) => router.use(route.path, route.route));
export default router