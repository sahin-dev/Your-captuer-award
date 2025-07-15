import {Router} from 'express'
import { fileUploader } from '../../../helpers/fileUploader'
import { createContest } from './contest.controller'
import auth from '../../middlewares/auth.middleware'
import { UserRole } from '@prisma/client'

const router = Router()

router.post("/", auth(), fileUploader.contestBanner, createContest)
router.get("/", auth(UserRole.ADMIN), )


export const contestRoutes = router