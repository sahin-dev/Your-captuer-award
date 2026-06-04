# Notification & Level System - Visual Workflow

## Complete System Flow Diagram

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         NOTIFICATION SYSTEM FLOW                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 1: USER VOTES ON TEAM MEMBER'S PHOTO                              │
└─────────────────────────────────────────────────────────────────────────────┘

    User A                  Photo Owner (Team Member)
        │                              │
        │──── POST /vote ─────────────>│
        │                              │
        │                      Vote Service
        │                              │
        │                    ┌─────────┴─────────┐
        │                    ↓                   ↓
        │            Create Vote         Increment Scores
        │            in Database          (member_score,
        │                │                team_score)
        │                │                   │
        │                └─────────┬─────────┘
        │                          ↓
        │                Notification Orchestrator
        │                          │
        │            ┌─────────────┼─────────────┐
        │            ↓             ↓             ↓
        │        Send Vote      Update         Broadcast
        │        Received        Level         Socket.IO
        │        Notification      │
        │            │             ↓
        │            │    Participant Level
        │            │    Service
        │            │             │
        │            │      ┌──────┴──────┐
        │            │      ↓             ↓
        │            │  Check Level   Update DB
        │            │  Threshold     if Changed
        │            │      │             │
        │            │      └──────┬──────┘
        │            │             ↓
        │            │     Level Up? (Yes)
        │            │             │
        │            │      ┌──────┴──────────┐
        │            │      ↓                 ↓
        │            │  Send Level Up    Update
        │            │  Notification   Participant
        │            │      │           Record
        │            │      │
        │            ├──────┴─────────────────┤
        │            │                        │
        │            ↓                        ↓
        │        Save to              Emit Real-time
        │        Database             Socket.IO
        │        (Notification        to Photo Owner
        │         table)              (via io.to(userId))
        │            │
        ✓<──────────┐│
        Notification │
        in UI        │
        (if online)  │
                     │
                Push to                    
                Backend                    


┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 2: TEAM MATCH STARTS (IMPLEMENTATION NEEDED)                      │
└─────────────────────────────────────────────────────────────────────────────┘

    Team A                Team B
    Members              Members
        │                    │
        └────────┬───────────┘
                 │
        Start Team Match
                 │
                 ↓
      Team Service Handler
                 │
         ┌──────┴──────┐
         ↓             ↓
    Create Match   → [NEEDS IMPLEMENTATION]
    Record            notifyTeamMatchStarted()
         │                    │
         │        ┌───────────┼───────────┐
         │        ↓           ↓           ↓
         │    Save to DB  Broadcast     Broadcast
         │               Team A         Team B
         │               Room           Room
         │               (team_A)       (team_B)
         │                   │              │
         ✓<──────────────────┴──────────────┘
    All team members receive
    "Match Started" notification
    in real-time + database


┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 3: TEAM MATCH ENDS (IMPLEMENTATION NEEDED)                        │
└─────────────────────────────────────────────────────────────────────────────┘

    Match Ends (Time/Score/etc)
         │
         ↓
    Team Service
    recordMatchResult()
         │
         ├─────────┬─────────┐
         ↓         ↓         ↓
    Update     Determine  [NEEDS IMPLEMENTATION]
    Match      Result     notifyTeamMatchEnded()
    Status    (WIN/LOSS)       │
      │         │              │
      │         └──────┬───────┘
      │                ↓
      │        Send Notification
      │        to Both Teams
      │                │
      │        ┌───────┴───────┐
      │        ↓               ↓
      │    Team A          Team B
      │    Members         Members
      │        │               │
      ✓<───────┴───────────────┘
    All members see result
    (WIN: Team A, LOSS: Team B)
    + Final scores
    in real-time


┌─────────────────────────────────────────────────────────────────────────────┐
│ ARCHITECTURE: NOTIFICATIONS FLOW PATH                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Service Action
    │
    ↓
notificationOrchestrator.notify*()
    │
    ├─── Database Path ───┐
    │                     ↓
    │            prisma.notification.create()
    │                     │
    │                     ↓
    │            Notification table
    │                     │
    │                     ↓
    │            GET /api/notifications
    │                     │
    │                     ↓
    │            UI shows in list
    │
    └─── Real-Time Path ──┐
                          ↓
                   getIO() returns io
                          │
                          ├─ For Direct: io.to(userId)
                          ├─ For Team: io.to('team_' + teamId)
                          └─ For All: io.emit()
                                 │
                                 ↓
                          Socket.IO Server
                                 │
                                 ├─ Connects to rooms
                                 ├─ Broadcasts event
                                 └─ Delivers in <100ms
                                       │
                                       ↓
                                Client receives
                                socket.on('notification')
                                       │
                                       ↓
                                      UI
                                   Toast/
                                  Popup


┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL PROGRESSION VISUALIZATION                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Votes on Photos
    │
    ├─ 0-10 votes   → NEW (🟦 Blue Badge)
    │
    ├─ 11-50 votes  → AMATEUR (🟪 Purple Badge)
    │                    ↑
    │            [LEVEL UP NOTIFICATION]
    │            Achievement Unlocked!
    │
    ├─ 51-150       → TALENTED (🟩 Green Badge)
    │   votes            ↑
    │            [LEVEL UP NOTIFICATION]
    │            Achievement Unlocked!
    │
    ├─ 151-300      → SUPREME (🟨 Yellow Badge)
    │   votes            ↑
    │            [LEVEL UP NOTIFICATION]
    │            Achievement Unlocked!
    │
    ├─ 301-500      → SUPERIOR (🟥 Red Badge)
    │   votes            ↑
    │            [LEVEL UP NOTIFICATION]
    │            Achievement Unlocked!
    │
    └─ 501+ votes   → TOP_NOTCH (⭐ Gold Star)
                           ↑
                    [LEVEL UP NOTIFICATION]
                    Achievement Unlocked!


Each level change:
  1. Detected automatically in participantLevelService
  2. Database updated
  3. notifyLevelUp() called
  4. Notification sent to participant
  5. Shows in profile + leaderboard


┌─────────────────────────────────────────────────────────────────────────────┐
│ TEAM MATCH SCORING VISUALIZATION                                            │
└─────────────────────────────────────────────────────────────────────────────┘

Team A                              Team B
┌──────────┐                     ┌──────────┐
│ Members  │                     │ Members  │
│ - John   │ ────> Photo ────>   │ - Sarah  │
│ - Alice  │                     │ - Mike   │
│ - Bob    │                     └──────────┘
└──────────┘
    │                                   │
    │ Upload Photos to Contest          │
    │                                   │
    ↓                                   ↓
  Photo A                            Photo B
  (3 photos)                         (2 photos)


