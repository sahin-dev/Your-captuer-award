# Team Module Database Schema

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                            USER                                  │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                           │
│ fullName, email, avatar, level                                   │
│                                                                   │
│ Relations:                                                        │
│ • createdTeam → Team[] (one creator → many teams)               │
│ • joinedTeam → TeamMember? (one member per team max)            │
│ • sentJoinRequests → TeamJoinRequest[] (NEW)                    │
│ • votes, likes, comments, etc.                                  │
└────────────────┬──────────────────────────┬──────────────────────┘
                 │ creatorId                 │ requesterId
                 │                           │
         ┌───────▼────────────┐     ┌───────▼──────────────┐
         │      TEAM          │     │  TEAM_JOIN_REQUEST   │ (NEW)
         ├────────────────────┤     ├──────────────────────┤
         │ id (PK)            │     │ id (PK)              │
         │ name, level        │     │ teamId (FK)          │
         │ badge, score       │     │ requesterId (FK)     │
         │ win, lost, draw    │     │ status: PENDING|     │
         │ skill_level (NEW)  │     │         APPROVED|    │
         │ active_match_id(NEW)    │         REJECTED     │
         │ leaderboard_rank(NEW)   │ createdAt, updatedAt │
         │ total_matches(NEW) │     └──────────────────────┘
         │ member_slots(NEW)  │
         │ creatorId (FK)     │
         └────────┬───────────┘
                  │ teamId
         ┌────────▼──────────────┐
         │    TEAM_MEMBER        │
         ├───────────────────────┤
         │ id (PK)               │
         │ teamId (FK)           │
         │ memberId (FK) → User  │
         │ status: ACTIVE|       │
         │         REMOVED|      │
         │         BLOCKED       │
         │ level: NEW|EXPERT|    │
         │        MASTER|LEADER  │
         └───────────────────────┘

         ┌────────────────────────────────────────┐
         │        TEAM_MATCH                      │
         ├────────────────────────────────────────┤
         │ id (PK)                                │
         │ contestId (FK) → Contest               │
         │ team1Id (FK) → Team (via "team1")      │
         │ team2Id (FK) → Team (via "team2")      │
         │ team1_score (NEW)                      │
         │ team2_score (NEW)                      │
         │ winner_id (NEW)                        │
         │ result: PENDING|TEAM1_WIN|             │
         │         TEAM2_WIN|DRAW (NEW)           │
         │ status: ACTIVE|CLOSED                  │
         │ startedAt, endedAt                     │
         └──────────┬─────────────────────────────┘
                    │ matchId
         ┌──────────▼────────────────────┐
         │  TEAM_MATCH_HISTORY (NEW)     │
         ├───────────────────────────────┤
         │ id (PK)                       │
         │ teamId (FK) → Team            │
         │ matchId (FK) → TeamMatch      │
         │ opponent_team_id              │
         │ team_score, opponent_score    │
         │ result: WIN|LOSS|DRAW         │
         │ match_date, contest_id        │
         │ createdAt, updatedAt          │
         └───────────────────────────────┘

         ┌────────────────────────────────────────┐
         │       TEAM_PARTICIPATION               │
         ├────────────────────────────────────────┤
         │ id (PK)                                │
         │ teamId (FK) → Team                     │
         │ contestId (FK) → Contest               │
         │ UNIQUE: [teamId, contestId]            │
         └────────────────────────────────────────┘
```

## Data Flow Diagrams

### Join Request Flow
```
1. User wants to join team
   │
   ├─→ sendJoinRequest(userId, teamId)
   │   ├─→ Check team exists
   │   ├─→ Check user not already member
   │   ├─→ Check no pending request exists
   │   ├─→ Create TeamJoinRequest (PENDING)
   │   └─→ Notify team leader
   │
   └─→ TeamJoinRequest.status = PENDING
       │
       ├─→ Team Leader sees in getJoinRequests()
       │
       ├─→ Option A: approveJoinRequest()
       │   ├─→ Create TeamMember
       │   ├─→ Update TeamJoinRequest → APPROVED
       │   ├─→ Increment team.member_count
       │   └─→ Notify requester (APPROVED)
       │
       └─→ Option B: rejectJoinRequest()
           └─→ Update TeamJoinRequest → REJECTED
               └─→ Notify requester (REJECTED)
```

### Match Flow
```
1. startTeamMatch(team1Id, team2Id, contestId)
   │
   ├─→ Create TeamMatch (ACTIVE)
   ├─→ Set team1.active_match_id
   └─→ Set team2.active_match_id
       │
       └─→ Match in progress...
           │
           └─→ recordMatchResult(matchId, team1Score, team2Score)
               ├─→ Determine winner
               ├─→ Update TeamMatch
               │  ├─→ team1_score = team1Score
               │  ├─→ team2_score = team2Score
               │  ├─→ winner_id = calculated
               │  ├─→ result = WIN|DRAW
               │  └─→ status = CLOSED
               │
               ├─→ Update Team Statistics
               │  ├─→ Increment win/lost/draw
               │  ├─→ Add score (winners only)
               │  └─→ Increment total_matches
               │
               ├─→ Create TeamMatchHistory (×2)
               │  ├─→ One for Team 1 (WIN/LOSS/DRAW)
               │  └─→ One for Team 2 (LOSS/WIN/DRAW)
               │
               └─→ Clear active_match_id (both teams)
