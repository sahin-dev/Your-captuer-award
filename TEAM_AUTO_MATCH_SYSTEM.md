# Team Auto-Match System - Implementation Guide

**Date**: May 9, 2026  
**Module**: Team Management  
**Feature**: Automatic Team Match Finding & Starting  
**Status**: ✅ Complete & Compiled

---

## Overview

The new **Auto-Match System** enables team admins to:
1. View available TEAM-mode contests
2. Select a contest
3. Automatically find a rival team with similar skill level
4. Start a match instantly

Previously, matches required manual selection of both teams. Now the system intelligently matches teams!

---

## New Functions Implemented

### 1. `getAvailableTeamContests(teamId: string)`

**Purpose**: Retrieve all active TEAM mode contests available for a team to participate in

**Parameters**:
- `teamId` - The team ID

**Returns**:
```typescript
{
  id: string
  title: string
  description: string
  banner: string
  startDate: Date
  endDate: Date
  maxUploads: number
  totalParticipants: number
  participantDetails: { userId: string }[]
}[]
```

**Logic Flow**:
1. Verify team exists
2. Fetch all contests where:
   - Status = ACTIVE
   - Mode = TEAM
3. Filter out contests where team already participates
4. Return with participant count and details
5. Sort by start date (ascending)

**Use Case**: 
- Admin loads contest selection dropdown
- See upcoming TEAM contests with current participation
- Choose which to enter

---

### 2. `startTeamMatchWithAutoRival(teamId: string, contestId: string)`

**Purpose**: Start a match by automatically finding a rival team with similar skill level

**Parameters**:
- `teamId` - The team initiating the match
- `contestId` - The selected contest ID

**Returns**:
```typescript
{
  id: string
  contestId: string
  team1Id: string
  team2Id: string
  status: 'ACTIVE' | 'CLOSED'
  team1: {
    id: string
    name: string
    skill_level: string
    badge: string
    creator: { id, firstName, lastName }
  }
  team2: { ...same structure }
  contest: {
    id: string
    title: string
    banner: string
  }
  endedAt: Date
}
```

**Logic Flow**:
```
1. Validate contest
   ├─ Must exist
   ├─ Must be ACTIVE status
   └─ Must be TEAM mode

2. Verify team exists

3. Check team participation
   └─ Team must be registered for contest

4. Check for existing active match
   └─ Team cannot have multiple active matches in same contest

5. Auto-find rival team
   └─ Call findRivalTeam()
       ├─ Find teams with same skill_level
       ├─ That participate in same contest
       ├─ That don't have active match
       └─ That haven't already matched in this contest

6. Create match
   ├─ Set status = ACTIVE
   ├─ Set endedAt = contest.endDate
   └─ Include full team & contest details

7. Update team.active_match_id for both teams

8. Send notifications to both team leaders
   └─ Include opponent team name and contest info
```

**Error Cases**:
- Contest not found or inactive → 404
- Not a team competition → 400
- Team doesn't exist → 404
- Team not registered for contest → 400
- Team already has active match → 409
- No rival team available → 404

**Use Case**:
- Admin selects contest from list
- System automatically finds equally skilled rival
- Match starts immediately
- Both team leaders notified
- Real-time match begins

---

## API Endpoints

### GET `/api/teams/:teamId/available-contests`

**Description**: Get list of available TEAM contests for a team

**Authorization**: Required (any authenticated user)

**Parameters**:
- `teamId` (path) - Team ID

