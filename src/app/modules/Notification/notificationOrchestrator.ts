import { NotificationType } from "../../../prismaClient";
import { notificationService } from "./notification.service";
import { getIO } from "../../../helpers/websocketSetUp";
import logger from "../../../shared/logger";

/**
 * Notification Orchestrator
 * Centralizes all notification events and their triggers throughout the application
 */

// Notification Events
export enum NotificationEvent {
  // Vote-related
  VOTE_RECEIVED = "VOTE_RECEIVED",
  VOTE_MILESTONE = "VOTE_MILESTONE",
  
  // Level-related
  LEVEL_UP = "LEVEL_UP",
  
  // Team-related
  TEAM_MATCH_STARTED = "TEAM_MATCH_STARTED",
  TEAM_MATCH_ENDED = "TEAM_MATCH_ENDED",
  TEAM_MATCH_SEARCH_TIMEOUT = "TEAM_MATCH_SEARCH_TIMEOUT",
  TEAM_MEMBER_JOINED = "TEAM_MEMBER_JOINED",
  TEAM_INVITATION_RECEIVED = "TEAM_INVITATION_RECEIVED",
  TEAM_INVITATION_ACCEPTED = "TEAM_INVITATION_ACCEPTED",
  
  // Contest-related
  CONTEST_PHOTO_UPLOADED = "CONTEST_PHOTO_UPLOADED",
  CONTEST_PHOTO_REMOVED = "CONTEST_PHOTO_REMOVED",
  CONTEST_WINNER_ANNOUNCED = "CONTEST_WINNER_ANNOUNCED",
  CONTEST_ENDED = "CONTEST_ENDED",

  // Comment-related
  COMMENT_RECEIVED = "COMMENT_RECEIVED",
  COMMENT_REPLY_RECEIVED = "COMMENT_REPLY_RECEIVED",

  // Achievement-related
  ACHIEVEMENT_UNLOCKED = "ACHIEVEMENT_UNLOCKED",

  // Team reward-related
  TEAM_REWARD_GRANTED = "TEAM_REWARD_GRANTED",
}

interface NotificationPayload {
  event: NotificationEvent;
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  data?: Record<string, any>;
  teamId?: string; // For room-based notifications
}

/**
 * Send notification to user
 * Sends through both database and real-time channels (Socket.IO)
 */
export async function sendNotification(payload: NotificationPayload) {
  try {
    // Save to database
    await notificationService.postNotificationWithPayload(
      payload.title,
      payload.message,
      payload.userId,
      {
        event: payload.event,
        ...payload.data,
      },
      payload.type
    );

    // Send through Socket.IO real-time channel
    sendSocketNotification(payload);

    logger.debug({ event: payload.event, userId: payload.userId }, "Notification sent");
  } catch (error) {
    logger.error({ err: error }, "Failed to send notification");
  }
}

/**
 * Send real-time notification through Socket.IO
 */
