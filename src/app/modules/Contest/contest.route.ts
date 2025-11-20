import {Router} from 'express'
import { fileUploader } from '../../../helpers/fileUploader'
import { contestController } from './contest.controller'
import auth from '../../middlewares/auth.middleware'
import { UserRole } from '../../../prismaClient'
import validateRequest from '../../middlewares/validation.middleware'
import { createContestSchema } from './contest.validation'
import { contestRuleController } from './ContestRules/contestRules.controller'
import { contestPrizeController } from './ContestPrizes/contestPrize.controller'



const router = Router()

router.route("/").post(fileUploader.contestBanner,validateRequest(createContestSchema), auth(UserRole.ADMIN),  contestController.createContest).get(auth(), contestController.getContestsByStatus)
router.get("/all", auth(UserRole.ADMIN), contestController.getAllContests)

router.get("/my-active-contests", auth(), contestController.getMyActiveContests)
router.post("/photos/promote", auth(), contestController.promotePhoto)
router.post("/trade",fileUploader.tradePhoto, auth(), contestController.tradePhoto)
router.post("/charge", auth(), contestController.chargePhoto)

router.get("/:contestId/photos", auth(), contestController.getUploadedPhotos)
router.get("/:contestId/photos/vote", auth(), contestController.getUploadedPhotosToVote)
router.get("/:contestId/rules", auth(), contestRuleController.getContestRules)
router.get("/:contestId/prizes", auth(), contestPrizeController.getContestPrize)
router.get("/:contestId/winners", auth(), contestController.getWinners)
router.get("/:contestId/user-photos", auth(), contestController.getUserRemainingPhotos)
router.get("/:contestId/rank-photos", auth(), contestController.getContestPhotosSortedByVote)
router.get("/:contestId/rank-photographer", auth(), contestController.getContestPhotographers)

router.delete("/:contestId/photos/:photoId", auth(), contestController.deleteContestPhoto)

router.post("/:contestId/upload",fileUploader.userPhoto, auth(), contestController.uploadPhoto)
router.route("/:contestId").get(auth(), contestController.getContestById).put(auth(UserRole.ADMIN), contestController.updateContestDetails).delete(auth(UserRole.ADMIN), contestController.deleteContest)
router.route("/:contestId/join").post(auth(),contestController.joinContest)

export const contestRoutes = router