**Response** (200 OK):
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Available team contests fetched successfully",
  "data": [
    {
      "id": "contest123",
      "title": "Summer Photography Championship",
      "description": "Team-based photo competition",
      "banner": "https://...",
      "startDate": "2026-05-15T00:00:00Z",
      "endDate": "2026-06-15T23:59:59Z",
      "maxUploads": 10,
      "totalParticipants": 45,
      "participantDetails": [...]
    }
  ]
}
```

**Errors**:
- Team not found → 404

---

### POST `/api/teams/:teamId/start-match-auto`

**Description**: Start a team match with automatic rival finding

**Authorization**: Required (any authenticated user)

**Parameters**:
- `teamId` (path) - Team ID
- `contestId` (body) - Contest ID to start match in

**Request Body**:
```json
{
  "contestId": "contest123"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Team match started successfully with auto-matched rival",
  "data": {
    "id": "match456",
    "contestId": "contest123",
    "team1Id": "team1",
    "team2Id": "team2",
    "status": "ACTIVE",
    "team1": {
      "id": "team1",
      "name": "Phoenix Squad",
      "skill_level": "ADVANCED",
      "badge": "https://...",
      "creator": {
        "id": "user123",
        "firstName": "John",
        "lastName": "Doe"
      }
    },
    "team2": {
      "id": "team2",
      "name": "Falcon Eyes",
      "skill_level": "ADVANCED",
      "badge": "https://...",
      "creator": {
        "id": "user456",
        "firstName": "Jane",
        "lastName": "Smith"
      }
    },
    "contest": {
      "id": "contest123",
      "title": "Summer Championship",
      "banner": "https://..."
    },
    "endedAt": "2026-06-15T23:59:59Z"
  }
}
```

**Errors**:
- Contest not found (404): Contest doesn't exist or inactive
- Not team mode (400): Contest is not for teams
- Team not found (404): Team doesn't exist
- Not registered (400): Team must register first
- Already has active match (409): Can't have multiple concurrent matches
- No rival available (404): No equally skilled rival found

---

## Database Schema Integration

### Updates Required

The `TeamMatch` model needs these fields (already exist in schema):
```prisma
model TeamMatch {
  id        String   @id @map("_id") @db.ObjectId
  contestId String   @db.ObjectId
  team1Id   String   @db.ObjectId
  team2Id   String   @db.ObjectId
  status    MatchStatus (ACTIVE|CLOSED)
  team1_score Int?
  team2_score Int?
  winner_id String?
  result    MatchResult?
  endedAt   DateTime
  
  // ... other fields
}
```

The `Team` model needs:
```prisma
model Team {
  // ... other fields
  active_match_id String? @db.ObjectId
  skill_level String? (BEGINNER|INTERMEDIATE|ADVANCED|EXPERT)
  
  // ... relations
}
```

---

## Workflow - Team Admin Perspective

### Step 1: View Available Contests
```
GET /api/teams/team123/available-contests

↓ Response

[
  {
    id: "contest1",
    title: "Summer Championship",
    startDate: "2026-05-15",
    totalParticipants: 45,
    ...
  }
]
```

### Step 2: Team Must Register for Contest First
```
Note: Team must have joined the contest through normal contest 
registration flow before starting a match.
This creates ContestParticipant records.
```

### Step 3: Start Auto-Match
```
POST /api/teams/team123/start-match-auto
{
  "contestId": "contest1"
}

↓ System:
  1. Validates contest is TEAM mode & ACTIVE
  2. Checks team is registered
  3. Finds rival with similar skill_level
  4. Creates match with status = ACTIVE
  5. Updates both teams' active_match_id
  6. Sends notifications

↓ Response: Match created with rival details
```

### Step 4: Match is Live
```
- Teams can now upload photos
- Voting begins automatically
- Match ends on contest.endDate
- Results calculated and recorded
```

---

## Technical Implementation Details

### Skill Level Matching

The system matches teams based on calculated skill level:

```typescript
// Skills mapped from team member levels
BEGINNER     (avg 1-1.5)
INTERMEDIATE (avg 1.5-2.5)
ADVANCED     (avg 2.5-3.5)
EXPERT       (avg 3.5+)

// Matching finds rivals with same calculated skill level
// ensuring fair competition
```

### Active Match Tracking

Each team can have at most 1 active match per contest:

```typescript
// Check prevents duplicate matches
const existingActiveMatch = await prisma.teamMatch.findFirst({
  where: {
    contestId,
    status: 'ACTIVE',
    OR: [
      { team1Id: teamId },
      { team2Id: teamId }
    ]
  }
})
```

### Notifications

Both team leaders receive notifications:
```
Title: "Match Started! 🎮"
Body: "Your team [Team A] is now competing against [Team B] 
       in [Contest Title]"
