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

// NEW: Join Request System Routes
router.post('/request/send/:teamId', auth(), teamController.sendJoinRequest);
router.get('/request/pending/:teamId', auth(), teamController.getJoinRequests);
router.post('/request/approve/:joinRequestId', auth(), teamController.approveJoinRequest);
router.post('/request/reject/:joinRequestId', auth(), teamController.rejectJoinRequest);

// NEW: Leaderboard & Match History Routes
router.get('/leaderboard/all', auth(), teamController.getTeamLeaderboard);
router.get('/history/:teamId', auth(), teamController.getTeamHistory);
router.post('/match/record-result', auth(UserRole.ADMIN), teamController.recordMatchResult);
router.get('/active-match/:teamId', auth(), teamController.getActiveMatch);

export const teamRoutes = router;
