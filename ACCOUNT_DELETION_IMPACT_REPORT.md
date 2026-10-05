# Account Deletion Impact Report

Date: 2026-10-03  
Scope: API service, Prisma/MongoDB schema, object storage, Stripe-linked data, notifications, and WebSocket state.

## Executive conclusion

Deleting a `User` and every related database record with one hard-delete/cascade operation is **not safe in the current application**. It can either fail on required relations or leave dangling raw IDs, incorrect team counters, altered contest rankings, broken completed-contest history, inconsistent reward/payment ledgers, orphaned uploaded files, and active socket sessions.

The current endpoint does not hard-delete anything. It verifies a password and sets `isDeleted = true` and `isActive = false` (`src/app/modules/User/user.service.ts`, lines 374-387). This blocks normal authenticated HTTP requests because the auth middleware rejects `isDeleted` users, but it does not erase their data.

Recommended policy:

1. Immediately disable the account and revoke access.
2. Purge private and user-owned data.
3. Remove or anonymize the user's identity from shared/historical records.
4. Preserve only records that must remain for financial, fraud, dispute, or legal reasons, using an anonymous/non-reversible subject key and a documented retention period.
5. Perform the work through an idempotent deletion job, not a single request-time cascade.

## Current behavior and defects

### Current deletion is only a soft delete

`deleteAccount` updates two flags and returns success. It does not remove the access token, profile fields, photos, team membership, contest participation, achievements, chats, votes, comments, likes, follows, notifications, payments, subscriptions, reports, or uploaded files.

HTTP auth rejects a soft-deleted user (`src/app/middlewares/auth.middleware.ts`, lines 38-46), but several inconsistencies remain:

- Password sign-in does not check `isDeleted` or `isActive`; it issues a new token and stores it before later protected requests reject the user (`src/app/modules/Auth/auth.service.ts`, lines 78-103).
- Google and Facebook login can find a deleted account and set `isActive = true` without clearing or rejecting `isDeleted` (`src/app/passportStrategies/google.strategy.ts`, lines 23-54; `src/app/passportStrategies/facebook.strategy.ts`, lines 18-51).
- Social-only users have a nullable password, but deletion requires a password and calls `bcrypt.compare` with `user.password`; account deletion is therefore not reliable for social-only accounts (`prisma/user.prisma`, line 17; `src/app/modules/User/user.validation.ts`, lines 46-48; `src/app/modules/User/user.service.ts`, line 380).
- Socket authentication trusts the JWT identity and updates the user without checking `isDeleted`, `isActive`, or `isBlocked` (`src/helpers/websocketSetUp.ts`, lines 72-99). Already-connected sockets are not disconnected by account deletion.
- Most public/profile/achievement queries do not consistently filter `isDeleted`, so retained data can remain visible. The team module contains a special filter precisely because MongoDB or out-of-band deletion can leave orphaned membership references (`src/app/modules/Team/team.service.ts`, lines 51-94).

## Why a direct hard delete is unsafe

### 1. Required user relations can block deletion

Several required relations do not declare `onDelete: Cascade` or `SetNull`, including team creator, contest creator, comments, follows, contest participants, team join requests, and subscriptions. A direct `prisma.user.delete()` cannot be treated as a complete purge plan.

The important required ownership/reference paths include:

- `Team.creatorId`
- `Contest.creatorId`
- `Comment.providerId`
- `Follow.followerId` and `Follow.followingId`
- `ContestParticipant.userId`
- `TeamJoinRequest.requesterId`
- `Subscription.userId`

MongoDB does not enforce foreign keys at the database level. Prisma can emulate referential actions for operations made through Prisma, but raw IDs and writes outside that path can still become orphaned. The repository already has defensive code and comments for this exact failure mode.

### 2. Many user references are raw IDs with no relation

The following fields can silently retain a deleted user's ID because they are not modeled as Prisma relations:

- `RecurringContest.creatorId`
- `ContestEntryFeeTransaction.userId`
- `ContestRuleAcceptance.userId`
- `ContestAwardGrant.userId`
- `ContestAwardSelection.selectedById`
- `ContestRewardTransaction.userId`
- `ContestEntryCheckout.userId`
- `PurchaseRecords.userId`
- `Notification.receiverId`
- `Report.reporterId`, `reportedUserId`, and `reviewedById`
- `TeamInvitation.senderId` and `receiverId`
- `TeamMatch.started_by_id`
- `TeamMatchQueue.started_by_id`
- `TeamRewardTransaction.userId`

