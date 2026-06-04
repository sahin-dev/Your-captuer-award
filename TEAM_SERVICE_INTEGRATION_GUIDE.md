# Team Service Integration Guide

## Quick Integration Reference

This guide shows exactly where and how to add notification calls to the Team service.

## 1. startTeamMatchWithAutoRival() Integration

### Location
`src/app/modules/Team/team.service.ts` → `startTeamMatchWithAutoRival()` function

### What it does
Creates a new team match between two teams competing in a contest.

### Add Notifications Here

Find this line (after creating TeamMatch):
```typescript
const newMatch = await prisma.teamMatch.create({
    data: {
        contestId,
        team1Id: teamId,
        team2Id: rivalTeamId,
        status: 'ACTIVE'
    }
})
```

**After creating the match, add:**
```typescript
// Notify team 1 that match started
await notificationOrchestrator.notifyTeamMatchStarted(
    teamId,
    newMatch.id,
    rivalTeamInfo.teamName,
    contestInfo.contestName
);

// Notify team 2 that match started
await notificationOrchestrator.notifyTeamMatchStarted(
    rivalTeamId,
    newMatch.id,
    teamInfo.teamName,
    contestInfo.contestName
);
```

### Import Required
```typescript
import { notificationOrchestrator } from '../Notification/notificationOrchestrator';
```

### Expected Result
- ✅ Both teams get "match started" notification
- ✅ Notification shows rival team name and contest name
- ✅ Notification appears in real-time + database
- ✅ Socket.IO sends to `team_${teamId}` rooms

---

## 2. recordMatchResult() Integration

### Location
`src/app/modules/Team/team.service.ts` → `recordMatchResult()` function

### What it does
Records the final result of a team match (WIN/LOSS/DRAW) and updates scores.

### Add Notifications Here

Find this line (after determining match result):
```typescript
// Update match with result
await prisma.teamMatch.update({
    where: { id: matchId },
    data: {
        status: 'CLOSED',
        result: matchResult, // WIN, LOSS, or DRAW
        team1_score: finalScore1,
        team2_score: finalScore2
    }
})
```

**After updating match result, add:**
```typescript
// Get teams info for notification
const match = await prisma.teamMatch.findUnique({
    where: { id: matchId },
    include: {
        team1: { select: { teamName: true } },
        team2: { select: { teamName: true } },
        contest: { select: { contestName: true } }
    }
});

// Notify team 1 of match end
await notificationOrchestrator.notifyTeamMatchEnded(
    match.team1Id,
    matchId,
    matchResult === 'TEAM_1_WIN' ? 'WIN' : matchResult === 'TEAM_1_LOSS' ? 'LOSS' : 'DRAW',
    match.team1_score,
    match.team2_score,
    {
        rivalTeam: match.team2.teamName,
        contest: match.contest.contestName,
        prizes: prizeDetails // if applicable
    }
);

// Notify team 2 of match end
await notificationOrchestrator.notifyTeamMatchEnded(
    match.team2Id,
    matchId,
    matchResult === 'TEAM_2_WIN' ? 'WIN' : matchResult === 'TEAM_2_LOSS' ? 'LOSS' : 'DRAW',
    match.team2_score,
    match.team1_score,
    {
        rivalTeam: match.team1.teamName,
        contest: match.contest.contestName,
        prizes: prizeDetails // if applicable
    }
);
```

### Import Required
```typescript
import { notificationOrchestrator } from '../Notification/notificationOrchestrator';
```

### Expected Result
- ✅ Both teams get "match ended" notification
- ✅ Notification shows WIN/LOSS/DRAW result
- ✅ Notification shows final scores
- ✅ Notification appears in real-time + database
- ✅ Socket.IO sends to both team rooms

---

## 3. addTeamMember() Integration (Optional)

### Location
`src/app/modules/Team/team.service.ts` → `addTeamMember()` function

### What it does
Adds a new member to a team.

### Add Notifications Here

After successfully adding member:
```typescript
// Send notification to all team members
await notificationOrchestrator.notifyTeamMemberJoined(
    teamId,
    newMemberId,
    memberName
);
```

### Expected Result
- ✅ All team members get "member joined" notification
- ✅ Shows new member's name
- ✅ Appears in Socket.IO team room

