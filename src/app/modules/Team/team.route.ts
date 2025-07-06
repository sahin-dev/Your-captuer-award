import express from 'express';
import  {teamController} from './team.controller';
import { fileUploader } from '../../../helpers/fileUploader';
import auth from '../../middlewares/auth.middleware';

const router = express.Router();

router.post('/',auth(), fileUploader.uploadBadge, teamController.createTeam);
router.get('/', auth(),teamController.getTeams);
router.get('/:teamId',auth(), teamController.getTeamDetails);
router.put('/:teamId',auth(), teamController.updateTeam);
router.delete('/:teamId', auth(),teamController.deleteTeam);

export const teamRoutes = router;
