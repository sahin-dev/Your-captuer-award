import { Router } from "express";
import { userRoutes } from "../modules/User/user.routes";
import { authRoutes } from "../modules/Auth/auth.route";
import { contestRoutes } from "../modules/Contest/contest.route";
import { likeRoutes } from "../modules/Like/like.route";
import { followRoutes } from "../modules/Follow/follow..route";
import { commentRoutes } from "../modules/Comment/comment.route";
import { teamRoutes } from "../modules/Team/team.route";
import { achievementRoutes } from "../modules/Achievements/achievement.route";
import { voteRouter } from "../modules/Vote/vote.route";
import { profileRoutes } from "../modules/Profile/profile.route";
import { sitePolicyRoutes } from "../modules/SitePolicy/sitepolicy.route";
import { charRoutes } from "../modules/Chat/chat.routes";




const router = Router()

const moduleRoutes = [
    {path:"/users", route:userRoutes},
    {path:"/auth", route:authRoutes},
    {path:"/contests", route:contestRoutes},
    {path:"/likes", route:likeRoutes},
    {path:"/follows", route:followRoutes},
    {path:"/comments", route:commentRoutes},
    {path:"/teams", route:teamRoutes},
    {path:"profiles", route:profileRoutes},
    {path:"/achievements", route:achievementRoutes},
    {path:"/votes", route:voteRouter},
    {path:"/site-policies", route:sitePolicyRoutes},
    {path:"/chats", route:charRoutes}

]

moduleRoutes.forEach((route) => router.use(route.path, route.route));
export default router