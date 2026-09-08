import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { voteController } from "./vote.controller";
import validateRequest from "../../middlewares/validation.middleware";
import { provideVoteShcema, voteCountsRequestSchema } from "./validation/vote.validation";

const router = Router()

// Lightweight polling target for realtime vote counts - kept ahead of the
// "/:contestId" route below so "counts" is never swallowed as a contestId
// param.
router.post("/counts", auth(), validateRequest(voteCountsRequestSchema), voteController.getVoteCounts)

router.post("/:contestId", auth(),validateRequest(provideVoteShcema), voteController.addContestVote)


export const  voteRouter = router
