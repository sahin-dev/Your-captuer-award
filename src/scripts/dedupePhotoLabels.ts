// One-off cleanup: removes repeated labels from photos. Labels are compared
// case-insensitively ("Nature" = "nature"); the first spelling and the order
// are kept, e.g. ["Nature", "Portrait", "nature"] -> ["Nature", "Portrait"].
//
// Dry run by default. With --apply it first copies the current labels of every
// photo it will change into a backup collection, then updates. A photo whose
// labels changed while the script ran is skipped, and running it again only
// touches photos that still have duplicates.
//
//   node dist/scripts/dedupePhotoLabels.js            # dry run
//   node dist/scripts/dedupePhotoLabels.js --apply    # write
import config from "../config";
import prisma from "../shared/prisma";
import { dedupeLabels } from "../shared/labels";

const PAGE_SIZE = 1000;
const SAMPLE_SIZE = 5;

type Change = { id: string; before: string[]; after: string[] };

const findPhotosWithDuplicates = async () => {
  const changes: Change[] = [];
  let scanned = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.userPhoto.findMany({
      select: { id: true, labels: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) {
      break;
    }
    scanned += page.length;
    page.forEach((photo) => {
      const after = dedupeLabels(photo.labels);
      if (after.length !== photo.labels.length) {
        changes.push({ id: photo.id, before: photo.labels, after });
      }
    });
    if (page.length < PAGE_SIZE) {
      break;
    }
    cursor = page[page.length - 1].id;
  }

  return { scanned, changes };
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(`Database: ${String(config.db).replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(apply ? "Mode: APPLY (writes changes)" : "Mode: dry run (no changes). Pass --apply to write.");

  const { scanned, changes } = await findPhotosWithDuplicates();
  const removed = changes.reduce((sum, change) => sum + change.before.length - change.after.length, 0);
  console.log(`Photos scanned: ${scanned}. Photos with duplicate labels: ${changes.length}. Labels to remove: ${removed}.`);
  changes.slice(0, SAMPLE_SIZE).forEach((change) => {
    console.log(`  ${change.id}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`);
  });
  if (changes.length > SAMPLE_SIZE) {
    console.log(`  ... and ${changes.length - SAMPLE_SIZE} more`);
  }

  if (!apply || changes.length === 0) {
    return;
  }

  const backup = `user_photos_labels_backup_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
  for (let index = 0; index < changes.length; index += PAGE_SIZE) {
    await prisma.$runCommandRaw({
      insert: backup,
      documents: changes
        .slice(index, index + PAGE_SIZE)
        .map((change) => ({ _id: { $oid: change.id }, labels: change.before })),
    } as never);
  }
  console.log(`Backed up the current labels of ${changes.length} photo(s) to collection "${backup}".`);

  let updated = 0;
  let skipped = 0;
  for (const change of changes) {
    // Only write if the labels are still what was read, so a label added by a
    // contest submission in the meantime is never lost.
    const result = await prisma.userPhoto.updateMany({
      where: { id: change.id, labels: { equals: change.before } },
      data: { labels: { set: change.after } },
    });
    if (result.count === 1) {
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  console.log(`Updated ${updated} photo(s).${skipped ? ` Skipped ${skipped} that changed meanwhile; run again to clean them.` : ""}`);
  console.log(
    `To undo: restore "labels" from "${backup}" by _id, e.g. in mongosh:\n` +
      `  db.${backup}.find().forEach(b => db.user_photos.updateOne({_id: b._id}, {$set: {labels: b.labels}}))`
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
