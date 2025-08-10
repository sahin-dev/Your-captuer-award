import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { voteController } from "./vote.controller";

const router = Router()

router.post("/:contestId", auth(),voteController.addContestVote)


export const  voteRouter = router
