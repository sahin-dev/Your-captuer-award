# Team Role Management Endpoints

## Overview
Team leaders can now assign and revoke roles (MODERATOR and LEADER) to team members. This provides granular control over team management.

## Endpoints

### 1. Assign Role to Member
**POST** `/api/teams/:teamId/members/:memberId/assign-role`

Promotes a member to MODERATOR or LEADER role.

#### Request
```typescript
Headers:
{
  "Authorization": "Bearer {token}"
}

URL Parameters:
{
  "teamId": "team_object_id",
  "memberId": "team_member_id"
}

Body:
{
  "role": "MODERATOR" | "LEADER"
}
```

#### Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Member promoted to MODERATOR successfully",
  "data": {
    "id": "team_member_id",
    "level": "MODERATOR",
    "memberId": "user_id",
    "teamId": "team_id",
    "status": "ACTIVE",
    "member": {
      "id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "fullName": "John Doe"
    }
  }
}
```

#### Error Responses
- **403 Forbidden**: Only team leader can assign roles
- **404 Not Found**: Team member not found
- **400 Bad Request**: 
  - Member does not belong to this team
  - Can only assign MODERATOR or LEADER roles

---

### 2. Revoke Member Role
**POST** `/api/teams/:teamId/members/:memberId/revoke-role`

Downgrade a member from MODERATOR or LEADER back to regular MEMBER level.

#### Request
```typescript
Headers:
{
  "Authorization": "Bearer {token}"
}

URL Parameters:
{
  "teamId": "team_object_id",
  "memberId": "team_member_id"
}

Body: {} (empty)
```

#### Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Member role revoked successfully",
  "data": {
    "id": "team_member_id",
    "level": "MEMBER",
    "memberId": "user_id",
    "teamId": "team_id",
    "status": "ACTIVE",
    "member": {
      "id": "user_id",
      "firstName": "Jane",
      "lastName": "Smith",
      "fullName": "Jane Smith"
    }
  }
}
```

#### Error Responses
- **403 Forbidden**: Only team leader can revoke roles
- **404 Not Found**: Team member not found
- **400 Bad Request**:
  - Member does not belong to this team
  - Cannot revoke role from another leader
  - Team must have at least one leader. Assign another leader before revoking your role.

---

## Member Roles & Permissions

### LEADER
- ✅ Assign MODERATOR or LEADER roles
- ✅ Revoke roles
- ✅ Remove members from team
- ✅ Approve/Reject join requests
- ✅ Start team matches
- ✅ Leave team (if other leaders exist)

### MODERATOR
- ✅ Start team matches
- ❌ Add/remove members
- ❌ Assign/revoke roles
- ❌ Approve join requests

### MEMBER
- ❌ Any administrative functions
- ✅ Participate in team matches
- ✅ Send join requests (if not in team)

---

## Usage Examples

### Example 1: Promote Member to MODERATOR
```bash
curl -X POST http://localhost:5000/api/teams/team123/members/member456/assign-role \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"role": "MODERATOR"}'
```

### Example 2: Assign Member as LEADER
```bash
curl -X POST http://localhost:5000/api/teams/team123/members/member456/assign-role \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"role": "LEADER"}'
```

### Example 3: Revoke Role Back to MEMBER
```bash
curl -X POST http://localhost:5000/api/teams/team123/members/member456/revoke-role \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json"
```

---

## Important Rules

### Leader Constraints
1. **Team must have at least one leader**
   - You cannot revoke your own leader role if no other leaders exist
   - You must assign another leader first

2. **Cannot revoke other leaders**
   - A leader cannot revoke another leader's role
   - Only a leader can revoke their own role (if other leaders exist)

### Role Transitions
- **MEMBER → MODERATOR**: Allowed by leader
- **MEMBER → LEADER**: Allowed by leader
- **MODERATOR → LEADER**: Allowed by leader (same as assigning LEADER)
- **MODERATOR → MEMBER**: Allowed by leader
- **LEADER → MEMBER**: Allowed only if other leaders exist (revoking own role)
- **LEADER → MEMBER**: Leader cannot revoke another leader's role

---

## Notifications

When a role is assigned or revoked:
- **Assign**: Member receives notification: "You have been promoted to {ROLE} in your team"
- **Revoke**: Member receives notification: "Your {ROLE} role has been revoked in your team"

---

## Database Impact

- Updates `TeamMember.level` field
- Does not affect team membership or match participation
- Role changes are logged through notifications
- Member stays in team regardless of role changes

---

## HTTP Status Codes

| Status | Meaning | When |
|--------|---------|------|
| 200 | OK | Role successfully assigned/revoked |
| 400 | Bad Request | Invalid role or member not in team |
| 403 | Forbidden | User is not team leader |
| 404 | Not Found | Team member not found |
| 500 | Server Error | Database error |