Vote Received by Team A Member (Sarah votes for John's photo):

    Sarah votes            John's Photo
        │                      │
        └──────────┬───────────┘
                   ↓
            Vote Record Created
                   │
        ┌──────────┼──────────┐
        ↓          ↓          ↓
    John's      Team A      Team A
    Score +1    Score +1    Match
                             Score +1
                             (in DB)
        │          │          │
        └──────────┼──────────┘
                   ↓
        Display in Scoreboard:
        Team A: 15
        Team B: 12


┌─────────────────────────────────────────────────────────────────────────────┐
│ SOCKET.IO ROOM STRUCTURE                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Socket.IO Server
    │
    ├─ Direct User Rooms
    │  ├─ user_123 (for John)
    │  ├─ user_456 (for Sarah)
    │  └─ user_789 (for Alice)
    │
    ├─ Team Rooms
    │  ├─ team_A (John, Sarah, Alice)
    │  └─ team_B (Mike, Lisa)
    │
    └─ Global
       └─ broadcast (all users)


When notification sent:
  - VOTE_RECEIVED    → io.to(user_123)
  - TEAM_MATCH_STARTED → io.to('team_A') + io.to('team_B')
  - LEVEL_UP         → io.to(user_123)


┌─────────────────────────────────────────────────────────────────────────────┐
│ DATABASE PERSISTENCE FLOW                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Event Triggered (Vote Created)
    │
    ↓
notifyVoteReceived()
    │
    ├─ Create Notification Record
    │  │
    │  └─ INSERT INTO notifications
    │     (title, message, receiverId, data, type, etc)
    │
    └─ Get recent notifications
       │
       └─ GET /api/notifications/:userId
          (ordered by createdAt DESC)
               │
               └─ Return to UI


Notification Table Structure:
┌────────────────────────────────────────┐
│ notifications                          │
├────────────────────────────────────────┤
│ id              (UUID Primary Key)     │
│ title           (string)               │
│ message         (string)               │
│ receiverId      (UUID FK User)         │
│ type            (enum: DEFAULT, etc)   │
│ data            (JSON: event details)  │
│ isRead          (boolean)              │
│ isSent          (boolean)              │
│ createdAt       (DateTime)             │
└────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│ COMPLETE INTEGRATION TIMELINE                                               │
└─────────────────────────────────────────────────────────────────────────────┘

Now: ✅ DONE
├─ notificationOrchestrator.ts (created)
├─ participantLevel.service.ts (created)
├─ vote.service.ts (integrated)
├─ websocketSetUp.ts (export io)
├─ notification.service.ts (Socket.IO)
└─ Documentation (4 files)

Next 30 minutes: 🔄 IN PROGRESS
├─ team.service.ts (add 2 calls)
├─ contest.service.ts (add 1+ calls)
├─ achievement.service.ts (add 1 call)
└─ Basic testing

Final: ⏳ PENDING
├─ API endpoints (leaderboard, level-stats)
├─ Full E2E testing
├─ Performance tuning
└─ Production deployment


┌─────────────────────────────────────────────────────────────────────────────┐
│ QUICK REFERENCE: WHICH FUNCTION TO CALL WHERE                              │
└─────────────────────────────────────────────────────────────────────────────┘

When                            Call This Function
─────────────────────────────────────────────────────────────────────────────
User receives a vote      → notifyVoteReceived(participantId, userId, voterId, count)
Participant levels up     → notifyLevelUp(participantId, userId, newLevel, totalVotes)
Team match starts         → notifyTeamMatchStarted(teamId, matchId, rivalName, contestName)
Team match ends           → notifyTeamMatchEnded(teamId, matchId, result, score1, score2, prizes)
User gets achievement     → notifyAchievementUnlocked(userId, title, prize)
Member joins team         → notifyTeamMemberJoined(teamId, memberId, memberName)
Photo uploaded to contest → notifyContestPhotoUploaded(teamId, uploaderName, contestName, count)
Team invitation sent      → notifyTeamInvitation(userId, inviterId, teamName, invitationId)

All functions:
  1. Save to database automatically
  2. Broadcast via Socket.IO to correct recipients
  3. Return notification record
  4. Non-blocking (async/await safe)


┌─────────────────────────────────────────────────────────────────────────────┐
│ SUCCESS METRICS                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

After full implementation, verify:

✓ Notification Delivery
  └─ Vote notification appears in <100ms (real-time)
  └─ Match notifications sent to all team members
  └─ Achievement notifications show in database

✓ Level Progression
  └─ Level changes at correct vote thresholds
  └─ Level-up notifications triggered
  └─ Participant level visible in leaderboard

✓ Team Functionality
  └─ Match start broadcasts to both teams
  └─ Match scores updated in real-time
  └─ Members can see match progress via Socket.IO

✓ Data Integrity
  └─ All notifications persisted in database
  └─ No duplicate notifications
  └─ Correct recipient receiving notifications

✓ Performance
  └─ Notification delivery <100ms
  └─ Database writes <10ms
  └─ No blocking operations
  └─ Memory usage stable
```

---

## Integration Checklist Template

```
☐ Team Service - Match Started
  └─ Location: startTeamMatchWithAutoRival()
  └─ Action: Add notifyTeamMatchStarted() call
  └─ Time: ~5 minutes

☐ Team Service - Match Ended
  └─ Location: recordMatchResult()
  └─ Action: Add notifyTeamMatchEnded() call
  └─ Time: ~5 minutes

☐ Contest Service - Winner Announcement
  └─ Location: awardWinner()
  └─ Action: Add notifyAchievementUnlocked() call
  └─ Time: ~5 minutes

☐ Achievement Service
  └─ Location: addAchievement()
  └─ Action: Add notifyAchievementUnlocked() call
  └─ Time: ~5 minutes

☐ API Endpoints
  └─ Action: Create leaderboard and level-stats endpoints
  └─ Time: ~15 minutes

☐ Testing
  └─ Manual E2E testing of full flow
  └─ Verify real-time delivery
  └─ Check database persistence
  └─ Time: ~10 minutes

Total Time: ~45 minutes
```

---

**Document Purpose**: Visual understanding of system flow  
**Use When**: Need to understand how components connect  
**Reference**: Use alongside TEAM_SERVICE_INTEGRATION_GUIDE.md
