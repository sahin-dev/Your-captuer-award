// Uploaded files are saved in the database as their storage key, for example
// "users/<userId>/avatar/<uuid>". The full URL is built only when data is
// read (see the prisma extension in shared/prisma.ts), so the storage domain
// can change without rewriting any rows.

const originUrl = () => process.env.DO_SPACE_ORIGIN_ENDPOINT;
const bucketUrl = () => `${process.env.DO_SPACE_ENDPOINT}/${process.env.DO_SPACE_BUCKET}`
const cdnUrl = () => process.env.DO_SPACE_CDN_ENDPOINT;

const isFullUrl = (value: string) => /^https?:\/\//i.test(value);

// Key -> full URL. A value that is already a full URL (default images, rows
// saved before keys were used) is returned unchanged.
export function buildFileUrl(value: string): string;
export function buildFileUrl(value: string | null): string | null;
export function buildFileUrl(value: string | null) {
  if (!value || isFullUrl(value)) return value;
  return `${cdnUrl()}/${value}`;
}

// Full URL of one of our uploaded files -> key. Anything else (a key already,
// or a URL from another site) is returned unchanged.
export function toFileKey(value: string): string;
export function toFileKey(value: string | null): string | null;
export function toFileKey(value: string | null) {
  if (!value) return value;
  for (const base of [originUrl(), bucketUrl(), cdnUrl()]) {
    if (base && value.startsWith(`${base}/`)) return value.slice(base.length + 1);
  }
  return value;
}
