import express from 'express';
import  {teamController} from './team.controller';
import { fileUploader } from '../../../helpers/fileUploader';
import auth from '../../middlewares/auth.middleware';
import { createTeamValidationSchema, updateTeamValidationSchema } from './team.validation';
import validateRequest from '../../middlewares/validation.middleware';
import { UserRole } from '../../../prismaClient';


const router = express.Router();

router.post('/',auth(UserRole.ADMIN), validateRequest(createTeamValidationSchema), fileUploader.uploadBadge, teamController.createTeam);
router.get('/', auth(),teamController.getTeams);
router.get('/:teamId',auth(), teamController.getTeamDetails);
router.put('/:teamId',auth(UserRole.ADMIN), validateRequest(updateTeamValidationSchema), teamController.updateTeam);
router.delete('/:teamId', auth(UserRole.ADMIN),teamController.deleteTeam);

export const teamRoutes = router;
