# Contest module

`contest.service.ts` is the single entry point and holds no logic. Each feature
has its own folder.

| Folder or file | What lives there |
|---|---|
| `authoring/` | Create, edit and delete contests. `contestBlueprint.ts` is the one place contests are saved. |
| `recurring/` | Recurring templates and the contests generated from them. |
| `entry/` | Joining a contest, submitting and withdrawing photos. |
| `actions/` | Paid actions: promote, trade, charge. |
| `exposure/` | The exposure meter and its decay. |
| `moderation/` | Admin photo removal and participant lists. |
| `read/` | Lists, details, the voting feed and leaderboards. |
| `presenters/` | The shapes sent to clients. |
| `scoring/voteTally.ts` | The rules for how votes count. Pure functions, no database. |
| `contestLifecycle.ts` | Contest statuses: what is legal and what each status allows. |
| `contestTypePolicy.ts` | Everything that differs between regular and Photographer of the Year contests. |
| `ContestRules/` | Rule definitions, and one handler per rule in `handlers/`. |
| `ContestRanking/`, `ContestFinalization/` | Building rankings, and ending a contest. |

## Rules to follow

- **Change a status with `contestStatus.change()`.** It refuses illegal moves and is safe when two workers try at once.
- **Spend store items with `consumeStoreItem()`.** Never read a balance and update it later: two requests at once could overspend.
- **Do not write to the contest document from votes.** Writes to one document from many transactions abort each other. See `assertVotingOpen` in `Vote/vote.service.ts`. Rare actions use `withActiveContest()`, which is fine because they do not happen thousands of times a minute.
- **Do not filter by a relation on a large collection**, such as `{photo: {participant: {userId}}}`. Prisma joins every row. Fetch the ids first (`getContestPhotoIdsOwnedByUser`), then filter by them.
- **Do not check `isPhotographyOfYear` in new code.** Add a field to the policy instead.
- **Keep `FINALIZATION_GRACE_MS` longer than `VOTE_TRANSACTION_TIMEOUT_MS`.** Otherwise a vote could finish after the ranking is built.

## Common tasks

**Add a contest rule**
1. Add it to `ContestRules/contestRule.definitions.ts` and `contestRule.validation.ts`.
2. Add a handler in `ContestRules/handlers/` (see `submissionLimit.handler.ts`).
3. Add it to `ruleHandlers` in `handlers/index.ts`. If it checks uploads, add it to `uploadRuleOrder` too.

**Add a contest type**
Add a policy object in `contestTypePolicy.ts` and return it from `policyFor()`.

**Add a paid action**
Write a function like `promoteContestPhoto` in `actions/contestPhotoActions.ts`: check the request, then call `withActiveContest()` and `consumeStoreItem()` inside it, then publish `user.storeChanged`.

**Run slow work after an action**
Use the pending work list, not `await` in the request:
1. Add a type to `PendingWorkType` in `PendingWork/pendingWork.queue.ts`.
2. Add its handler in `pendingWork.handlers.ts`.
3. Call `pendingWorkQueue.enqueue(...)`.

Adding the same key twice keeps one row, so repeated actions cause one run. The `work:drainPending` job runs every 30 seconds. Use domain events (`app/event/domainEvents.ts`) only for work that is safe to lose, such as clearing a cache.

## Timing to expect

- Rankings on screen can be up to 10 seconds old.
- Contest levels and user levels update within about a minute of a vote.
- Finalization starts 20 seconds after `endDate`. Voting still closes exactly at `endDate`.
