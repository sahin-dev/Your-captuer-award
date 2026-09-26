// One-off migration for power-based vote counting and earned levels.
//
//   1. Levels: every user who has a level (or a voting_power other than 1) is
//      set to the level they have actually earned, with that level's voting
//      power (LEVEL_RULES). No level earned -> currentLevel -1, power 1.
//      Until now every sign-up was given APPRENTICE without earning it. This
//      is the only step that can move a user down; afterwards levels only go up.
//   2. Votes in finished contests (COMPLETED, CLOSED) -> power 1
//      Those contests were counted one vote per record. Power 1 keeps every
//      score, rank and total they show exactly as it is today.
//   3. Votes in every other contest -> the voter's voting_power
//      (voters whose account no longer exists get 1)
//
// Levels depend on votes received, which depend on the voters' power, so
// steps 1 and 3 repeat until no level changes (at most MAX_ROUNDS).
//
// Dry run by default: shows the first round only. With --apply it first backs
// up the level/power of every user it changes and the power of every vote,
// then writes. Running it again only changes what is still out of line.
//
//   node dist/scripts/backfillVotePower.js            # dry run
//   node dist/scripts/backfillVotePower.js --apply    # write
import config from "../config";
import prisma from "../shared/prisma";
import { ContestStatus } from "../prismaClient";
import { getVotePowerForVoter } from "../app/modules/Vote/voteWeight.service";
import { levelService } from "../app/modules/Level/level.service";
import { LEVEL_BADGE_TYPES } from "../app/modules/Level/level.config";

const FINISHED_STATUSES = [ContestStatus.COMPLETED, ContestStatus.CLOSED];
const ID_CHUNK = 1000;
const MAX_ROUNDS = 5;
const NO_LEVEL = -1;

const oid = (id: string) => ({ $oid: id });
const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

type Filter = Record<string, unknown>;
type UserState = { id: string; level: number; power: number };
type LevelChange = UserState & { toLevel: number; toPower: number; toName: string };

const runCommand = async <T>(command: Record<string, unknown>) => (await prisma.$runCommandRaw(command as never)) as T;

const loadUsers = async (): Promise<UserState[]> =>
  (await prisma.user.findMany({ select: { id: true, voting_power: true, currentLevel: true } })).map((user) => ({
    id: user.id,
    level: user.currentLevel ?? NO_LEVEL,
    power: getVotePowerForVoter(user),
  }));

type Row = Record<string, unknown> & { _id: unknown };
const idString = (value: unknown) =>
  typeof value === "object" && value !== null && "$oid" in value ? String((value as { $oid: string }).$oid) : String(value);

// Runs an aggregation into a temporary collection and reads it back in pages
// by _id. Cursors are avoided: Prisma's raw commands return the 64-bit cursor
// id as a JavaScript number, which loses precision, so getMore fails.
const READ_PAGE = Number(process.env.BACKFILL_READ_PAGE) || 5000;
const aggregateAll = async (collection: string, pipeline: unknown[]) => {
  const temp = `tmp_backfill_${stamp}_${collection}`;
  await runCommand({ aggregate: collection, pipeline: [...pipeline, { $out: temp }], cursor: {}, allowDiskUse: true });

  try {
    const rows: Row[] = [];
    let lastId: unknown;
    for (;;) {
      const page = await runCommand<{ cursor: { firstBatch: Row[] } }>({
        find: temp,
        filter: lastId === undefined ? {} : { _id: { $gt: lastId } },
        sort: { _id: 1 },
        limit: READ_PAGE,
        batchSize: READ_PAGE,
        singleBatch: true,
      });
      rows.push(...page.cursor.firstBatch);
      if (page.cursor.firstBatch.length < READ_PAGE) {
        return rows;
      }
      lastId = page.cursor.firstBatch[page.cursor.firstBatch.length - 1]._id;
    }
  } finally {
    await runCommand({ drop: temp }).catch(() => undefined);
  }
};