```

### Skill Level Calculation
```
Team Skill Level Calculation:
├─→ Get all active team members
├─→ For each member:
│  ├─→ Get user.level (e.g., LEVEL_1, LEVEL_2, etc.)
│  ├─→ Map to numeric weight (1-5)
│  └─→ Add to total weight
├─→ Calculate average = total / member count
├─→ Classification:
│  ├─→ avg ≤ 1.5   → BEGINNER
│  ├─→ avg ≤ 2.5   → INTERMEDIATE
│  ├─→ avg ≤ 3.5   → ADVANCED
│  └─→ avg > 3.5   → EXPERT
└─→ Update team.skill_level
```

### Auto-Matching Flow
```
findRivalTeam(ownTeamId, contestId):
├─→ Get own team with skill_level
├─→ Query rival teams with criteria:
│  ├─→ SAME skill_level as own
│  ├─→ Participating in same contest
│  ├─→ NO active match (active_match_id = null)
│  ├─→ NO existing match in this contest
│  └─→ NOT own team
└─→ Return first rival found or null
```

## Data Models

### Team Model Fields
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| id | String | auto() | Primary key |
| name | String | - | Team display name |
| level | String | - | Team requirement level |
| language | String | - | Primary language |
| country | String | - | Team location |
| description | String | - | Team bio |
| accessibility | enum | PUBLIC | Join visibility |
| member_count | Int | 0 | Current members |
| member_slots | Int | 10 | Max capacity (NEW) |
| score | Int | 0 | Cumulative points |
| win | Int | 0 | Match wins |
| lost | Int | 0 | Match losses |
| draw | Int | 0 | Match draws |
| skill_level | enum | INTERMEDIATE | Classification (NEW) |
| active_match_id | String? | null | Current match (NEW) |
| leaderboard_rank | Int? | null | Position (NEW) |
| total_matches | Int | 0 | Games played (NEW) |
| creatorId | String | - | Foreign key → User |

### TeamJoinRequest Model Fields (NEW)
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| id | String | auto() | Primary key |
| teamId | String | - | Foreign key → Team |
| requesterId | String | - | Foreign key → User |
| status | enum | PENDING | Request state |
| createdAt | DateTime | now() | Creation time |
| updatedAt | DateTime | - | Update time |

### TeamMatchHistory Model Fields (NEW)
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| id | String | auto() | Primary key |
| teamId | String | - | Foreign key → Team |
| matchId | String | - | Foreign key → TeamMatch (UNIQUE) |
| opponent_team_id | String | - | Rival team ID |
| team_score | Int | - | This team's score |
| opponent_score | Int | - | Opponent's score |
| result | enum | - | WIN / LOSS / DRAW |
| match_date | DateTime | - | When match occurred |
| contest_id | String? | null | Associated contest |
| createdAt | DateTime | now() | Record time |
| updatedAt | DateTime | - | Update time |

## Enums

### JoinRequestStatus
```
PENDING   - Awaiting team leader decision
APPROVED  - User added to team
REJECTED  - User request denied
```

### MatchResult
```
PENDING   - Match in progress
TEAM1_WIN - Team 1 won
TEAM2_WIN - Team 2 won
DRAW      - Tied match
```

### HistoryResult
```
WIN  - This team won
LOSS - This team lost
DRAW - Tied
```

### SkillLevel
```
BEGINNER     - Average member level 1-1.5
INTERMEDIATE - Average member level 1.5-2.5
ADVANCED     - Average member level 2.5-3.5
EXPERT       - Average member level 3.5+
```

## Indexes & Constraints

### Indexes Created
```sql
-- TeamJoinRequest
UNIQUE(teamId, requesterId, status)  -- Prevent duplicate pending requests

-- TeamMatchHistory
UNIQUE(matchId)                       -- One history per team per match
INDEX(teamId)                         -- Fast team queries
INDEX(match_date)                     -- Sort by date
```

### Cascade Deletes
```
TeamJoinRequest
├─ Team deleted → All requests deleted
└─ User deleted → All requests deleted

TeamMatchHistory
├─ Team deleted → All history deleted
└─ Match deleted → All history deleted
```

## Query Performance

### Optimized Queries

1. **getJoinRequests** - O(n)
   ```
   WHERE status = PENDING AND teamId = ?
   ORDER BY createdAt DESC
   ```

2. **getTeamLeaderboard** - O(n log n)
   ```
   WHERE contestId = ? (optional)
   ORDER BY score DESC
   INCLUDE team stats
   ```

3. **getTeamHistory** - O(m log m)
   ```
   WHERE teamId = ?
   ORDER BY match_date DESC
   INCLUDE opponent details
   ```

4. **findRivalTeam** - O(n)
   ```
   WHERE skill_level = ? AND
         active_match_id IS NULL AND
         participations.contestId = ? AND
         NOT in existing match AND
         id != ownTeamId
   LIMIT 1
   ```

## Migration Commands

### For Production Deployment
```bash
# Generate migration files
npx prisma migrate dev --name add_team_join_request_system

# Create without seed
npx prisma db push

# Apply migrations
npx prisma migrate deploy
```

### For Development
```bash
# Reset database (WARNING: destructive)
npx prisma migrate reset

# Regenerate client
npx prisma generate
```

