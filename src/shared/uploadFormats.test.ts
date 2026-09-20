import assert from "node:assert/strict";
import test from "node:test";

import {
  isPhotoUploadMimeType,
  isWebImageMimeType,
  normalizeImageMimeType,
  photoUploadMimeTypes,
  webImageMimeTypes,
} from "./uploadFormats";

test("only image types are accepted", () => {
  const nonImages = [
    "application/pdf",
    "application/zip",
    "application/octet-stream",
    "text/html",
    "text/plain",
    "video/mp4",
    "audio/mpeg",
    "application/x-msdownload",
    "",
  ];

  nonImages.forEach((mimeType) => {
    assert.equal(isPhotoUploadMimeType(mimeType), false, `${mimeType} must not be a photo upload`);
    assert.equal(isWebImageMimeType(mimeType), false, `${mimeType} must not be a web image`);
  });
});

test("svg is rejected everywhere despite being an image", () => {
  // SVG can carry script and these files are served from our own domain, so an
  // accepted SVG would be a stored cross-site-scripting vector.
  ["image/svg+xml", "image/svg"].forEach((mimeType) => {
    assert.equal(isPhotoUploadMimeType(mimeType), false);
    assert.equal(isWebImageMimeType(mimeType), false);
  });
});

test("web imagery excludes formats browsers cannot render", () => {
  // An avatar stored as HEIC or TIFF uploads fine and then displays as a broken
  // image, so those belong to photography uploads only.
  ["image/heic", "image/heif", "image/tiff"].forEach((mimeType) => {
    assert.equal(isPhotoUploadMimeType(mimeType), true, `${mimeType} is valid photography`);
    assert.equal(isWebImageMimeType(mimeType), false, `${mimeType} is not web-renderable`);
  });
});

test("every web image type is also a valid photo upload", () => {
  webImageMimeTypes.forEach((mimeType) => {
    assert.ok(
      (photoUploadMimeTypes as readonly string[]).includes(mimeType),
      `${mimeType} must be accepted wherever photography is`
    );
  });
});

test("non-standard jpeg and png spellings are treated as the real type", () => {
  // Some browsers and older mobile clients report these for an ordinary file.
  assert.equal(normalizeImageMimeType("image/jpg"), "image/jpeg");
  assert.equal(normalizeImageMimeType("IMAGE/JPG"), "image/jpeg");
  assert.equal(normalizeImageMimeType(" image/pjpeg "), "image/jpeg");
  assert.equal(normalizeImageMimeType("image/x-png"), "image/png");

  assert.equal(isPhotoUploadMimeType("image/jpg"), true);
  assert.equal(isWebImageMimeType("image/jpg"), true);
});

test("matching is case and whitespace insensitive", () => {
  assert.equal(isPhotoUploadMimeType("IMAGE/PNG"), true);
  assert.equal(isWebImageMimeType("  image/WebP  "), true);
});