---

## 4. Complete Implementation Order

### Phase 1: Team Match Notifications (REQUIRED)
1. [ ] Add `notifyTeamMatchStarted()` in `startTeamMatchWithAutoRival()`
2. [ ] Add `notifyTeamMatchEnded()` in `recordMatchResult()`
3. [ ] Import `notificationOrchestrator` at top of file
4. [ ] Test with actual team match scenario

### Phase 2: Achievement Notifications (RECOMMENDED)
1. [ ] Update `contest.service.ts` to add achievement notifications
2. [ ] Update `achievement.service.ts` to notify on achievement creation
3. [ ] Test with contest winner scenario

### Phase 3: API Endpoints (NICE TO HAVE)
1. [ ] Create `/api/participants/:id/level-stats` endpoint
2. [ ] Create `/api/contests/:id/leaderboard` endpoint
3. [ ] Add pagination and filters

---

## 5. Code Templates Ready to Use

### Template 1: Import at Top of File
```typescript
import { notificationOrchestrator } from '../Notification/notificationOrchestrator';
import { participantLevelService } from '../Contest/participantLevel.service';
```

### Template 2: Send Match Started Notification
```typescript
await notificationOrchestrator.notifyTeamMatchStarted(
    teamId,
    matchId,
    rivalTeamName,
    contestName
);
```

### Template 3: Send Match Ended Notification
```typescript
await notificationOrchestrator.notifyTeamMatchEnded(
    teamId,
    matchId,
    'WIN' | 'LOSS' | 'DRAW',
    teamScore,
    rivalScore,
    { prizes: 'details' }
);
```

### Template 4: Get Team Info for Notification
```typescript
const teamInfo = await prisma.team.findUnique({
    where: { id: teamId },
    select: { teamName: true }
});

const contestInfo = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { contestName: true }
});
```

---

## 6. Testing After Implementation

### Test Case 1: Match Started Notification
```
1. Create two teams
2. Start a team match
3. Check both teams get notification
4. Verify Socket.IO room broadcasts
5. Verify database stores notification
```

### Test Case 2: Match Ended Notification
```
1. Have active team match
2. End match with result
3. Check both teams get end notification
4. Verify scores are correct
5. Verify result (WIN/LOSS/DRAW) is correct
```

### Test Case 3: Real-time Delivery
```
1. Start match while team member is online
2. Verify notification appears in real-time (< 100ms)
3. Check browser console for Socket.IO events
4. Verify member receives event before DB is queried
```

---

## 7. Common Issues & Solutions

### Issue: Notification not sent
**Solution**: Verify notificationOrchestrator import and call syntax

### Issue: Wrong team gets notification
**Solution**: Ensure team IDs passed are correct (team1Id vs team2Id)

### Issue: Socket.IO event not received
**Solution**: Check team room: should be `team_${teamId}`

### Issue: Match scores not updated
**Solution**: Ensure TeamMatch update happens before notification

---

## 8. Verification Commands

Once implemented, verify with:

```bash
# Check imports are correct
grep -r "notificationOrchestrator" src/app/modules/Team/

# Find all match creation locations
grep -r "teamMatch.create" src/

# Find all match ending locations
grep -r "status: 'CLOSED'" src/

# Verify notifications being sent
grep -r "notifyTeamMatch" src/
```

---

## 9. Performance Notes

- Notifications are sent asynchronously (don't wait for them)
- Each team gets separate notification call (2 notifications per match result)
- Database writes happen in parallel with Socket.IO broadcasts
- No performance impact on match creation/ending

---

**Estimated Implementation Time**: 15-20 minutes total
- Reading and understanding: 5 minutes
- Adding imports: 2 minutes
- Adding notification calls: 8 minutes
- Testing: 5 minutes

**Difficulty Level**: 🟢 Easy (copy-paste ready, no complex logic)

---

## Quick Links

- [Notification Orchestrator API](../NOTIFICATION_SYSTEM_GUIDE.md#notification-events)
- [Implementation Status](../NOTIFICATION_IMPLEMENTATION_STATUS.md)
- [Full Notification Guide](../NOTIFICATION_SYSTEM_GUIDE.md)
