import {Router} from 'express'
import { fileUploader } from '../../../helpers/fileUploader'
import { contestController } from './contest.controller'
import auth from '../../middlewares/auth.middleware'
import { UserRole } from '../../../prismaClient'
import validateRequest from '../../middlewares/validation.middleware'
import { contestAwardSelectionSchema, createContestSchema, updateContestSchema } from './contest.validation'
import { contestRuleController } from './ContestRules/contestRules.controller'



const router = Router()

router.route("/").post(auth(UserRole.ADMIN), fileUploader.contestBanner, validateRequest(createContestSchema), contestController.createContest).get(auth(), contestController.getContestsByStatus)
router.get("/all", auth(UserRole.ADMIN), contestController.getAllContests)
router.get("/create-options", auth(UserRole.ADMIN), contestController.getCreateOptions)

router.get("/my-active-contests", auth(), contestController.getMyActiveContests)
router.get("/ucontests", contestController.getPublicContests)
router.get("/ucontests/:contestId", contestController.getPublicContestById)
router.get("/rules/definitions", auth(UserRole.ADMIN), contestRuleController.getContestRuleDefinitions)
router.post("/photos/promote", auth(), contestController.promotePhoto)
router.post("/trade", auth(), fileUploader.tradePhoto, contestController.tradePhoto)
router.post("/charge", auth(), contestController.chargePhoto)

router.get("/:contestId/photos", auth(), contestController.getUploadedPhotos)
router.get("/:contestId/photos/vote", auth(), contestController.getUploadedPhotosToVote)
router.get("/:contestId/rules", contestRuleController.getContestRules)
router.get("/:contestId/prizes", contestController.getContestPrizes)
router.get("/:contestId/prize-selections", auth(UserRole.ADMIN), contestController.getAwardSelections)
router.get("/:contestId/winners", auth(), contestController.getWinners)
router.get("/:contestId/award-selections", auth(UserRole.ADMIN), contestController.getAwardSelections)
router.put(
    "/:contestId/prizes/:awardId/selection",
    auth(UserRole.ADMIN),
    validateRequest(contestAwardSelectionSchema),
    contestController.selectAwardPhoto
)
router.put(
    "/:contestId/awards/:awardId/selection",
    auth(UserRole.ADMIN),
    validateRequest(contestAwardSelectionSchema),
    contestController.selectAwardPhoto
)
router.get("/:contestId/user-photos", auth(), contestController.getUserRemainingPhotos)
router.get("/:contestId/rank-photos", contestController.getContestPhotosSortedByVote)
router.get("/:contestId/rank-photographer", contestController.getContestPhotographers)

router.delete("/:contestId/photos/:photoId", auth(), contestController.deleteContestPhoto)

router.post("/:contestId/upload", auth(), fileUploader.userPhoto, contestController.uploadPhoto)
router.route("/:contestId")
    .get(auth(), contestController.getContestById)
    .put(auth(UserRole.ADMIN), fileUploader.contestBanner, validateRequest(updateContestSchema), contestController.updateContestDetails)
    .delete(auth(UserRole.ADMIN), contestController.deleteContest)
router.route("/:contestId/join").post(auth(),contestController.joinContest)

export const contestRoutes = router
