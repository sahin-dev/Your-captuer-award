import { Router } from "express";
import path from "path";
import { userRoutes } from "../modules/User/user.routes";
import { authRoutes } from "../modules/Auth/auth.route";
import { contestRoutes } from "../modules/Contest/contest.route";
import { likeRoutes } from "../modules/Like/like.route";
import { followRoutes } from "../modules/Follow/follow..route";
import { commentRoutes } from "../modules/Comment/comment.route";
import { teamRoutes } from "../modules/Team/team.route";
import { achievementRoutes } from "../modules/Achievements/achievement.route";




const router = Router()

const moduleRoutes = [
    {path:"/users", route:userRoutes},
    {path:"/auth", route:authRoutes},
    {path:"/contests", route:contestRoutes},
    {path:"/likes", route:likeRoutes},
    {path:"/follows", route:followRoutes},
    {path:"/comments", route:commentRoutes},
    {path:"/teams", route:teamRoutes},
    {path:"/achievements", route:achievementRoutes},

]

moduleRoutes.forEach((route) => router.use(route.path, route.route));
export default router