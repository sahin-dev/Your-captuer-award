# Team Module - Quick API Reference

## Base URL
```
POST /api/teams/request/send/:teamId
GET  /api/teams/request/pending/:teamId
POST /api/teams/request/approve/:joinRequestId
POST /api/teams/request/reject/:joinRequestId
GET  /api/teams/leaderboard/all
GET  /api/teams/history/:teamId
POST /api/teams/match/record-result
GET  /api/teams/active-match/:teamId
```

---

## 1. Send Join Request

**Endpoint:** `POST /api/teams/request/send/:teamId`  
**Auth:** Required (User)  
**Status Code:** 201

**Response:**
```json
{
  "success": true,
  "message": "Join request sent successfully",
  "data": {
    "id": "req-id",
    "teamId": "team-id",
    "requesterId": "user-id",
    "status": "PENDING",
    "requester": {
      "id": "user-id",
      "firstName": "John",
      "lastName": "Doe",
      "avatar": "url"
    },
    "team": {
      "id": "team-id",
      "name": "Team Name"
    },
    "createdAt": "2026-05-09T10:00:00Z"
  }
}
```

---

## 2. Get Pending Join Requests

**Endpoint:** `GET /api/teams/request/pending/:teamId`  
**Auth:** Required (User - Team Leader)  
**Status Code:** 200

**Response:**
```json
{
  "success": true,
  "message": "Join requests fetched successfully",
  "data": [
    {
      "id": "req-id",
      "status": "PENDING",
      "requester": {
        "id": "user-id",
        "firstName": "Alice",
        "lastName": "Smith",
        "avatar": "url",
        "level": "LEVEL_2"
      },
      "createdAt": "2026-05-09T09:00:00Z"
    }
  ]
}
```

---

## 3. Approve Join Request

**Endpoint:** `POST /api/teams/request/approve/:joinRequestId`  
**Auth:** Required (User - Team Leader)  
**Status Code:** 200

**Response:**
```json
{
  "success": true,
  "message": "Join request approved successfully",
  "data": {
    "id": "req-id",
    "status": "APPROVED",
    "updatedAt": "2026-05-09T10:05:00Z"
  }
}
```

---

## 4. Reject Join Request

**Endpoint:** `POST /api/teams/request/reject/:joinRequestId`  
**Auth:** Required (User - Team Leader)  
**Status Code:** 200

**Response:**
```json
{
  "success": true,
  "message": "Join request rejected successfully",
  "data": {
    "id": "req-id",
    "status": "REJECTED",
    "updatedAt": "2026-05-09T10:05:00Z"
  }
}
```

---

## 5. Get Team Leaderboard

**Endpoint:** `GET /api/teams/leaderboard/all?contestId=contest-123`  
**Auth:** Required (User)  
**Query Params:** `contestId` (optional)  
**Status Code:** 200

**Response:**
```json
{
  "success": true,
  "message": "Team leaderboard fetched successfully",
  "data": [
    {
      "id": "team-1",
      "name": "Elite Squad",
      "level": "EXPERT",
      "skill_level": "EXPERT",
      "leaderboard_rank": 1,
      "total_matches": 15,
      "win": 12,
      "lost": 2,
      "draw": 1,
      "score": 487,
      "current_rank": 1,
      "creator": {
        "id": "leader-id",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  ]
}
```

---

## 6. Get Team Match History

**Endpoint:** `GET /api/teams/history/:teamId`  
**Auth:** Required (User)  
**Status Code:** 200

**Response:**
```json
{
  "success": true,
  "message": "Team match history fetched successfully",
  "data": [
    {
      "id": "history-1",
      "teamId": "team-id",
      "matchId": "match-789",
      "opponent_team_id": "opponent-team-id",
      "team_score": 45,
      "opponent_score": 38,
      "result": "WIN",
      "match_date": "2026-05-09T08:00:00Z",
      "contest_id": "contest-123",
      "team": {
        "id": "team-id",
        "name": "Elite Squad"
      }
    }
  ]
}
```

---

## 7. Record Match Result

**Endpoint:** `POST /api/teams/match/record-result`  
**Auth:** Required (Admin)  
**Status Code:** 200

**Request Body:**
```json
{
  "matchId": "match-789",
  "team1Score": 45,
  "team2Score": 38
}
```

**Response:**
```json
{
  "success": true,
  "message": "Match result recorded successfully",
  "data": {
    "id": "match-789",
    "team1_score": 45,
    "team2_score": 38,
    "winner_id": "team1-id",
    "result": "TEAM1_WIN",
    "status": "CLOSED",
    "endedAt": "2026-05-09T10:15:00Z"
  }
}
```

---

## 8. Get Active Match

**Endpoint:** `GET /api/teams/active-match/:teamId`  
**Auth:** Required (User)  
**Status Code:** 200

**Response (with active match):**
```json
{
  "success": true,
  "message": "Active match fetched successfully",
  "data": {
    "id": "match-789",
    "team1Id": "team-1",
    "team2Id": "team-2",
    "team1_score": 0,
    "team2_score": 0,
    "winner_id": null,
    "result": "PENDING",
    "status": "ACTIVE",
    "startedAt": "2026-05-09T10:00:00Z",
    "endedAt": null,
    "team1": {
      "id": "team-1",
      "name": "Elite Squad"
    },
    "team2": {
      "id": "team-2",
      "name": "Rising Stars"
    }
  }
}
```

**Response (no active match):**
```json
{
  "success": true,
  "message": "Active match fetched successfully",
  "data": null
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid request parameters"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "statusCode": 403,
  "message": "Only team leader can view join requests"
}
```

### 404 Not Found
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Team not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "statusCode": 409,
  "message": "You already have a pending request for this team"
}
```

---

## Status Enums

### JoinRequestStatus
- `PENDING` - Awaiting approval
- `APPROVED` - User added to team
- `REJECTED` - User request denied

### MatchResult
- `PENDING` - Match in progress
- `TEAM1_WIN` - Team 1 won
- `TEAM2_WIN` - Team 2 won
- `DRAW` - Tied match

### HistoryResult
- `WIN` - This team won
- `LOSS` - This team lost
- `DRAW` - This team drew

### SkillLevel
- `BEGINNER` - Average user level 1-1.5
- `INTERMEDIATE` - Average user level 1.5-2.5
- `ADVANCED` - Average user level 2.5-3.5
- `EXPERT` - Average user level 3.5+

---

## Usage Examples

### Example 1: User Sends Join Request
```bash
curl -X POST "http://localhost:5000/api/teams/request/send/team-abc123" \
  -H "Authorization: Bearer user-token-xyz" \
  -H "Content-Type: application/json"
```

### Example 2: Team Leader Views Pending Requests
```bash
curl -X GET "http://localhost:5000/api/teams/request/pending/team-abc123" \
  -H "Authorization: Bearer leader-token-xyz"
```

### Example 3: Team Leader Approves Request
```bash
curl -X POST "http://localhost:5000/api/teams/request/approve/req-12345" \
  -H "Authorization: Bearer leader-token-xyz"
```

### Example 4: Admin Records Match Result
```bash
curl -X POST "http://localhost:5000/api/teams/match/record-result" \
  -H "Authorization: Bearer admin-token-xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": "match-789",
    "team1Score": 45,
    "team2Score": 38
  }'
```

### Example 5: View Team Leaderboard
```bash
curl -X GET "http://localhost:5000/api/teams/leaderboard/all?contestId=contest-123" \
  -H "Authorization: Bearer user-token-xyz"
```

