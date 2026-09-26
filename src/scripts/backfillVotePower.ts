// One-off migration for power-based vote counting.
//
//   Votes in finished contests (COMPLETED, CLOSED)  -> power 1
//     Those contests were counted one vote per record. Power 1 keeps every
//     score, rank and total they show exactly as it is today.
//   Votes in every other contest                    -> the voter's current voting_power
//     (voters whose account no longer exists get 1)
//
// Dry run by default. With --apply it first copies every vote's current
// power/weight into a backup collection, then updates. It only touches votes
// whose power differs from the target, so running it again is safe.
//
//   node dist/scripts/backfillVotePower.js            # dry run
//   node dist/scripts/backfillVotePower.js --apply    # write
import config from "../config";
import prisma from "../shared/prisma";
import { ContestStatus } from "../prismaClient";
import { getVotePowerForVoter } from "../app/modules/Vote/voteWeight.service";

const FINISHED_STATUSES = [ContestStatus.COMPLETED, ContestStatus.CLOSED];
const ID_CHUNK = 1000;

const oid = (id: string) => ({ $oid: id });
const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

type Filter = Record<string, unknown>;

const countVotes = async (query: Filter) => {
  const result = (await prisma.$runCommandRaw({ count: "votes", query } as never)) as { n?: number };
  return result.n ?? 0;
};

const updateVotes = async (query: Filter, power: number) => {
  const result = (await prisma.$runCommandRaw({
    update: "votes",
    updates: [{ q: query, u: { $set: { power } }, multi: true }],
  } as never)) as { nModified?: number };
  return result.nModified ?? 0;
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(`Database: ${String(config.db).replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(apply ? "Mode: APPLY (writes changes)" : "Mode: dry run (no changes). Pass --apply to write.");

  const finishedContestIds = (
    await prisma.contest.findMany({ where: { status: { in: FINISHED_STATUSES } }, select: { id: true } })
  ).map((contest) => contest.id);
  const finished = { $in: finishedContestIds.map(oid) };
  const notFinished = { $nin: finishedContestIds.map(oid) };

  // Group existing voters by the power their votes should get.
  const users = await prisma.user.findMany({ select: { id: true, voting_power: true } });
  const userIds = new Set(users.map((user) => user.id));
  const userIdsByPower = new Map<number, string[]>();
  users.forEach((user) => {
    const power = getVotePowerForVoter(user);
    userIdsByPower.set(power, [...(userIdsByPower.get(power) ?? []), user.id]);
  });

  // Voters with no account left, among votes that get recounted.
  const distinct = (await prisma.$runCommandRaw({
    distinct: "votes",
    key: "providerId",
    query: { contestId: notFinished },
  } as never)) as { values?: Array<{ $oid: string } | string | null> };
  // null is a vote whose voter was deleted (providerId is set to null then).
  const orphanVoterIds = (distinct.values ?? [])
    .flatMap((value) => (value === null ? [] : [typeof value === "string" ? value : value.$oid]))
    .filter((id) => !userIds.has(id));

  // Every update below as [description, query, target power].
  const steps: Array<[string, Filter, number]> = [
    ["finished contests -> 1", { contestId: finished, power: { $ne: 1 } }, 1],
  ];
  [...userIdsByPower.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([power, ids]) => {
      chunk(ids, ID_CHUNK).forEach((ids) => {
        steps.push([
          `voting power ${power}`,
          { contestId: notFinished, providerId: { $in: ids.map(oid) }, power: { $ne: power } },
          power,
        ]);
      });
    });
  // { providerId: null } also matches a missing providerId.
  steps.push(["deleted voters -> 1", { contestId: notFinished, providerId: null, power: { $ne: 1 } }, 1]);
  chunk(orphanVoterIds, ID_CHUNK).forEach((ids) => {
    steps.push([
      "deleted voters -> 1",
      { contestId: notFinished, providerId: { $in: ids.map(oid) }, power: { $ne: 1 } },
      1,
    ]);
  });

  console.log(
    `Finished contests: ${finishedContestIds.length}. Voters: ${users.length}. Deleted voters with votes: ${orphanVoterIds.length}.`
  );

  const totals = new Map<string, number>();
  for (const [label, query] of steps) {
    totals.set(label, (totals.get(label) ?? 0) + (await countVotes(query)));
  }
  const toChange = [...totals.values()].reduce((sum, count) => sum + count, 0);
  totals.forEach((count, label) => console.log(`  ${label.padEnd(26)} ${count} vote(s) to change`));
  console.log(`Total votes to change: ${toChange}`);

  if (!apply || toChange === 0) {
    return;
  }

  const backup = `votes_power_backup_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
  await prisma.$runCommandRaw({
    aggregate: "votes",
    pipeline: [{ $project: { power: 1, weight: 1 } }, { $out: backup }],
    cursor: {},
  } as never);
  console.log(`Backed up power/weight of all votes to collection "${backup}".`);

  let changed = 0;
  for (const [, query, power] of steps) {
    changed += await updateVotes(query, power);
  }
  console.log(`Updated ${changed} vote(s).`);
  console.log(
    `To undo: restore "power" from "${backup}" by _id, e.g. in mongosh:\n` +
      `  db.${backup}.find().forEach(b => db.votes.updateOne({_id: b._id}, {$set: {power: b.power}}))`
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
