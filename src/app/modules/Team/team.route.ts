import express from 'express';
import  {teamController} from './team.controller';
import { fileUploader } from '../../../helpers/fileUploader';
import auth from '../../middlewares/auth.middleware';
import { createTeamValidationSchema, updateTeamValidationSchema } from './team.validation';
import validateRequest from '../../middlewares/validation.middleware';
import { UserRole } from '../../../prismaClient';


const router = express.Router();

router.post('/',auth(UserRole.ADMIN),fileUploader.uploadBadge, validateRequest(createTeamValidationSchema), teamController.createTeam);
router.post("/invite", auth(), teamController.inviteUser)
router.post("/leave", auth(), teamController.leaveTeam)
router.post("/remove", auth(), teamController.removeMemberFromTeam)
router.get("/my-team", auth(), teamController.getMyTeamDetails)
router.get("/suggests", auth(), teamController.getSuggestedTeams)
router.post("/join-by-invitation", auth(), teamController.joinByInvitation)
router.post("/join/:teamId", auth(), teamController.joinTeam)
router.get('/', auth(),teamController.getTeams);
router.get('/:teamId',auth(UserRole.ADMIN), teamController.getTeamDetails);

router.get("/members/:teamId", auth(), teamController.getAllTeamMembers)
router.put('/:teamId',auth(UserRole.ADMIN), validateRequest(updateTeamValidationSchema), teamController.updateTeam);
router.delete('/:teamId', auth(UserRole.ADMIN),teamController.deleteTeam);

export const teamRoutes = router;
