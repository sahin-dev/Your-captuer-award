import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { voteController } from "./vote.controller";
import validateRequest from "../../middlewares/validation.middleware";
import { provideVoteShcema } from "./validation/vote.validation";

const router = Router()

router.post("/:contestId", auth(),validateRequest(provideVoteShcema), voteController.addContestVote)


export const  voteRouter = router
