# Comprehensive Notification & Level Management System

## Overview
This document outlines the complete notification and participant level management system implemented across the application.

## 1. Architecture

### 1.1 Notification Flow
```
User Action (Vote, Match Start, etc.)
         ↓
   Service Logic
         ↓
Notification Orchestrator
    ↙              ↖
Database       Socket.IO (Real-time)
Notification   Broadcast
```

### 1.2 Level Progression System
```
Vote Received
         ↓
Vote Count Updated
         ↓
Check Level Milestones
         ↓
Level Up? → Send Notification & Update DB
```

## 2. Level Progression

### 2.1 Participant Levels
- **NEW**: 0-10 votes
- **AMATEUR**: 11-50 votes
- **TALENTED**: 51-150 votes
- **SUPREME**: 151-300 votes
- **SUPERIOR**: 301-500 votes
- **TOP_NOTCH**: 500+ votes

### 2.2 How Levels Work
1. Every vote received increments participant's vote count
2. System automatically calculates new level based on total votes
3. When level changes, level-up notification is sent
4. Participant level is stored in `ContestParticipant.level` field
5. Levels help identify top performers and provide ranking

## 3. Notification Events

### 3.1 Vote-Related Events

#### VOTE_RECEIVED
- **Trigger**: User receives a vote on their photo
- **Recipients**: Photo owner
- **Data**: Vote count, next milestone
- **Channels**: Database + Real-time Socket.IO

#### LEVEL_UP
- **Trigger**: Participant reaches new level threshold
- **Recipients**: Participant who leveled up
- **Data**: New level, total votes, achievement badge
- **Channels**: Database + Real-time Socket.IO

### 3.2 Team-Related Events

#### TEAM_MATCH_STARTED
- **Trigger**: Team match begins in a contest
- **Recipients**: All team members
- **Data**: Match ID, rival team name, contest name
- **Channels**: Database + Socket.IO Team Room
- **Delivery**: To `team_{teamId}` room

#### TEAM_MATCH_ENDED
- **Trigger**: Team match concludes with results
- **Recipients**: All team members
- **Data**: Result (WIN/LOSS/DRAW), scores, prizes
- **Channels**: Database + Socket.IO Team Room
- **Delivery**: To `team_{teamId}` room

#### TEAM_MEMBER_JOINED
- **Trigger**: New member joins the team
- **Recipients**: All team members
- **Data**: New member info
- **Channels**: Socket.IO Team Room

#### TEAM_INVITATION_RECEIVED
- **Trigger**: User receives team invitation
- **Recipients**: Invited user
- **Data**: Invitation ID, team name, inviter
- **Channels**: Database + Real-time Socket.IO

### 3.3 Contest-Related Events

#### CONTEST_PHOTO_UPLOADED
- **Trigger**: Team member uploads photo to contest
- **Recipients**: All team members
- **Data**: Uploader name, contest name, photo count
- **Channels**: Database + Socket.IO Team Room

#### CONTEST_WINNER_ANNOUNCED
- **Trigger**: Contest ends and winner is declared
- **Recipients**: Winner(s)
- **Data**: Achievement title, prize details
- **Channels**: Database + Real-time Socket.IO

#### ACHIEVEMENT_UNLOCKED
- **Trigger**: User wins achievement
- **Recipients**: User
- **Data**: Achievement name, prize details
- **Channels**: Database + Real-time Socket.IO

## 4. Implementation Details

### 4.1 Key Services

#### notificationOrchestrator.ts
- Centralized notification dispatcher
- Handles all event types
- Routes to database and Socket.IO
- Provides helper functions for each event type

**Location**: `src/app/modules/Notification/notificationOrchestrator.ts`

**Main Functions**:
- `sendNotification()` - Core notification sender
- `notifyVoteReceived()` - Vote notification
- `notifyLevelUp()` - Level progression notification
- `notifyTeamMatchStarted()` - Match start notification
- `notifyTeamMatchEnded()` - Match end notification
- `notifyTeamInvitation()` - Team invitation notification
- `notifyAchievementUnlocked()` - Achievement notification
- `notifyContestPhotoUploaded()` - Photo upload notification

