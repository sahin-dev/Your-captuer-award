import {Router} from 'express'
import { fileUploader } from '../../../helpers/fileUploader'
import { createContest } from './contest.controller'

const router = Router()

router.post("/", fileUploader.contestBanner, createContest)


export const contestRoutes = router