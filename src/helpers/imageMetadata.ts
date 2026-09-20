import fs from "fs";
import { imageSize } from "image-size";
import { normalizeImageMimeType } from "../shared/uploadFormats";

export type ImageDimensions = { width: number; height: number };

export type UploadedImageMetadata = {
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
};

// Every supported format carries its dimensions in a header far smaller than
// this, so validation never needs the whole image in memory.
export const IMAGE_HEADER_SAMPLE_BYTES = 128 * 1024;

export const readImageDimensionsFromBytes = (input?: Buffer | null): ImageDimensions | null => {
  if (!input || input.length === 0) {
    return null;
  }

  try {
    const dimensions = imageSize(input);
    if (dimensions.width && dimensions.height) {
      return { width: dimensions.width, height: dimensions.height };
    }
  } catch {
    return null;
  }

  return null;
};

/**
 * Reads dimensions from whichever representation the upload middleware left
 * behind: a streamed upload keeps only its leading bytes, a disk-spooled one
 * exposes a path, and an in-memory one exposes a buffer.
 */
export const readImageDimensions = (file: Express.Multer.File): ImageDimensions | null => {
  const sampled = file.headerBuffer || file.buffer;
  if (sampled) {
    return readImageDimensionsFromBytes(sampled);
  }

  if (!file.path) {
    return null;
  }

  try {
    const descriptor = fs.openSync(file.path, "r");
    try {
      const sampleSize = Math.min(file.size || IMAGE_HEADER_SAMPLE_BYTES, IMAGE_HEADER_SAMPLE_BYTES);
      const header = Buffer.allocUnsafe(sampleSize);
      const bytesRead = fs.readSync(descriptor, header, 0, sampleSize, 0);
      return readImageDimensionsFromBytes(header.subarray(0, bytesRead));
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return null;
  }
};

/** The metadata persisted alongside a stored photo. */
export const describeUploadedImage = (file: Express.Multer.File): UploadedImageMetadata => {
  const dimensions = readImageDimensions(file);

  return {
    mimeType: file.mimetype ? normalizeImageMimeType(file.mimetype) : null,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    sizeBytes: Number.isFinite(file.size) ? file.size : null,
  };
};