There are also user IDs and names copied into `Notification.data` and notification message text, including voter, inviter, commenter, and uploader identities. Deleting only top-level rows by `receiverId` does not remove copies stored in other users' notifications.

### 3. Team state will drift or shared data will be destroyed

Deleting a `TeamMember` through a cascade does not run the service logic that decrements `Team.member_count`. The explicit leave/remove functions update both records in a transaction (`src/app/modules/Team/team.service.ts`, lines 934-948 and 1007-1021). A cascade would therefore leave the cached count wrong.

Additional team risks:

- A user may be the required `Team.creator`. Deleting the team would also affect every other member; keeping it without transferring ownership leaves an invalid creator.
- Team match documents contain membership document IDs in `team1_member_ids` and `team2_member_ids`. Removing the membership without handling active matches leaves stale roster snapshots.
- Active match searches store the initiating user in `TeamMatchQueue.started_by_id`.
- Team invitations and join requests store user IDs, some without schema relations.
- Team rewards store user IDs in an idempotency ledger. Removing them can make payout reconciliation incomplete.
- Deleting the user's chat messages changes shared conversation history. Deleting attached chat rows does not delete their `fileUrl` objects from storage.

Safe ownership rule: transfer a team to another active leader/member. Delete the whole team only when it has no other members and no history that must be retained. Recalculate `member_count` from actual memberships rather than decrementing it blindly.

### 4. Contest participation is a dependency graph, not one row

The user's contest identity starts at `ContestParticipant`, then fans out to:

- `ContestPhoto`
- `ContestPhotoTradeRecord`
- `Vote` records attached to the user's contest photos
- `Comment` records on those contest photos
- `ContestAchievement`
- `ContestRankingResult`
- `ContestAwardGrant`
- `ContestAwardSelection`
- `ContestRewardTransaction`
- team-match scoring that reads participant/photo/vote state

`ContestParticipant` is unique by `(contestId, userId)` and is directly used to fetch achievements. Contest finalization persists ranking snapshots and then creates award grants, achievements, reward transactions, and store credits. These are intentionally durable and idempotent (`src/app/modules/Contest/ContestRanking/contestRanking.service.ts`, lines 314-377; `src/app/modules/Contest/ContestFinalization/contestFinalization.service.ts`, lines 295-430).

Deleting this graph can cause different behavior depending on contest state:

#### Upcoming/open/active contest

- Removing the user's submissions and votes changes current scores and ranks.
- Votes cast by the user contribute to other users' scores. Deleting them changes other participants' positions.
- Active team matches may have already captured membership rosters and may calculate a different score after deletion.
- Cached contest rankings must be invalidated and rebuilt.

Recommended behavior: remove the user's participant/submission graph, cancel or recompute affected active team matches according to a documented rule, and rebuild the contest ranking.

#### Finalizing contest

Deletion can race with the finalization worker. The worker may recreate achievements/grants or attempt to credit a user store after deletion.

Recommended behavior: do not purge while a related contest is `FINALIZING`; mark deletion pending and let the deletion worker retry after finalization reaches a terminal state, or make finalization explicitly ignore deletion-pending users.

#### Completed contest

Hard-deleting the user's votes, participant, photos, rankings, achievements, and grants changes or fragments an immutable result after prizes were issued. Re-running a ranking can produce winners who did not receive the original award, while deleting grant/reward ledgers removes proof that a payout occurred. Renumbering ranks can also make historical notifications and team-match results false.

Recommended behavior: do not recompute completed results. Remove the user's public/personal result rows if product policy requires it, but keep the remaining rank numbers unchanged (gaps are acceptable), and retain an anonymized financial/idempotency ledger where required. If absolutely no related row may remain, the product must accept that historical leaderboards, award auditability, and payment reconciliation will no longer be reliable.

### 5. Deleting photos can leave broken contest slots and stored objects

`UserPhoto` has a cascade from `User`, but `ContestPhoto.photoId` uses `SetNull`. Deleting a gallery photo alone therefore leaves an empty contest slot. The existing photo-delete service manually nulls likes and contest slots before deleting the photo (`src/app/modules/Profile/profile.service.ts`, lines 311-330).

Database deletion also does not delete bytes from DigitalOcean Spaces. User photos, avatar, cover, and chat attachments are stored as URLs; only upload error paths currently call storage deletion. Direct uploads use a user-prefixed key, while other uploads use general project keys.

Required storage cleanup inventory:

- avatar
- cover
- all `UserPhoto.url` objects
- files attached to chat messages sent by the user
- any unconfirmed direct uploads under `captureaward/direct/{userId}/`

