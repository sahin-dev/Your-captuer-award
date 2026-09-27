// One-off migration: contest categories move from labels to categories.
//
// Entering a contest used to push the contest's category into the photo's
// labels, mixing it with the owner's own tags. It now goes into the photo's
// categories instead. For every photo that was ever entered in a contest
// (current slot, the slot's original photo, or a trade record), this:
//
//   1. adds the category of each of those contests to categories, and
//   2. removes from labels any label that equals one of those categories.
//
// Labels that do not match a contest the photo was entered in are the owner's
// tags and are left alone. Categories and labels are compared ignoring case
// and surrounding spaces, and neither list ever ends up with a repeated item.
//
// Dry run by default: prints what would change. With --apply it first backs up
// the labels/categories of every photo it changes, then writes. Running it
// again changes nothing that is already in place.
//
//   node dist/scripts/backfillPhotoCategories.js            # dry run (npm run photos:backfill-categories)
//   node dist/scripts/backfillPhotoCategories.js --apply    # write
import config from "../config";
import prisma from "../shared/prisma";
import { dedupeLabels, hasLabel } from "../shared/labels";

const ID_CHUNK = 1000;
const SAMPLE_SIZE = 10;

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

type PhotoChange = {
  id: string;
  labels: string[];
  categories: string[];
  toLabels: string[];
  toCategories: string[];
};

// photo id -> categories of the contests it was entered in
const loadEnteredCategories = async () => {
  const contests = await prisma.contest.findMany({
    where: { category: { not: null } },
    select: { id: true, category: true },
  });
  const categoryByContest = new Map(
    contests.filter((contest) => contest.category?.trim()).map((contest) => [contest.id, contest.category!.trim()])
  );

  const [slots, trades] = await Promise.all([
    prisma.contestPhoto.findMany({ select: { contestId: true, photoId: true, originalPhotoId: true } }),
    prisma.contestPhotoTradeRecord.findMany({ select: { contestId: true, photoId: true } }),
  ]);

  const entered = new Map<string, string[]>();
  const add = (photoId: string | null | undefined, contestId: string) => {
    const category = categoryByContest.get(contestId);
    if (!photoId || !category) return;
    entered.set(photoId, dedupeLabels([...(entered.get(photoId) ?? []), category]));
  };
  slots.forEach((slot) => {
    add(slot.photoId, slot.contestId);
    add(slot.originalPhotoId, slot.contestId);
  });
  trades.forEach((trade) => add(trade.photoId, trade.contestId));

  return entered;
};

const planChanges = async (entered: Map<string, string[]>) => {
  const changes: PhotoChange[] = [];
  let checked = 0;

  for (const ids of chunk([...entered.keys()], ID_CHUNK)) {
    const photos = await prisma.userPhoto.findMany({
      where: { id: { in: ids } },
      select: { id: true, labels: true, categories: true },
    });
    checked += photos.length;

    photos.forEach((photo) => {
      const labels = photo.labels ?? [];
      const categories = photo.categories ?? [];
      const contestCategories = entered.get(photo.id) ?? [];

      // Keep existing categories first, then any contest category still
      // missing; dedupeLabels also cleans up repeats already stored.
      const toCategories = dedupeLabels([...categories, ...contestCategories]);
      const toLabels = dedupeLabels(labels.filter((label) => !hasLabel(contestCategories, label)));

      const same = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);
      if (!same(labels, toLabels) || !same(categories, toCategories)) {
        changes.push({ id: photo.id, labels, categories, toLabels, toCategories });
      }
    });
  }

  return { checked, changes };
};

const printChanges = (checked: number, changes: PhotoChange[]) => {
  console.log(`Photos entered in a contest: ${checked}. To change: ${changes.length}.`);
  changes.slice(0, SAMPLE_SIZE).forEach((change) => {
    console.log(
      `  ${change.id}\n` +
        `    labels:     ${JSON.stringify(change.labels)} -> ${JSON.stringify(change.toLabels)}\n` +
        `    categories: ${JSON.stringify(change.categories)} -> ${JSON.stringify(change.toCategories)}`
    );
  });
  if (changes.length > SAMPLE_SIZE) {
    console.log(`  ... and ${changes.length - SAMPLE_SIZE} more.`);
  }
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(`Database: ${String(config.db).replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(apply ? "Mode: APPLY (writes changes)" : "Mode: dry run (no changes). Pass --apply to write.");

  const { checked, changes } = await planChanges(await loadEnteredCategories());
  printChanges(checked, changes);

  if (!apply || changes.length === 0) {
    return;
  }

  const backup = `user_photos_categories_backup_${stamp}`;
  for (const part of chunk(changes, ID_CHUNK)) {
    await prisma.$runCommandRaw({
      insert: backup,
      documents: part.map((change) => ({
        _id: { $oid: change.id },
        labels: change.labels,
        categories: change.categories,
      })),
    } as never);
  }
  console.log(`Backed up labels/categories of ${changes.length} photo(s) to "${backup}".`);

  let updated = 0;
  for (const part of chunk(changes, 100)) {
    await prisma.$transaction(
      part.map((change) =>
        prisma.userPhoto.update({
          where: { id: change.id },
          data: { labels: change.toLabels, categories: change.toCategories },
        })
      )
    );
    updated += part.length;
    console.log(`Updated ${updated}/${changes.length} photo(s).`);
  }

  console.log(
    "To undo, restore from the backup by _id, e.g. in mongosh:\n" +
      `  db.${backup}.find().forEach(b => db.user_photos.updateOne({_id: b._id}, {$set: {labels: b.labels, categories: b.categories}}))`
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