function sendSocketNotification(payload: NotificationPayload) {
  try {
    const io = getIO();
    if (!io) {
      logger.warn("Socket.IO not available for real-time notification");
      return;
    }

    const socketPayload = {
      event: payload.event,
      title: payload.title,
      message: payload.message,
      data: payload.data,
      timestamp: new Date(),
    };

    if (payload.teamId) {
      // Send to team room
      io.to(`team_${payload.teamId}`).emit("notification", socketPayload);
    } else {
      // Send to specific user (via their socket connection)
      // Note: User sockets are identified by userId in Socket.IO
      io.to(payload.userId).emit("notification", socketPayload);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to send real-time notification");
  }
}

/**
 * Vote Received Notification
 * Triggered when a user receives a vote on their photo. Carries both the
 * voter's and the contest's identity so the frontend can render each as its
 * own clickable link within the message (profile / contest details).
 */
export async function notifyVoteReceived(
  participantId: string,
  userId: string,
  contestId: string,
  contestTitle: string,
  contestPhotoId: string,
  voterId: string,
  voterName: string,
  totalVotes: number
) {
  await sendNotification({
    event: NotificationEvent.VOTE_RECEIVED,
    userId,
    title: "You Received a Vote!",
    message: `${voterName} voted for your photo in "${contestTitle}"! Total votes: ${totalVotes}`,
    type: NotificationType.DEFAULT,
    data: {
      participantId,
      totalVotes,
      contestId,
      contestTitle,
      contestPhotoId,
      voterId,
      voterName,
    },
  });
}

/**
 * Level Up Notification
 * Triggered when participant reaches a new level
 */
export async function notifyLevelUp(
  participantId: string,
  userId: string,
  newLevel: string,
  milestone: number
) {
  await sendNotification({
    event: NotificationEvent.LEVEL_UP,
    userId,
    title: `Promoted to ${newLevel}! 🎉`,
    message: `Congratulations! You've reached ${newLevel} level with ${milestone} votes!`,
    type: NotificationType.VOTE,
    data: {
      participantId,
      newLevel,
      milestone,
    },
  });
}

/**
 * Team Match Started Notification
 * Sent to all team members when a match starts
 */
export async function notifyTeamMatchStarted(
  teamId: string,
  matchId: string,
  rivalTeamName: string,
  contestName: string,
  rivalTeamId?: string,
  contestId?: string
) {
  // Get all team members
  const teamMembers = await notificationService.getTeamMembers(teamId);

  for (const member of teamMembers) {
    await sendNotification({
      event: NotificationEvent.TEAM_MATCH_STARTED,
      userId: member.memberId,
      title: "Team Match Started! 🏆",
      message: `Your team is now matched against ${rivalTeamName} in "${contestName}"!`,
      type: NotificationType.DEFAULT,
      teamId,
      data: {
        teamId,
        matchId,
        rivalTeamName,
        rivalTeamId,
        contestName,
        contestId,
      },
    });
  }
}

/**
 * Team Match Ended Notification
 * Sent to all team members when a match ends with results
 */
export async function notifyTeamMatchEnded(
  teamId: string,
  matchId: string,
  result: "WIN" | "LOSS" | "DRAW",
  teamScore: number,
  rivalScore: number,
  prizes?: Record<string, any>,
  rivalTeamId?: string,
  rivalTeamName?: string,
  contestId?: string,
  contestName?: string
) {
  const teamMembers = await notificationService.getTeamMembers(teamId);
  
  const resultMessage =
    result === "WIN"
      ? `🎉 Congratulations! Your team won with ${teamScore} votes!`
      : result === "LOSS"
      ? `Team match ended. Final score: ${teamScore} vs ${rivalScore}`
      : `It's a draw! Both teams scored ${teamScore} votes`;

  for (const member of teamMembers) {
    await sendNotification({
      event: NotificationEvent.TEAM_MATCH_ENDED,
      userId: member.memberId,
      title: `Team Match Ended - ${result}`,
      message: resultMessage + (contestName ? ` in "${contestName}".` : ""),
      type: NotificationType.VOTE,
      teamId,
      data: {
        teamId,
        matchId,
        result,
        teamScore,
        rivalScore,
        prizes,
        rivalTeamId,
        rivalTeamName,
        contestId,
        contestName,
      },
    });
  }
}

/**
 * Team Match Search Timeout Notification
 * Sent to all team members when a match search expires without finding a rival
 */
export async function notifyTeamMatchSearchTimeout(
  teamId: string,
  contestName: string,
  contestId?: string
) {
  const teamMembers = await notificationService.getTeamMembers(teamId);

  for (const member of teamMembers) {
    await sendNotification({
      event: NotificationEvent.TEAM_MATCH_SEARCH_TIMEOUT,
      userId: member.memberId,
      title: "Match Search Ended",
      message: `No opponent was found for "${contestName}" within the search window.`,
      type: NotificationType.DEFAULT,
      teamId,
      data: {
        teamId,
        contestName,
        contestId,
      },
    });
  }
}

/**
 * Team Invitation Notification
 * Sent when user receives a team invitation
 */
export async function notifyTeamInvitation(
  userId: string,
  inviterId: string,
  teamId: string,
  teamName: string,
  invitationId: string
) {
  await sendNotification({
    event: NotificationEvent.TEAM_INVITATION_RECEIVED,
    userId,
    title: "Team Invitation",
    message: `You've been invited to join the ${teamName} team!`,
    type: NotificationType.INVITATION,
    data: {
      invitationId,
      inviterId,
      teamId,
      teamName,
    },
  });
}

/**
 * Achievement Unlocked Notification
 * Sent when user wins a contest or achieves something
 */
export async function notifyAchievementUnlocked(
  userId: string,
  contestId: string,
  achievementTitle: string,
  prize: string
) {
  await sendNotification({
    event: NotificationEvent.ACHIEVEMENT_UNLOCKED,
    userId,
    title: `Achievement Unlocked! 🏅`,
    message: `You won "${achievementTitle}" and earned ${prize}!`,
    type: NotificationType.DEFAULT,
    data: {
      contestId,
      achievementTitle,
      prize,
    },
  });
}

/**
 * Contest Photo Uploaded Notification
 * Sent to team members when a member uploads a photo
 */
export async function notifyContestPhotoUploaded(
  teamId: string,
  uploaderName: string,
  contestId: string,
  contestName: string,
  photoCount: number
) {
  const teamMembers = await notificationService.getTeamMembers(teamId);

  for (const member of teamMembers) {
    await sendNotification({
      event: NotificationEvent.CONTEST_PHOTO_UPLOADED,
      userId: member.memberId,
      title: "Team Member Uploaded Photo",
      message: `${uploaderName} uploaded ${photoCount} photo(s) to the "${contestName}" contest!`,
      type: NotificationType.DEFAULT,
      teamId,
      data: {
        uploaderName,
        contestId,
        contestName,
        photoCount,
      },
    });
  }
}

/**
 * Contest Ended Notification
 * Sent to every participant once a contest has been finalized
 */
export async function notifyContestEnded(
  userId: string,
  contestId: string,
  contestName: string,
  rank: number,
  totalParticipants: number
) {
  await sendNotification({
    event: NotificationEvent.CONTEST_ENDED,
    userId,
    title: "Contest Ended",
    message: `"${contestName}" has ended! You finished rank #${rank} out of ${totalParticipants} participant(s).`,
    type: NotificationType.DEFAULT,
    data: {
      contestId,
      contestName,
      rank,
      totalParticipants,
    },
  });
}

/**
 * Contest Photo Removed Notification
 * Sent to the owner when an admin removes their contest submission
 */
export async function notifyContestPhotoRemoved(
  userId: string,
  contestId: string,
  contestName: string,
  reason?: string
) {
  await sendNotification({
    event: NotificationEvent.CONTEST_PHOTO_REMOVED,
    userId,
    title: "Your contest photo was removed",
    message: reason
      ? `Your submission to "${contestName}" was removed by an admin. Reason: ${reason}`
      : `Your submission to "${contestName}" was removed by an admin.`,
    type: NotificationType.DEFAULT,
    data: {
      contestId,
      contestName,
      reason,
    },
  });
}

const previewText = (text: string, limit = 120) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
};