// The same numbers levelService.getReceivedVoteStats / getBadgeCounts give for
// one user, computed for every user at once: votes on photos whose participant
// is the user (summed by power), and badges of the level badge categories.
const loadLevelStats = async () => {
  const toOwner = [
    { $lookup: { from: "contest_photos", localField: "photoId", foreignField: "_id", as: "photo" } },
    { $unwind: "$photo" },
    { $lookup: { from: "contest_participants", localField: "photo.participantId", foreignField: "_id", as: "participant" } },
    { $unwind: "$participant" },
  ];
  const voteRows = await aggregateAll("votes", [
    { $project: { photoId: 1, type: 1, power: 1 } },
    ...toOwner,
    {
      $group: {
        _id: "$participant.userId",
        receivedVotes: { $sum: "$power" },
        promotedVotes: { $sum: { $cond: [{ $eq: ["$type", "Promoted"] }, "$power", 0] } },
      },
    },
  ]);
  const badgeRows = await aggregateAll("contest_achievements", [
    { $match: { category: { $in: LEVEL_BADGE_TYPES } } },
    { $lookup: { from: "contest_participants", localField: "participantId", foreignField: "_id", as: "participant" } },
    { $unwind: "$participant" },
    { $group: { _id: { userId: "$participant.userId", category: "$category" }, count: { $sum: 1 } } },
  ]);

  const votesByUser = new Map(
    voteRows.map((row) => [idString(row._id), { receivedVotes: Number(row.receivedVotes) || 0, promotedVotes: Number(row.promotedVotes) || 0 }])
  );
  const badgesByUser = new Map<string, Record<string, number>>();
  badgeRows.forEach((row) => {
    const key = row._id as { userId: unknown; category: string };
    const userId = idString(key.userId);
    badgesByUser.set(userId, { ...(badgesByUser.get(userId) ?? {}), [key.category]: Number(row.count) || 0 });
  });

  return (userId: string) => ({
    ...(votesByUser.get(userId) ?? { receivedVotes: 0, promotedVotes: 0 }),
    badgeCounts: Object.fromEntries(LEVEL_BADGE_TYPES.map((category) => [category, badgesByUser.get(userId)?.[category] ?? 0])),
  });
};

// Step 1: the level each user has earned from the votes and badges they have now.
const planLevelChanges = async (users: UserState[]) => {
  const candidates = users.filter((user) => user.level >= 0 || user.power !== 1);
  const statsFor = await loadLevelStats();
  const changes: LevelChange[] = [];

  candidates.forEach((user) => {
    const earned = levelService.getEligibleLevel(statsFor(user.id));
    const toLevel = earned?.order ?? NO_LEVEL;
    const toPower = earned?.votePower ?? 1;
    if (toLevel !== user.level || toPower !== user.power) {
      changes.push({ ...user, toLevel, toPower, toName: earned?.levelName ?? "NEW" });
    }
  });

  return { checked: candidates.length, changes };
};

const printLevelChanges = (checked: number, changes: LevelChange[]) => {
  console.log(`Users checked: ${checked}. Level/power to change: ${changes.length}.`);
  const byTransition = new Map<string, number>();
  changes.forEach((change) => {
    const key = `level ${change.level} power ${change.power} -> ${change.toName} (level ${change.toLevel}, power ${change.toPower})`;
    byTransition.set(key, (byTransition.get(key) ?? 0) + 1);
  });
  byTransition.forEach((count, key) => console.log(`  ${key}: ${count} user(s)`));
};

const applyLevelChanges = async (changes: LevelChange[]) => {
  if (changes.length === 0) {
    return 0;
  }

  // $setOnInsert keeps a user's original values when a later round changes
  // the same user again.
  for (const batch of chunk(changes, ID_CHUNK)) {
    await runCommand({
      update: `users_level_backup_${stamp}`,
      updates: batch.map((change) => ({
        q: { _id: oid(change.id) },
        u: { $setOnInsert: { currentLevel: change.level, voting_power: change.power } },
        upsert: true,
      })),
    });
  }

  const levelDocs = await prisma.level.findMany({ select: { id: true, level: true } });
  const levelIdByOrder = new Map(levelDocs.map((level) => [level.level, level.id]));

  let applied = 0;
  for (const change of changes) {
    // Guarded on the level that was read, so a level-up that happened while
    // this ran is not overwritten.
    const result = await prisma.user.updateMany({
      where: { id: change.id, currentLevel: change.level === NO_LEVEL ? { lt: 0 } : change.level },
      data: { currentLevel: change.toLevel, voting_power: change.toPower },
    });
    if (result.count !== 1) {
      continue;
    }
    applied += 1;

    const levelId = levelIdByOrder.get(change.toLevel);
    if (levelId) {
      await prisma.userLevel.upsert({
        where: { userId: change.id },
        update: { levelId },
        create: { userId: change.id, levelId },
      });
    } else {
      await prisma.userLevel.deleteMany({ where: { userId: change.id } });
    }
  }

  return applied;
};