Storage deletion cannot share a transaction with MongoDB. It should be tracked in a durable purge/outbox job and retried until confirmed.

### 6. Comments, replies, likes, follows, and votes need explicit policy

- A user comment can be the parent of replies written by other users. The self-relation uses `onDelete: NoAction`. Deleting the whole thread also deletes other users' content; deleting only the parent leaves replies without valid context. Anonymizing the parent author is the least disruptive option, but requires making `providerId` nullable or pointing to a non-personal tombstone account.
- Likes and votes use optional providers with `SetNull`, which preserves aggregate behavior but creates anonymous records. If the requirement is to erase the user's actions, those rows must be explicitly deleted instead; counts and rankings then change.
- Follows must be deleted in both directions.
- Notifications received by the user must be deleted, and notifications received by other users must be searched/scrubbed when their text or JSON payload contains the deleted user's identity.

### 7. Payments and subscriptions have external state

Deleting local `Payment`, `Subscription`, checkout, entry-fee, purchase, award, and reward records does not cancel a Stripe subscription, delete the Stripe customer, issue a refund, or stop delayed webhooks. A later webhook can then fail, update nothing, or reintroduce inconsistent local state.

Before database purge:

- cancel active external subscriptions;
- decide refund policy for pending contest/payment sessions;
- detach or delete the Stripe customer where allowed;
- mark the subject as deletion-pending so webhooks become idempotent no-ops or are routed to a retained anonymous ledger;
- define legally required retention for invoices, refunds, disputes, fraud, tax, and payout evidence.

Financial records should normally be retained in a minimized/anonymized form rather than completely erased. Legal requirements depend on operating jurisdictions and need legal confirmation.

### 8. Reports and moderation history affect other users

A user may be the reporter, reported person, or reviewing admin. Deleting every report involving them can erase evidence needed to handle abuse, appeals, or disputes. If retention is allowed, replace user references with an irreversible deletion subject and remove profile fields. If strict full deletion is required, accept the loss of moderation history and remove all three roles explicitly.

## Recommended deletion architecture

### Phase 1: Quiesce synchronously

In the account-deletion request:

1. Verify password for password accounts; require recent OAuth reauthentication for social-only accounts.
2. Set `isDeleted = true`, `isActive = false`, `isOnline = false`, and clear `accessToken`.
3. Store a deletion state such as `PENDING`, plus request time and a random deletion job ID.
4. Disconnect all sockets for that user and remove them from in-memory online maps/rooms.
5. Return `202 Accepted` if the full purge is asynchronous.

All sign-in methods, socket auth, workers, and webhook handlers must reject or ignore `PENDING`/deleted users.

### Phase 2: Resolve shared ownership and active operations

1. Transfer owned teams to another eligible member; otherwise run the existing full team-delete cleanup when the team is empty.
2. Transfer admin-created contests/recurring contests to a system owner, or make creator references nullable and set them to null.
3. Clear `bannerUploaderId` where the user supplied a contest banner.
4. Cancel user-started match searches.
5. Cancel/rebuild active team matches impacted by the user's membership or submissions.
6. Wait for or coordinate with contest finalization.
7. Cancel external subscriptions/payment sessions as policy requires.

### Phase 3: Purge database data in an idempotent transaction/job

Resolve all dependent IDs first: team membership IDs, participant IDs, contest photo IDs, user photo IDs, award grant IDs, and chat attachment URLs.

Suggested logical deletion groups:

1. **Messaging and notifications**: sent chats, received notifications, identity-bearing notifications belonging to others, invitations, join requests.
2. **Social activity**: follows both directions, likes made, comments/replies according to policy, votes cast according to contest-state policy.
3. **Contest graph**: rule acceptances, entry checkout/fees, selections by the user, ranking rows, achievements, grants/rewards, trade records, contest photos, participants.
4. **Team graph**: queue entries started by the user, rewards, membership, and cached member count/active-match reconciliation.
5. **Profile/private data**: OTP, level, store, subscriptions, payments/purchases according to retention policy, photos, and profile.
6. **Moderation**: reports in reporter/reported/reviewer roles according to retention policy.
7. Delete the `User` last.

Do not rely only on schema cascades. Every raw-ID collection needs an explicit operation and verification count.

### Phase 4: External cleanup and verification

1. Delete collected object-storage keys with retries.
2. Complete Stripe cleanup and record only the minimal allowed result.
3. Invalidate contest, profile, ranking, and team caches.
4. Verify no user ID remains in known top-level fields, arrays, JSON payloads, or storage prefixes.
5. Mark the deletion job `COMPLETED`; alert and retry if any step remains.

