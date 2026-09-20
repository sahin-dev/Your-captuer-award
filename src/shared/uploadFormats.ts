// Single source of truth for what "an image file" means on this platform.
//
// The frontend (your_capture_awards) and dashboard (your_capture_awards_dashboard)
// mirror these lists in their own upload constants. Changing a list here means
// changing it in all three places, otherwise a client offers the user a file the
// server will reject.

/**
 * Photography accepted for contest entries, trades and the user's photo pool.
 * These are the user's original work and may arrive in a format browsers cannot
 * render directly - HEIC straight off an iPhone, TIFF straight off a camera.
 */
export const photoUploadMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
] as const;

/**
 * Imagery the product renders directly in an `<img>`: avatars, covers, team
 * badges, contest banners, store artwork, rich-text editor images. HEIC, HEIF
 * and TIFF are excluded here because most browsers will not display them, so
 * accepting one produces an upload that silently appears broken.
 */
export const webImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

// SVG is deliberately absent from both lists. It is an image format, but it can
// carry script and these files are served from our own domain, so an uploaded
// SVG is a stored cross-site-scripting vector.

export type PhotoUploadMimeType = typeof photoUploadMimeTypes[number];
export type WebImageMimeType = typeof webImageMimeTypes[number];

// `image/jpg` is not a registered media type, but some browsers and older
// mobile clients still send it for a .jpg. Treat it as the jpeg it actually is
// rather than rejecting a perfectly ordinary photo.
const mimeTypeAliases: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

export const normalizeImageMimeType = (mimeType: string) => {
  const normalized = mimeType.trim().toLowerCase();
  return mimeTypeAliases[normalized] || normalized;
};

export const isPhotoUploadMimeType = (mimeType: string) =>
  (photoUploadMimeTypes as readonly string[]).includes(normalizeImageMimeType(mimeType));

export const isWebImageMimeType = (mimeType: string) =>
  (webImageMimeTypes as readonly string[]).includes(normalizeImageMimeType(mimeType));
