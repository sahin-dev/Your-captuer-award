// One-off migration: uploaded files used to be saved as full URLs, now only
// the storage key is saved, e.g.
//   https://cdn.example.com/captureaward/123_abc.jpg -> captureaward/123_abc.jpg
// URLs that do not point at our storage (default images) are left alone.
//
// Safe to run while the app is live: the app reads both full URLs and keys.
// Running it again only touches rows that still hold one of our full URLs.
//
//   node dist/scripts/migrateFileUrlsToKeys.js            # dry run
//   node dist/scripts/migrateFileUrlsToKeys.js --apply    # write
import config from "../config";
import prisma from "../shared/prisma";
import { toFileKey } from "../helpers/fileUrl";

const PAGE_SIZE = 1000;

// Every column that holds an uploaded file.
const FILE_FIELDS = [
  { model: "user", field: "avatar" },
  { model: "user", field: "cover" },
  { model: "userPhoto", field: "url" },
  { model: "contest", field: "banner" },
  { model: "recurringContest", field: "banner" },
  { model: "team", field: "badge" },
  { model: "product", field: "image" },
  { model: "chat", field: "fileUrl" },
];

const migrateField = async (model: string, field: string, apply: boolean) => {
  const table = (prisma as any)[model];
  let found = 0;
  let updated = 0;
  let cursor: string | undefined;

  for (;;) {
    // `where` compares the stored value, so this only finds rows still saved
    // as a full URL.
    const rows: { id: string; [field: string]: string }[] = await table.findMany({
      where: { [field]: { startsWith: "http" } },
      select: { id: true, [field]: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    for (const row of rows) {
      const url = row[field];
      const key = toFileKey(url);
      if (key === url) continue;

      found += 1;
      if (found === 1) console.log(`  e.g. ${url} -> ${key}`);
      if (apply) {
        // Only write if the value was not changed since it was read.
        const result = await table.updateMany({ where: { id: row.id, [field]: url }, data: { [field]: key } });
        updated += result.count;
      }
    }

    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }

  console.log(`${model}.${field}: ${found} to convert${apply ? `, ${updated} updated` : ""}`);
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(`Database: ${String(config.db).replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(apply ? "Mode: APPLY (writes changes)" : "Mode: dry run (no changes). Pass --apply to write.");

  for (const { model, field } of FILE_FIELDS) {
    await migrateField(model, field, apply);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
