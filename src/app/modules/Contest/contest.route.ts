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

router.route("/").post(fileUploader.filesystemUploadContestBanner,validateRequest(createContestSchema), auth(UserRole.ADMIN),  contestController.createContest).get(auth(), contestController.getContestsByStatus)
router.route("/recurring").post(fileUploader.filesystemUploadContestBanner, validateRequest(createContestSchema), auth(UserRole.ADMIN), contestController.createRecurringContest).get(auth(UserRole.ADMIN), contestController.getRecurringContests)
router.route("/recurring/:contestId").get(auth(UserRole.ADMIN), contestController.getRecurringContestById).put(auth(UserRole.ADMIN), fileUploader.filesystemUploadContestBanner, contestController.updateRecurringContestDetails).delete(auth(UserRole.ADMIN), contestController.deleteRecurringContest)
router.get("/all", auth(UserRole.ADMIN), contestController.getAllContests)
router.get("/ucontests", contestController.getPublicContestsByStatus)
router.get("/ucontests/:contestId", contestController.getContestById)

router.get("/my-active-contests", auth(), contestController.getMyActiveContests)
router.post("/photos/promote", auth(), contestController.promotePhoto)
router.post("/trade",fileUploader.filesystemUploadTradePhoto, auth(), contestController.tradePhoto)
router.post("/charge", auth(), contestController.chargePhoto)

router.get("/:contestId/photos", auth(), contestController.getUploadedPhotos)
router.get("/:contestId/photos/vote", auth(), contestController.getUploadedPhotosToVote)
router.get("/:contestId/rules", contestRuleController.getContestRules)
router.get("/:contestId/prizes", contestPrizeController.getContestPrize)
router.get("/:contestId/winners", contestController.getWinners)
router.get("/:contestId/user-photos", auth(), contestController.getUserRemainingPhotos)
router.get("/:contestId/rank-photos", contestController.getContestPhotosSortedByVote)
router.get("/:contestId/rank-photographer", contestController.getContestPhotographers)

router.delete("/:contestId/photos/:photoId", auth(), contestController.deleteContestPhoto)

router.post("/:contestId/upload",fileUploader.filesystemUploadUserPhoto, auth(), contestController.uploadPhoto)
router.route("/:contestId").get(contestController.getContestById).put(auth(UserRole.ADMIN), fileUploader.filesystemUploadContestBanner, contestController.updateContestDetails).delete(auth(UserRole.ADMIN), contestController.deleteContest)
router.route("/:contestId/join").post(auth(),contestController.joinContest)

export const contestRoutes = router