#### participantLevel.service.ts
- Manages participant level progression
- Calculates levels based on vote counts
- Provides ranking and statistics

**Location**: `src/app/modules/Contest/participantLevel.service.ts`

**Main Functions**:
- `getLevelFromVotes()` - Get level for vote count
- `updateParticipantLevel()` - Update level in DB
- `checkLevelUpMilestone()` - Check if level changed
- `getParticipantLevelStats()` - Get level statistics
- `rankParticipantsByPerformance()` - Rank participants

#### notification.service.ts (Updated)
- Saves notifications to database
- Sends real-time notifications via Socket.IO
- Helper function to get team members

**Location**: `src/app/modules/Notification/notification.service.ts`

**New Functions**:
- `postNotificationWithPayload()` - Updated to use Socket.IO
- `getTeamMembers()` - Get all members of a team

### 4.2 Integration Points

#### Vote Service (`vote.service.ts`)
When a vote is added:
1. Create vote in database
2. Call `notifyVoteReceived()` to send notification
3. Update participant level via `participantLevelService.updateParticipantLevel()`
4. If level changed, call `notifyLevelUp()`
5. For team contests, update team match scores

```typescript
// Trigger notifications
await notificationOrchestrator.notifyVoteReceived(
    contestPhoto.participant.id,
    contestPhoto.participant.userId,
    userId,
    totalVotes
)

// Update level
const levelUpdate = await participantLevelService.updateParticipantLevel(
    contestPhoto.participant.id
)

// Notify if level up
if (levelUpdate.levelChanged) {
    await notificationOrchestrator.notifyLevelUp(...)
}
```

#### Team Service (TODO)
When match starts:
1. Create TeamMatch record
2. Call `notifyTeamMatchStarted()` for both teams
3. Send through `team_{teamId}` Socket.IO rooms

When match ends:
1. Update TeamMatch with results
2. Call `notifyTeamMatchEnded()` for both teams
3. Award winners
4. Send achievement notifications

#### Contest Service (TODO)
When winner declared:
1. Call `notifyContestWinnerAnnounced()`
2. Call `notifyAchievementUnlocked()`

## 5. Socket.IO Integration

### 5.1 Real-Time Channels
- **Direct User**: `io.to(userId)` - Direct user notification
- **Team Room**: `io.to('team_' + teamId)` - Team notifications
- **Broadcast**: `io.emit()` - Global notifications

### 5.2 Socket Events
```typescript
// Client subscribes to notifications
socket.on('notification', (data) => {
    // Handle notification
    console.log(data.title, data.message);
});

// Team-wide notifications
socket.on('team_notification', (data) => {
    // Handle team notification
});
```

### 5.3 Functions Available
```typescript
import { getIO } from '../helpers/websocketSetUp';

const io = getIO();
io.to(userId).emit('notification', data);  // Direct user
io.to(`team_${teamId}`).emit('notification', data);  // Team room
io.emit('notification', data);  // Broadcast to all
```

## 6. Database Schema Verification

### 6.1 ContestParticipant Table
✅ Has `level` field (YCLevel enum)
✅ Has `member_score` field (for team match tracking)
✅ Has `exposure_bonus` field (incremented on votes)

### 6.2 TeamMatch Table
✅ Has `team1_score` field (real-time team score)
✅ Has `team2_score` field (real-time team score)
✅ Has `status` field (ACTIVE/CLOSED)

### 6.3 Notification Table
✅ Has `title` field
✅ Has `message` field
✅ Has `data` field (JSON payload)
✅ Has `type` field (NotificationType enum)
✅ Has `isRead` and `isSent` fields

## 7. Testing Checklist

### 7.1 Vote & Level System
- [ ] User receives vote notification when photo is voted
- [ ] Participant level increases when vote count reaches threshold
- [ ] Level-up notification is sent
- [ ] Level is correctly displayed in contest rankings
- [ ] Previous level participants can't level down

### 7.2 Team Match Notifications
- [ ] All team members get "match started" notification
- [ ] All team members see match in Socket.IO room
- [ ] Match end notification shows correct scores
- [ ] Win/Loss/Draw result is correct
- [ ] Team scores are updated in real-time