Type: DEFAULT
```

---

## Integration with Existing Functions

### `findRivalTeam(ownTeamId, contestId)`
Used internally by `startTeamMatchWithAutoRival` to find the best match.

### `calculateTeamSkillLevel(teamId)`
Calculates team skill based on member levels for matching algorithm.

### `recordMatchResult(matchId, team1Score, team2Score)`
Records results when match ends (unchanged - works with new matches).

### `getActiveMatch(teamId)`
Retrieves current active match for a team (unchanged - works with new matches).

---

## Error Handling

All errors follow standard API error format:

```typescript
{
  "success": false,
  "statusCode": <httpCode>,
  "message": "<error message>",
  "data": null
}
```

**Specific Error Codes**:
- 400: Bad request (missing fields, contest not team mode)
- 404: Not found (team, contest, rival)
- 409: Conflict (team already has active match)
- 401: Unauthorized (not authenticated)

---

## Testing Scenarios

### Test Case 1: Happy Path
```
1. Team admin gets available contests ✓
2. Team already registered for contest ✓
3. Rival team exists with similar skill ✓
4. Match created successfully ✓
5. Both teams notified ✓
```

### Test Case 2: No Rival Available
```
1. Admin tries to start match ✓
2. No team with same skill level found ✓
3. Returns 404 "No rival team found" ✓
```

### Test Case 3: Already Active Match
```
1. Team has active match in same contest ✓
2. Admin tries to start another ✓
3. Returns 409 Conflict ✓
```

### Test Case 4: Contest Not Registered
```
1. Team hasn't joined contest ✓
2. Tries to start match ✓
3. Returns 400 "Must register first" ✓
```

---

## Deployment Notes

### Database
- No schema changes required - all fields already exist
- Ensure `Team.skill_level` is calculated/set during team management

### Backend
- New functions added to `teamService`
- New controllers added to `teamController`
- New routes added to `teamRoutes`
- All code compiles without team-related errors

### Frontend
Two new API calls needed:

```typescript
// Get contests
const contests = await fetch('/api/teams/{teamId}/available-contests')

// Start match
const match = await fetch(`/api/teams/{teamId}/start-match-auto`, {
  method: 'POST',
  body: JSON.stringify({ contestId })
})
```

---

## Code Files Modified

✅ `src/app/modules/Team/team.service.ts`
- Added: `getAvailableTeamContests()`
- Added: `startTeamMatchWithAutoRival()`
- Enhanced: Service exports

✅ `src/app/modules/Team/team.controller.ts`
- Added: `getAvailableTeamContests` controller
- Added: `startTeamMatchWithAutoRival` controller
- Enhanced: Controller exports

✅ `src/app/modules/Team/team.route.ts`
- Added: GET `/:teamId/available-contests`
- Added: POST `/:teamId/start-match-auto`

---

## Compilation Status

✅ **Team Module**: All functions compile successfully
✅ **Backward Compatible**: Original `startTeamMatch()` still available
⚠️ **Pre-existing Errors**: 4 errors in Uploader and Seeder (unrelated)

---

## Future Enhancements

1. **Skill-based weighting**: More nuanced matching algorithm
2. **Region-based matching**: Match teams in same region if available
3. **Skill growth tracking**: Improve over time based on match results
4. **Elo rating system**: More sophisticated rating for fair matching
5. **Waiting queue**: Queue if no rival immediately available
6. **Time-based scheduling**: Schedule matches at specific times

---

## Summary

The **Auto-Match System** transforms how team matches are created:

**Before**:
```
Admin manually selects 2 teams
→ Creates match
```

**After**:
```
Admin selects contest
→ System finds ideal rival with same skill
→ Match starts automatically
→ Both teams notified
```

This creates a seamless, fair competition experience with minimal friction!

---

**Implementation Date**: May 9, 2026  
**Developer**: GitHub Copilot  
**Status**: ✅ Ready for Testing
