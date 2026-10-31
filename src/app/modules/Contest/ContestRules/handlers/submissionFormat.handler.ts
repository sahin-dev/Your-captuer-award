import httpStatus from "http-status";
import ApiError from "../../../../../errors/ApiError";
import { readImageDimensions as getImageDimensions } from "../../../../../helpers/imageMetadata";
import prisma from "../../../../../shared/prisma";
import { normalizeImageMimeType } from "../../../../../shared/uploadFormats";
import { SubmissionFormatValue } from "../contestRule.definitions";
import { RuleHandler } from "./ruleHandler";

// A submission can arrive as freshly uploaded files or as ids of photos the
// user already has in their gallery. Both are checked against the same rule -
// otherwise uploading to the gallery first would be a way around the contest's
// allowed formats, minimum resolution and size cap.
type SubmissionCandidate = {
  label: string;
  mimeType: string | null;
  sizeBytes: number | null;
  dimensions: { width: number; height: number } | null;
};

const describeFileCandidate = (file: Express.Multer.File): SubmissionCandidate => ({
  label: file.originalname,
  mimeType: file.mimetype ? normalizeImageMimeType(file.mimetype) : null,
  sizeBytes: Number.isFinite(file.size) ? file.size : null,
  dimensions: getImageDimensions(file),
});

// Photos uploaded before format metadata was recorded carry none of it, and
// there is no fair way to hold an existing gallery to a rule that did not exist
// when those photos were stored. They are grandfathered: submitted as-is, with
// no format, resolution or size check. Everything uploaded from now on records
// its metadata at upload time and is checked normally.
const describeStoredPhotoCandidate = (photo: {
  id: string;
  title: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
}): SubmissionCandidate | null => {
  if (!photo.mimeType || !photo.width || !photo.height) {
    return null;
  }

  return {
    label: photo.title || "photo",
    mimeType: normalizeImageMimeType(photo.mimeType),
    sizeBytes: photo.sizeBytes,
    dimensions: { width: photo.width, height: photo.height },
  };
};

const loadCandidates = async (files: Express.Multer.File[], photoIds: string[]) => {
  const storedPhotos = photoIds.length > 0
    ? await prisma.userPhoto.findMany({
        where: { id: { in: photoIds } },
        select: { id: true, title: true, mimeType: true, width: true, height: true, sizeBytes: true },
      })
    : [];

  return [
    ...files.map(describeFileCandidate),
    // Grandfathered photos describe as null and drop out here.
    ...storedPhotos.flatMap((photo) => {
      const candidate = describeStoredPhotoCandidate(photo);
      return candidate ? [candidate] : [];
    }),
  ];
};

const assertCandidateAllowed = (candidate: SubmissionCandidate, format: SubmissionFormatValue) => {
  const allowedMimeTypes = format.mimeTypes.map(normalizeImageMimeType);
  const maxSizeBytes = format.maxSizeMB * 1024 * 1024;

  if (!candidate.mimeType || !allowedMimeTypes.includes(candidate.mimeType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${candidate.label}: photo format is not allowed for this contest`);
  }
  if (candidate.sizeBytes !== null && candidate.sizeBytes > maxSizeBytes) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${candidate.label}: photo size must be ${format.maxSizeMB}MB or less`);
  }
  if (!candidate.dimensions) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${candidate.label}: unable to read photo dimensions`);
  }
  if (candidate.dimensions.width < format.minWidth || candidate.dimensions.height < format.minHeight) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${candidate.label}: photo resolution must be at least ${format.minWidth}px x ${format.minHeight}px`,
    );
  }
};

export const submissionFormatHandler: RuleHandler<SubmissionFormatValue> = {
  summarize(format) {
    const mimeTypes = Array.isArray(format?.mimeTypes) ? format.mimeTypes : [];
    const formats = mimeTypes.map((mimeType) => mimeType.replace("image/", "").toUpperCase()).join(", ");
    return `${formats}, minimum resolution of ${format?.minWidth}px x ${format?.minHeight}px, maximum size ${format?.maxSizeMB}MB`;
  },

  async onUpload({ files, photoIds }, format) {
    if (files.length === 0 && photoIds.length === 0) {
      return;
    }
    const candidates = await loadCandidates(files, photoIds);
    candidates.forEach((candidate) => assertCandidateAllowed(candidate, format));
  },
};