### 7.3 Real-Time Features
- [ ] Notifications appear in real-time (not just in DB)
- [ ] Team members can chat in Socket.IO team room
- [ ] Members receive "member joined" and "member left" notifications
- [ ] Messages are persistent in database (Chat table)

## 8. Usage Examples

### 8.1 Send Custom Notification
```typescript
import { notificationOrchestrator } from './notificationOrchestrator';

await notificationOrchestrator.sendNotification({
    event: NotificationEvent.VOTE_RECEIVED,
    userId: 'user123',
    title: 'New Vote',
    message: 'Your photo received a vote!',
    type: NotificationType.DEFAULT,
    data: { voteCount: 5 }
});
```

### 8.2 Get Participant Level Stats
```typescript
import { participantLevelService } from './participantLevel.service';

const stats = await participantLevelService.getParticipantLevelStats(
    'participant123'
);
// Returns: currentLevel, totalVotes, nextLevel, votesUntilNextLevel, progress
```

### 8.3 Rank Participants
```typescript
const ranked = await participantLevelService.rankParticipantsByPerformance(
    'contest123'
);
// Returns array sorted by votes, with rank field
```

## 9. Remaining Implementations (TODO)

### 9.1 Team Service Updates
Update `startTeamMatchWithAutoRival()` and `recordMatchResult()` to call notification functions:
- [ ] Add `notifyTeamMatchStarted()` when match starts
- [ ] Add `notifyTeamMatchEnded()` when match ends with results

### 9.2 Contest Service Updates
Update `awardWinner()` to call notification functions:
- [ ] Add `notifyContestWinnerAnnounced()`
- [ ] Add `notifyAchievementUnlocked()`

### 9.3 Achievement Service Updates
- [ ] Integrate `notifyAchievementUnlocked()` when achievements are created

### 9.4 API Endpoints
Add new endpoints:
- [ ] GET `/notifications/me` - Get user notifications (already exists)
- [ ] GET `/participants/:id/level-stats` - Get participant level stats
- [ ] GET `/contests/:id/leaderboard` - Get ranked participants
- [ ] PATCH `/notifications/:id/read` - Mark notification as read

## 10. Configuration

### 10.1 Environment Variables
```
BASE_URL=http://10.10.20.44:5003
NOTIFICATION_TIMEOUT=5000  # milliseconds
LEVEL_UP_COOLDOWN=1000     # milliseconds
```

### 10.2 Notification Types
Located in prisma enums:
- DEFAULT
- ACHIEVEMENT
- INVITATION
- PAYMENT

### 10.3 Level Milestones
Configured in `participantLevel.service.ts`:
```typescript
const LEVEL_MILESTONES: Record<YCLevel, number> = {
  NEW: 0,
  AMATEUR: 11,
  TALENTED: 51,
  SUPREME: 151,
  SUPERIOR: 301,
  TOP_NOTCH: 501,
};
```

## 11. Performance Considerations

### 11.1 Database
- Notifications are indexed by `receiverId` for fast queries
- Consider pagination for notification lists (default: 10 per page)

### 11.2 Socket.IO
- Team rooms reduce broadcast overhead
- Real-time notifications don't block database writes
- Graceful degradation if Socket.IO unavailable

### 11.3 Level Calculation
- Only recalculate on vote received (not periodic)
- Cache level stats if frequently accessed

## 12. Troubleshooting

### Issue: Notifications not appearing in real-time
**Solution**: Check if Socket.IO connection is active
```typescript
const io = getIO();
if (!io) {
    console.warn("Socket.IO not initialized");
}
```

### Issue: Level not updating
**Solution**: Verify vote count is being incremented
```typescript
const totalVotes = await voteService.getVoteCount(photoId);
console.log('Total votes:', totalVotes);
```

### Issue: Team notifications not sent to all members
**Solution**: Verify team members are in the room
```typescript
const members = await notificationService.getTeamMembers(teamId);
console.log('Team members:', members);
```

---

**Status**: ✅ Core system implemented
**Last Updated**: June 4, 2026
**Version**: 1.0.0
