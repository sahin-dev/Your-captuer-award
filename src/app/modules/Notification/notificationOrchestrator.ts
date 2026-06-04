import { NotificationType } from "../../../prismaClient";
import { notificationService } from "./notification.service";
import { getIO } from "../../../helpers/websocketSetUp";

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
  TEAM_MEMBER_JOINED = "TEAM_MEMBER_JOINED",
  TEAM_INVITATION_RECEIVED = "TEAM_INVITATION_RECEIVED",
  TEAM_INVITATION_ACCEPTED = "TEAM_INVITATION_ACCEPTED",
  
  // Contest-related
  CONTEST_PHOTO_UPLOADED = "CONTEST_PHOTO_UPLOADED",
  CONTEST_WINNER_ANNOUNCED = "CONTEST_WINNER_ANNOUNCED",
  
  // Achievement-related
  ACHIEVEMENT_UNLOCKED = "ACHIEVEMENT_UNLOCKED",
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

    console.log(
      `[Notification] ${payload.event} sent to user ${payload.userId}`
    );
  } catch (error) {
    console.error(`[Notification Error] Failed to send notification:`, error);
  }
}

/**
 * Send real-time notification through Socket.IO
 */
function sendSocketNotification(payload: NotificationPayload) {
  try {
    const io = getIO();
    if (!io) {
      console.warn("[Socket.IO] Instance not available for real-time notification");
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
    console.error("[Socket.IO Error] Failed to send real-time notification:", error);
  }
}

/**
 * Vote Received Notification
 * Triggered when a user receives a vote on their photo
 */
export async function notifyVoteReceived(
  participantId: string,
  userId: string,
  photoUploader: string,
  totalVotes: number
) {
  await sendNotification({
    event: NotificationEvent.VOTE_RECEIVED,
    userId,
    title: "You Received a Vote!",
    message: `Your photo received a vote! Total votes: ${totalVotes}`,
    type: NotificationType.DEFAULT,
    data: {
      participantId,
      totalVotes,
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
  contestName: string
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
        matchId,
        rivalTeamName,
        contestName,
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
  prizes?: Record<string, any>
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
      message: resultMessage,
      type: NotificationType.VOTE,
      teamId,
      data: {
        matchId,
        result,
        teamScore,
        rivalScore,
        prizes,
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
        contestName,
        photoCount,
      },
    });
  }
}

export const notificationOrchestrator = {
  sendNotification,
  notifyVoteReceived,
  notifyLevelUp,
  notifyTeamMatchStarted,
  notifyTeamMatchEnded,
  notifyTeamInvitation,
  notifyAchievementUnlocked,
  notifyContestPhotoUploaded,
};
