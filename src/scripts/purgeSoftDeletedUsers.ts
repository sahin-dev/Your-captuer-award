// One-off cleanup: accounts deleted before hard delete existed were only
// flagged (isDeleted = true) and kept all their data. This purges each of them
// with the same code path as a self-service account deletion: their records,
// files and Stripe customer are removed and shared data is handed over.
//
// Accounts are purged one at a time; one that fails (for example because a
// contest it took part in is being finalized) is reported and skipped, and
// running the script again picks it up.
//
//   npm run users:purge-soft-deleted               # dry run
//   npm run users:purge-soft-deleted -- --apply    # delete
import config from "../config";
import prisma from "../shared/prisma";
import { accountDeletionService } from "../app/modules/User/accountDeletion.service";

const describeUser = async (userId: string) => {
  const [photos, participations, votes, comments, payments] = await Promise.all([
    prisma.userPhoto.count({ where: { userId } }),
    prisma.contestParticipant.count({ where: { userId } }),
    prisma.vote.count({ where: { providerId: userId } }),
    prisma.comment.count({ where: { providerId: userId } }),
    prisma.payment.count({ where: { userId } }),
  ]);
  return `photos=${photos} contests=${participations} votes=${votes} comments=${comments} payments=${payments}`;
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(`Database: ${String(config.db).replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(apply ? "Mode: APPLY (deletes data)" : "Mode: dry run (no changes). Pass --apply to delete.");

  const users = await prisma.user.findMany({
    where: { isDeleted: true },
    select: { id: true, email: true, role: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  });
  console.log(`Soft-deleted accounts: ${users.length}`);

  let purged = 0;
  const failed: { id: string; email: string; error: string }[] = [];

  for (const user of users) {
    const summary = await describeUser(user.id);
    console.log(`- ${user.id} ${user.email} role=${user.role} deletedAround=${user.updatedAt.toISOString()} ${summary}`);
    if (!apply) continue;

    try {
      await accountDeletionService.purgeAccount(user.id);
      purged += 1;
      console.log("  purged");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ id: user.id, email: user.email, error: message });
      console.log(`  FAILED: ${message}`);
    }
  }

  if (apply) {
    console.log(`Done: ${purged} purged, ${failed.length} failed.`);
    if (failed.length) process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Cache modules keep a Redis connection open; end the process explicitly.
    process.exit();
  });