## Model-by-model disposition

| Area/model | Recommended disposition | Main consistency action |
|---|---|---|
| `User`, `Otp`, `UserLevel`, `UserStore` | Delete | User last; clear auth first |
| `UserPhoto` | Delete | Delete storage object; resolve contest slots first |
| `Like` | Delete where `providerId=user`; delete/null likes on removed photos | Recalculate visible counts |
| `Follow` | Delete where follower or following | Both directions |
| `Comment` | Delete or anonymize author | Handle reply trees and copied notification text |
| `Vote` | State-dependent: delete for active contests; anonymize/preserve for completed contests if history must remain | Rebuild active ranks; do not rewrite completed winners |
| `TeamMember` | Delete | Transfer ownership; recompute `member_count`; reconcile matches |
| `TeamInvitation`, `TeamJoinRequest` | Delete | Both sender/requester/receiver roles |
| `TeamMatchQueue` | Delete/cancel if started by user | Clear team active search state |
| `TeamRewardTransaction` | Delete or anonymize per audit policy | Preserve payout idempotency if retained |
| `Chat` | Delete messages sent by user if required | Delete `fileUrl` object; shared timeline will change |
| `ContestParticipant` and dependent graph | Delete with explicit order | Contest-state-specific ranking policy |
| `ContestAchievement` | Delete for user | Remove via participant IDs, not user ID |
| Ranking/grant/reward ledgers | Active: delete/rebuild; completed: anonymize/minimize if audit required | Avoid contradictory historical winners/payouts |
| Notifications | Delete user's inbox; scrub others' payload/text copies | JSON/text can contain identity |
| Reports | Delete or anonymize all three user roles | Moderation retention policy |
| Payment/subscription/purchase records | Cancel external state, then delete/anonymize per legal policy | Handle delayed webhooks and disputes |
| Owned `Team`/`Contest`/`RecurringContest` | Transfer or system-own; do not blindly cascade | Shared records belong to other users too |

## Required safeguards and acceptance tests

### Functional tests

- Password account can request deletion with the correct password.
- Social-only account can request deletion after recent provider reauthentication.
- Deleted/pending user cannot sign in by password, Google, or Facebook.
- Deleted/pending user cannot authenticate or continue through WebSocket.
- User is removed from team roster and `member_count` equals actual memberships.
- Team ownership is transferred or the empty team is fully deleted.
- Invitations and join requests disappear in sender and receiver roles.
- Chats and attachments follow the selected deletion policy.
- Active contest ranks are rebuilt after removing the user's submissions/actions.
- Completed contest results follow the explicit immutable-history policy and do not award/refund other users accidentally.
- Achievements and profile statistics no longer return the user.
- Notifications and reports do not expose copied name/ID data.
- Stripe subscription/customer behavior matches the deletion policy.
- Object storage contains no keys collected for the user.

### Failure and concurrency tests

- Re-running the deletion job is safe and reaches the same result.
- Crash after database deletion but before storage deletion resumes storage cleanup.
- Crash after Stripe cancellation but before local deletion resumes without duplicate refunds/cancellations.
- Vote/photo upload/chat send racing with deletion is rejected or is subsequently purged.
- Contest finalization racing with deletion cannot recreate the user's achievements, rewards, or store.
- Delayed payment webhook after deletion is safely ignored or written only to an allowed anonymous ledger.
- Deleting a parent comment with replies follows the documented reply policy.

### Verification query categories

After deletion, assert zero matches for the user ID in:

- every direct `userId`/creator/provider/sender/receiver/requester/reporter/reviewer field;
- team match/search fields and membership-derived arrays;
- participant-derived ranking, achievement, award, and reward rows;
- notification JSON payloads and identity-bearing message text where searchable;
- object-storage keys/URLs attributed to the user.

## Decision required before implementation

The product needs one explicit choice for completed contests and financial/moderation history:

1. **Recommended privacy deletion:** remove personal/profile content and unlink or irreversibly anonymize required shared history. This preserves contest winners, payout idempotency, disputes, and team history.
2. **Absolute purge:** delete every related record. This meets the strictest interpretation of “nothing remains,” but completed rankings, award evidence, financial reconciliation, moderation history, and some other users' shared content will become incomplete or change.

Without this decision, an implementation cannot be both “delete everything” and “preserve consistent historical behavior”; those goals conflict in completed shared contests and financial records.
