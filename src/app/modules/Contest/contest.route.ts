import {Router} from 'express'
import { fileUploader } from '../../../helpers/fileUploader'
import { createContest, getContestById, getContests, joinContest, updateContestDetails } from './contest.controller'
import auth from '../../middlewares/auth.middleware'
import { UserRole } from '@prisma/client'



const router = Router()

router.route("/").post(auth(), fileUploader.contestBanner, createContest).get(auth(UserRole.ADMIN), getContests)

router.route("/:contestId").get(auth(), getContestById).put(auth(), updateContestDetails)

router.route("/join/:contestId").post(auth(),joinContest)

export const contestRoutes = router