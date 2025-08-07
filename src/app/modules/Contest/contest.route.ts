import {Router} from 'express'
import { fileUploader } from '../../../helpers/fileUploader'
import { contestController, createContest, getContestById, getContests, joinContest, updateContestDetails } from './contest.controller'
import auth from '../../middlewares/auth.middleware'
import { UserRole } from '../../../prismaClient'
import validateRequest from '../../middlewares/validation.middleware'
import { createContestSchema } from './contest.validation'





const router = Router()

router.route("/").post(validateRequest(createContestSchema), auth(UserRole.ADMIN), fileUploader.contestBanner, createContest).get(auth(UserRole.ADMIN), getContests)
router.get("/:contestId/photos", auth(), contestController.getUploadedPhotos)

router.post("/:contestId/upload", auth(), contestController.uploadPhoto)
router.route("/:contestId").get(auth(), getContestById).put(auth(), updateContestDetails)

router.route("/:contestId/join").post(auth(),joinContest)

export const contestRoutes = router