export async function notifyCommentReceived(
  userId: string,
  photoId: string,
  commentId: string,
  commenterId: string,
  commenterName: string,
  commentText: string,
  photoTitle?: string | null,
) {
  await sendNotification({
    event: NotificationEvent.COMMENT_RECEIVED,
    userId,
    title: "New Comment",
    message: `${commenterName} commented on your photo${photoTitle ? ` "${photoTitle}"` : ""}: ${previewText(commentText)}`,
    type: NotificationType.COMMENT,
    data: {
      photoId,
      commentId,
      commenterId,
      commenterName,
      photoTitle,
    },
  });
}

export async function notifyCommentReplyReceived(
  userId: string,
  commentId: string,
  parentCommentId: string,
  commenterId: string,
  commenterName: string,
  commentText: string,
  photoId?: string | null,
) {
  await sendNotification({
    event: NotificationEvent.COMMENT_REPLY_RECEIVED,
    userId,
    title: "New Comment Reply",
    message: `${commenterName} replied to your comment: ${previewText(commentText)}`,
    type: NotificationType.COMMENT,
    data: {
      photoId,
      commentId,
      parentCommentId,
      commenterId,
      commenterName,
    },
  });
}

/**
 * Team Reward Granted Notification
 * Sent to each member when their team earns a match or period leaderboard payout
 */
export async function notifyTeamRewardGranted(
  userId: string,
  teamId: string,
  teamName: string,
  period: "MATCH" | "WEEKLY" | "MONTHLY" | "YEARLY",
  rank: number,
  coins: number
) {
  const periodLabel = period === "MATCH" ? "match" : period === "WEEKLY" ? "week" : period === "MONTHLY" ? "month" : "year";
  const message = period === "MATCH"
    ? `You finished #${rank} by votes on winning team "${teamName}" and earned ${coins} coins!`
    : `Your team "${teamName}" finished #${rank} this ${periodLabel} and earned you ${coins} coins!`;
  await sendNotification({
    event: NotificationEvent.TEAM_REWARD_GRANTED,
    userId,
    title: "Team Reward Earned! 🏆",
    message,
    type: NotificationType.DEFAULT,
    data: {
      teamId,
      teamName,
      period,
      rank,
      coins,
    },
  });
}

export const notificationOrchestrator = {
  sendNotification,
  notifyVoteReceived,
  notifyLevelUp,
  notifyTeamMatchStarted,
  notifyTeamMatchEnded,
  notifyTeamMatchSearchTimeout,
  notifyTeamInvitation,
  notifyAchievementUnlocked,
  notifyContestPhotoUploaded,
  notifyContestEnded,
  notifyContestPhotoRemoved,
  notifyCommentReceived,
  notifyCommentReplyReceived,
  notifyTeamRewardGranted,
};
