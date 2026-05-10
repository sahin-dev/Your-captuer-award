# Team Auto-Match System - Quick API Reference

## Two New Endpoints

### 1. Get Available Contests
```
GET /api/teams/:teamId/available-contests
Authorization: Required
```

**cURL**:
```bash
curl -X GET http://localhost:3000/api/teams/team123/available-contests \
  -H "Authorization: Bearer <token>"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "contest1",
      "title": "Summer Championship",
      "description": "...",
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

---

### 2. Start Match with Auto-Rival
```
POST /api/teams/:teamId/start-match-auto
Authorization: Required
Content-Type: application/json
```

**cURL**:
```bash
curl -X POST http://localhost:3000/api/teams/team123/start-match-auto \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"contestId": "contest1"}'
```

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

---

## Error Responses

### 404 Not Found - Contest doesn't exist
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Contest not found"
}
```

### 400 Bad Request - Not team mode
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Contest is not a team competition"
}
```

### 400 Bad Request - Team not registered
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Team must register for contest first"
}
```

### 409 Conflict - Active match exists
```json
{
  "success": false,
  "statusCode": 409,
  "message": "Team already has an active match in this contest"
}
```

### 404 Not Found - No rival available
```json
{
  "success": false,
  "statusCode": 404,
  "message": "No rival team with similar skill level available"
}
```

---

## Postman Collection

```json
{
  "info": {
    "name": "Team Auto-Match",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Available Contests",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "url": {
          "raw": "{{base_url}}/api/teams/{{teamId}}/available-contests",
          "host": ["{{base_url}}"],
          "path": ["api", "teams", "{{teamId}}", "available-contests"]
        }
      }
    },
    {
      "name": "Start Match Auto",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"contestId\": \"{{contestId}}\"}"
        },
        "url": {
          "raw": "{{base_url}}/api/teams/{{teamId}}/start-match-auto",
          "host": ["{{base_url}}"],
          "path": ["api", "teams", "{{teamId}}", "start-match-auto"]
        }
      }
    }
  ]
}
```

---

## Integration Flow

```
┌─────────────────────────────────────┐
│ Team Admin Opens Match Page         │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ GET /api/teams/:teamId/              │
│     available-contests              │
│                                     │
│ ▼ Response: List of contests        │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Admin Selects a Contest             │
│ (e.g., "Summer Championship")       │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ POST /api/teams/:teamId/             │
│      start-match-auto               │
│ { contestId: "contest1" }           │
│                                     │
│ System:                             │
│ 1. Validates contest                │
│ 2. Checks team registered           │
│ 3. Finds rival (same skill)         │
│ 4. Creates match                    │
│ 5. Sends notifications              │
│                                     │
│ ▼ Response: Match started!          │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Both Teams Notified                 │
│ Match is ACTIVE                     │
│ Can begin uploading photos          │
└─────────────────────────────────────┘
```

---

## JavaScript/TypeScript Usage

```typescript
// Get available contests
async function getAvailableContests(teamId: string) {
  const response = await fetch(
    `/api/teams/${teamId}/available-contests`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    }
  )
  
  const data = await response.json()
  return data.data // Array of contests
}

// Start auto-match
async function startAutoMatch(teamId: string, contestId: string) {
  const response = await fetch(
    `/api/teams/${teamId}/start-match-auto`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contestId })
    }
  )
  
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message)
  }
  
  return data.data // Match object with rival details
}

// Usage
const contests = await getAvailableContests('team123')
const selectedContest = contests[0]
const match = await startAutoMatch('team123', selectedContest.id)

console.log(`Match started!`)
console.log(`Your team: ${match.team1.name}`)
console.log(`Rival: ${match.team2.name}`)
console.log(`Skill: ${match.team1.skill_level}`)
```

---

## Related Endpoints (Existing)

### Continue Match Flow
```
GET /api/teams/:teamId/active-match

Response: Current active match details
```

### Record Match Result
```
POST /api/match/record-result
Body: { matchId, team1Score, team2Score }

Response: Match result recorded
```

### View Team History
```
GET /api/teams/:teamId/history

Response: All past matches and results
```

---

## Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Continue |
| 201 | Created | Match started |
| 400 | Bad Request | Fix request body/team state |
| 401 | Unauthorized | Add auth token |
| 404 | Not Found | Check IDs exist |
| 409 | Conflict | Team has active match |
| 500 | Server Error | Try again |

---

## Notes

- Team must be registered for contest before starting match
- Rival finding is based on team skill level
- Each team can have max 1 active match per contest
- Match ends automatically when contest ends
- Notifications sent to both team leaders

---

**Last Updated**: May 9, 2026
