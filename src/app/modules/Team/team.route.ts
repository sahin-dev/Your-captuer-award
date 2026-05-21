import express from 'express';
import  {teamController} from './team.controller';
import { fileUploader } from '../../../helpers/fileUploader';
import auth from '../../middlewares/auth.middleware';
import { createTeamValidationSchema, updateTeamValidationSchema } from './team.validation';
import validateRequest from '../../middlewares/validation.middleware';
import { UserRole } from '../../../prismaClient';


const router = express.Router();

router.post('/',auth(),fileUploader.uploadBadge, validateRequest(createTeamValidationSchema), teamController.createTeam);

router.post("/invite", auth(), teamController.inviteUser)
router.post("/leave", auth(), teamController.leaveTeam)
router.post("/remove", auth(), teamController.removeMemberFromTeam)
router.get("/my-team", auth(), teamController.getMyTeamDetails)
router.get("/suggests", auth(), teamController.getSuggestedTeams)
router.post("/join-by-invitation", auth(), teamController.joinByInvitation)
router.post("/join/:teamId", auth(), teamController.joinTeam)

// NEW: Role Management Routes
/**
 * POST /api/teams/:teamId/members/:memberId/assign-role
 * Leader can assign MODERATOR or LEADER role to a member
 * Body: { role: 'MODERATOR' | 'LEADER' }
 */
router.post('/:teamId/members/:memberId/assign-role', auth(), teamController.assignMemberRole)

/**
 * POST /api/teams/:teamId/members/:memberId/revoke-role
 * Leader can revoke roles and downgrade member back to MEMBER level
 */
router.post('/:teamId/members/:memberId/revoke-role', auth(), teamController.revokeMemberRole)

router.get('/', auth(),teamController.getTeams);
router.get('/:teamId',auth(), teamController.getTeamDetails);

router.get("/members/:teamId", auth(), teamController.getAllTeamMembers)
router.put('/:teamId',auth(),fileUploader.uploadBadge, validateRequest(updateTeamValidationSchema), teamController.updateTeam);
router.delete('/:teamId', auth(UserRole.USER),teamController.deleteTeam);

// NEW: Join Request System Routes
router.post('/request/send/:teamId', auth(), teamController.sendJoinRequest);
router.get('/request/pending/:teamId', auth(), teamController.getJoinRequests);
router.post('/request/approve/:joinRequestId', auth(), teamController.approveJoinRequest);
router.post('/request/reject/:joinRequestId', auth(), teamController.rejectJoinRequest);

// NEW: Leaderboard & Match History Routes
router.get('/leaderboard/all', auth(), teamController.getTeamLeaderboard);
router.get('/history/:teamId', auth(), teamController.getTeamHistory);
router.post('/match/record-result', auth(UserRole.USER), teamController.recordMatchResult);
router.get('/active-match/:teamId', auth(), teamController.getActiveMatch);

// NEW: Auto Match System Routes (Team Admin selects contest, system finds rival)
/**
 * GET /api/teams/:teamId/available-contests
 * Get list of available TEAM contests for team admin to choose from
 */
router.get('/:teamId/available-contests', auth(), teamController.getAvailableTeamContests);

/**
 * POST /api/teams/:teamId/start-match-auto
 * Team admin selects a contest, system automatically finds rival team and starts match
 * Body: { contestId: string }
 */
router.post('/:teamId/start-match-auto', auth(), teamController.startTeamMatchWithAutoRival);

export const teamRoutes = router;