// Steps 2 and 3: every vote update as [description, query, target power].
const planVoteSteps = async (finishedContestIds: string[], users: UserState[]) => {
  const finished = { $in: finishedContestIds.map(oid) };
  const notFinished = { $nin: finishedContestIds.map(oid) };
  const userIds = new Set(users.map((user) => user.id));

  const userIdsByPower = new Map<number, string[]>();
  users.forEach((user) => userIdsByPower.set(user.power, [...(userIdsByPower.get(user.power) ?? []), user.id]));

  const distinct = await runCommand<{ values?: Array<{ $oid: string } | string | null> }>({
    distinct: "votes",
    key: "providerId",
    query: { contestId: notFinished },
  });
  // null is a vote whose voter was deleted (providerId is set to null then).
  const orphanVoterIds = (distinct.values ?? [])
    .flatMap((value) => (value === null ? [] : [typeof value === "string" ? value : value.$oid]))
    .filter((id) => !userIds.has(id));

  const steps: Array<[string, Filter, number]> = [
    ["finished contests -> 1", { contestId: finished, power: { $ne: 1 } }, 1],
  ];
  [...userIdsByPower.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([power, ids]) => {
      chunk(ids, ID_CHUNK).forEach((batch) => {
        steps.push([
          `voting power ${power}`,
          { contestId: notFinished, providerId: { $in: batch.map(oid) }, power: { $ne: power } },
          power,
        ]);
      });
    });
  // { providerId: null } also matches a missing providerId.
  steps.push(["deleted voters -> 1", { contestId: notFinished, providerId: null, power: { $ne: 1 } }, 1]);
  chunk(orphanVoterIds, ID_CHUNK).forEach((batch) => {
    steps.push([
      "deleted voters -> 1",
      { contestId: notFinished, providerId: { $in: batch.map(oid) }, power: { $ne: 1 } },
      1,
    ]);
  });

  const totals = new Map<string, number>();
  for (const [label, query] of steps) {
    const { n } = await runCommand<{ n?: number }>({ count: "votes", query });
    totals.set(label, (totals.get(label) ?? 0) + (n ?? 0));
  }
  const toChange = [...totals.values()].reduce((sum, count) => sum + count, 0);

  return { steps, totals, toChange };
};

const applyVoteSteps = async (steps: Array<[string, Filter, number]>) => {
  let changed = 0;
  for (const [, query, power] of steps) {
    const result = await runCommand<{ nModified?: number }>({
      update: "votes",
      updates: [{ q: query, u: { $set: { power } }, multi: true }],
    });
    changed += result.nModified ?? 0;
  }
  return changed;
};

const withPlannedPowers = (users: UserState[], changes: LevelChange[]) => {
  const byId = new Map(changes.map((change) => [change.id, change]));
  return users.map((user) => {
    const change = byId.get(user.id);
    return change ? { ...user, level: change.toLevel, power: change.toPower } : user;
  });
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(`Database: ${String(config.db).replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(apply ? "Mode: APPLY (writes changes)" : "Mode: dry run (no changes). Pass --apply to write.");

  const finishedContestIds = (
    await prisma.contest.findMany({ where: { status: { in: FINISHED_STATUSES } }, select: { id: true } })
  ).map((contest) => contest.id);
  console.log(`Finished contests: ${finishedContestIds.length}.`);

  if (!apply) {
    const users = await loadUsers();
    const { checked, changes } = await planLevelChanges(users);
    printLevelChanges(checked, changes);
    const { totals, toChange } = await planVoteSteps(finishedContestIds, withPlannedPowers(users, changes));
    totals.forEach((count, label) => console.log(`  ${label.padEnd(26)} ${count} vote(s) to change`));
    console.log(`Total votes to change: ${toChange}`);
    console.log("This is the first round. Lowering a voter's power can change other users' levels, which --apply handles in further rounds.");
    return;
  }

  const voteBackup = `votes_power_backup_${stamp}`;
  await runCommand({ aggregate: "votes", pipeline: [{ $project: { power: 1, weight: 1 } }, { $out: voteBackup }], cursor: {} });
  console.log(`Backed up power/weight of all votes to "${voteBackup}".`);

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    console.log(`--- Round ${round}`);
    const { checked, changes } = await planLevelChanges(await loadUsers());
    printLevelChanges(checked, changes);
    const levelsApplied = await applyLevelChanges(changes);
    if (levelsApplied > 0) {
      console.log(`Updated level/power of ${levelsApplied} user(s). Backup: "users_level_backup_${stamp}".`);
    }

    const { steps, toChange } = await planVoteSteps(finishedContestIds, await loadUsers());
    const votesChanged = toChange > 0 ? await applyVoteSteps(steps) : 0;
    console.log(`Updated ${votesChanged} vote(s).`);

    if (levelsApplied === 0) {
      console.log("Stable: no level changed in this round.");
      break;
    }
    if (round === MAX_ROUNDS) {
      console.log(`Stopped after ${MAX_ROUNDS} rounds; run the script again to continue.`);
    }
  }

  console.log(
    "To undo, restore from the backups by _id, e.g. in mongosh:\n" +
      `  db.${voteBackup}.find().forEach(b => db.votes.updateOne({_id: b._id}, {$set: {power: b.power}}))\n` +
      `  db.users_level_backup_${stamp}.find().forEach(b => db.users.updateOne({_id: b._id}, {$set: {currentLevel: b.currentLevel, voting_power: b.voting_power}}))`
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
