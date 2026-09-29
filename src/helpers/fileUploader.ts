import multer from "multer";
import type { Request } from "express";
import { v4 as uuidv4 } from "uuid";
import { ObjectId } from "mongodb";
import path from "path";
import fs from "fs";
import os from "os";
import { Transform } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import streamifier from "streamifier";
import dotenv from "dotenv";
import { supportedContestImageMimeTypes } from "../app/modules/Contest/ContestRules/contestRule.definitions";
import { isPhotoUploadMimeType, isWebImageMimeType, normalizeImageMimeType, webImageMimeTypes } from "../shared/uploadFormats";
import { IMAGE_HEADER_SAMPLE_BYTES, readImageDimensionsFromBytes } from "./imageMetadata";
import ApiError from "../errors/ApiError";
import httpStatus from "http-status";
import logger from "../shared/logger";
import { buildFileUrl, toFileKey } from "./fileUrl";

dotenv.config();

const createS3Client = () => new S3Client({
  region: "us-east-1",
  endpoint: process.env.DO_SPACE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.DO_SPACE_ACCESS_KEY || "",
    secretAccessKey: process.env.DO_SPACE_SECRET_KEY || "",
  },
});

const getObjectUrl = (key: string) => buildFileUrl(key);

// Configure DigitalOcean Spaces


// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ========== FILESYSTEM STORAGE CONFIGURATION ==========
// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Filesystem storage configuration
const filesystemStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, _file, cb) => {
    cb(null, uuidv4());
  }
});

// Spool uploads to temporary disk so concurrent large files cannot exhaust the
// Node.js heap. Upload helpers stream these files to object storage.
const temporaryUploadsDir = path.join(os.tmpdir(), "capture-award-uploads");
fs.mkdirSync(temporaryUploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, temporaryUploadsDir),
  filename: (_req, _file, callback) => {
    callback(null, uuidv4());
  },
});
// Standalone profile-pool uploads retain their existing 25MB cap. Contest
// entries, trade-ins, and contest banners allow files up to 150MB.
const MAX_PHOTO_UPLOAD_SIZE = 25 * 1024 * 1024;
const MAX_CONTEST_UPLOAD_SIZE = 150 * 1024 * 1024;
// Avatars, covers, badges, banners and store artwork are display assets, not
// archival photography, so they get a much tighter cap.
const MAX_WEB_IMAGE_UPLOAD_SIZE = 25 * 1024 * 1024;

// Every upload middleware in this file runs one of these two filters. Nothing
// reaches storage without passing one, so a non-image file can never be stored
// no matter which endpoint it is posted to.
const photoImageFileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  if (isPhotoUploadMimeType(file.mimetype)) {
    callback(null, true);
    return;
  }
  callback(new ApiError(
    httpStatus.UNSUPPORTED_MEDIA_TYPE,
    `Only image files are allowed (${supportedContestImageMimeTypes.join(", ")})`
  ));
};

const webImageFileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  if (isWebImageMimeType(file.mimetype)) {
    callback(null, true);
    return;
  }
  callback(new ApiError(
    httpStatus.UNSUPPORTED_MEDIA_TYPE,
    `Only image files are allowed (${webImageMimeTypes.join(", ")})`
  ));
};

// Legacy generic uploader. It keeps disk spooling for callers that still read
// `file.path`, but it is no longer unfiltered: an image filter and size cap
// apply here too.
const upload = multer({
  storage,
  fileFilter: webImageFileFilter,
  limits: { fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE },
});

// ========== DIRECT-TO-OBJECT-STORAGE STREAMING ==========
// Images are piped from the request socket straight into a Spaces multipart
// upload. Nothing is buffered in the heap and nothing is spooled to disk, so a
// four-file 150MB entry costs roughly `parallelParts * S3_STREAM_PART_SIZE` of
// RAM per file instead of the whole payload. The first slice of each stream is
// retained so rule validation can still read image dimensions without a second
// read of the object.
const S3_STREAM_PART_SIZE = 5 * 1024 * 1024;
const S3_STREAM_QUEUE_SIZE = 1;
const HEADER_SAMPLE_BYTES = 128 * 1024;

export type StreamedUploadInfo = {
  bucket: string;
  key: string;
  location: string;
  size: number;
  headerBuffer: Buffer;
};

const isStreamedUpload = (file: Express.Multer.File): boolean =>
  typeof (file as Partial<StreamedUploadInfo>).key === "string" &&
  typeof (file as Partial<StreamedUploadInfo>).location === "string";

// Picks the folder an upload is stored in, e.g. "users/<id>/avatar".
export type UploadFolder = (req: Request) => string;

// Object names never contain user-controlled names. Content-Type carries the
// media format, so an extension is unnecessary and the final segment can stay
// an exact UUID.
export const buildStorageKey = (folder: string) => `${folder}/${uuidv4()}`;

export class S3StreamStorage implements multer.StorageEngine {
  constructor(
    private readonly folder: UploadFolder,
    // Overridable so the engine can be exercised against a stub client.
    private readonly createClient: () => S3Client = createS3Client
  ) {}

  _handleFile(
    req: Express.Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void
  ): void {
    const bucket = process.env.DO_SPACE_BUCKET;
    if (!bucket) {
      callback(new Error("DO_SPACE_BUCKET is not configured"));
      return;
    }

    const key = buildStorageKey(this.folder(req as Request));
    const client = this.createClient();

    let size = 0;
    let headerBytes = 0;
    const headerChunks: Buffer[] = [];

    // Measuring inside a Transform keeps the uploader's backpressure intact: a
    // bare `data` listener would let bytes accumulate faster than S3 accepts
    // them, which is the heap pressure this engine exists to avoid.
    const body = new Transform({
      transform(chunk: Buffer, _encoding, next) {
        size += chunk.length;
        if (headerBytes < HEADER_SAMPLE_BYTES) {
          const slice = chunk.subarray(0, HEADER_SAMPLE_BYTES - headerBytes);
          headerChunks.push(Buffer.from(slice));
          headerBytes += slice.length;
        }
        next(null, chunk);
      },
    });

    file.stream.on("error", (error: Error) => body.destroy(error));
    file.stream.pipe(body);

    const uploader = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ACL: "public-read" as ObjectCannedACL,
        ContentType: file.mimetype,
      },
      // Bound the in-flight bytes. Multer already caps concurrent files, so the
      // worst case is files * queueSize * partSize rather than files * fileSize.
      queueSize: S3_STREAM_QUEUE_SIZE,
      partSize: S3_STREAM_PART_SIZE,
      leavePartsOnError: false,
    });

    uploader.done().then(
      () => {
        client.destroy();
        // Multer removes this object through `_removeFile` when the request is
        // aborted (size limit, rejected sibling file, client disconnect).
        callback(null, {
          bucket,
          key,
          recordId: req.newRecordId,
          location: getObjectUrl(key),
          size,
          headerBuffer: Buffer.concat(headerChunks),
        });
      },
      async (error) => {
        await uploader.abort().catch(() => undefined);
        client.destroy();
        // Nothing is reading the request body any more. Drain it so Busboy can
        // finish parsing the multipart stream and Multer can report the error,
        // instead of the connection hanging on backpressure.
        file.stream.unpipe(body);
        file.stream.resume();
        body.destroy();
        callback(error);
      }
    );
  }

  _removeFile(
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void
  ): void {
    const key = (file as Partial<StreamedUploadInfo>).key;
    if (!key) {
      callback(null);
      return;
    }
    deleteFromDigitalOcean(key).then(
      () => callback(null),
      () => callback(null)
    );
  }
}

// ========== FOLDERS ==========
// Every upload is stored under the record it belongs to:
//   users/<userId>/avatar/<uuid>
//   teams/<teamId>/badge/<uuid>
// The file name is always new, so a replaced image gets a new URL and no
// CDN or browser cache keeps showing the old one.

export const userFolder = (name: string): UploadFolder => (req) => `users/${req.user.id}/${name}`;

// Update routes have the record id in the URL (e.g. /teams/:teamId). Create
// routes have no record yet, so a new id is made here and kept on the request;
// the service then creates the record with that id (file.recordId).
export const recordFolder = (collection: string, param: string, name: string): UploadFolder => (req) => {
  const id = req.params?.[param] || (req.newRecordId ??= new ObjectId().toHexString());
  return `${collection}/${id}/${name}`;
};

// Photography (gallery, contest entries, trades) accepts the wide photo format
// set; everything rendered straight into an <img> accepts web formats only.
const photoUpload = (folder: UploadFolder, files: number, fileSize: number) => multer({
  storage: new S3StreamStorage(folder),
  limits: { files, fileSize },
  fileFilter: photoImageFileFilter,
});

const webImageUpload = (folder: UploadFolder) => multer({
  storage: new S3StreamStorage(folder),
  limits: { files: 1, fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE },
  fileFilter: webImageFileFilter,
});

const filesystemUpload = multer({ storage, fileFilter: webImageFileFilter, limits: { fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE } });

// ✅ Fixed Cloudinary Storage
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    public_id: () => uuidv4(),
  },
});

const cloudinaryUpload = multer({
  storage: cloudinaryStorage,
  fileFilter: webImageFileFilter,
  limits: { fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE },
});

// ========== UPLOAD MIDDLEWARE ==========
// The `filesystem*` names are kept because routes import them; like every
// upload here they stream to object storage.
const filesystemUploadAvatar = webImageUpload(userFolder("avatar")).single("avatar");
const filesystemUploadCover = webImageUpload(userFolder("cover")).single("cover");
const filesystemUploadUserPhoto = photoUpload(userFolder("photos"), 1, MAX_PHOTO_UPLOAD_SIZE).single("photo");
// Contest entry supports up to four image parts. Mobile/web clients use several
// legitimate multipart names (`photo`, `photos`, `photos[]`, indexed names), so
// accept the field name here and enforce type/count through Multer and the
// contest submission rule instead of failing early with "Unexpected field".
const contestPhotos = photoUpload(userFolder("photos"), 4, MAX_CONTEST_UPLOAD_SIZE).any();
const tradePhoto = photoUpload(userFolder("photos"), 1, MAX_CONTEST_UPLOAD_SIZE).single("file");
const chatFile = webImageUpload(userFolder("chat")).single("file");
const filesystemUploadBadge = webImageUpload(recordFolder("teams", "teamId", "badge")).single("badge");
// Recurring contests use the same folder; the contests they create reuse the file.
const contestBanner = webImageUpload(recordFolder("contests", "contestId", "banner")).single("banner");
const productImage = webImageUpload(recordFolder("products", "productId", "image")).single("image");

// ✅ Fixed Cloudinary Upload (Now supports buffer)
const uploadToCloudinary = async (file: Express.Multer.File): Promise<{ Location: string; public_id: string }> => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "uploads",
        resource_type: "auto", // Supports images, videos, etc.
        public_id: uuidv4(),
      },
      (error, result) => {
        if (error) {
          logger.error({ err: error }, "Failed to upload file to Cloudinary");
          return reject(error);
        }

        // ✅ Explicitly return `Location` and `public_id`
        resolve({
          Location: result?.secure_url || "", // Cloudinary URL
          public_id: result?.public_id || "",
        });
      }
    );

    // Convert buffer to stream and upload
    const source = file.path
      ? fs.createReadStream(file.path)
      : streamifier.createReadStream(file.buffer);
    source.on("error", reject);
    source.pipe(uploadStream);
  });
};

// DigitalOcean upload
const uploadToDigitalOcean = async (file: Express.Multer.File, folder?: string) => {

  if (!file) {
    throw new Error("File is required for uploading.");
  }

  // Streaming middleware already wrote this file to Spaces while the request
  // body was being read - adopt that object instead of uploading it twice.
  if (isStreamedUpload(file)) {
    const streamed = file as unknown as StreamedUploadInfo;
    return {
      Location: streamed.location,
      Bucket: streamed.bucket,
      Key: streamed.key,
    };
  }

  // Non-streaming callers must name the owning resource explicitly. This
  // prevents a generic, unstructured bucket prefix from returning later.
  if (!folder) {
    throw new Error("A structured storage folder is required for this upload");
  }

  const s3Client = createS3Client();

  try {

    const Key = buildStorageKey(folder);
    const uploadParams = {
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
      Body: file.path ? fs.createReadStream(file.path) : file.buffer,
      ACL: "public-read" as ObjectCannedACL,
      ContentType: file.mimetype,
    };

    // Upload file to DigitalOcean Spaces
    await s3Client.send(new PutObjectCommand(uploadParams));


    // Format the URL using origin endpoint if configured (e.g. for custom domain/CDN or virtual hosting)
    const fileURL = getObjectUrl(Key);
    return {
      Location: fileURL,
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to upload file to DigitalOcean");
    throw error;
  } finally {
    s3Client.destroy()
    if (file.path) {
      await fs.promises.unlink(file.path).catch(() => undefined);
    }
  }


};

const MAX_DIRECT_UPLOAD_SIZE = 150 * 1024 * 1024;

const createDirectUploadUrl = async (
  userId: string,
  _fileName: string,
  contentType: string,
  fileSize: number,
) => {
  const normalizedType = normalizeImageMimeType(contentType);
  if (!supportedContestImageMimeTypes.includes(normalizedType as typeof supportedContestImageMimeTypes[number])) {
    throw new ApiError(httpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported contest image format");
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_DIRECT_UPLOAD_SIZE) {
    throw new ApiError(httpStatus.BAD_REQUEST, "File size must be between 1 byte and 150MB");
  }
  const bucket = process.env.DO_SPACE_BUCKET;
  if (!bucket) throw new Error("DO_SPACE_BUCKET is not configured");

  const key = buildStorageKey(`users/${userId}/photos`);
  const client = createS3Client();
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ACL: "public-read",
      ContentType: normalizedType,
      ContentLength: fileSize,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    return {
      uploadUrl,
      key,
      expiresIn: 300,
      headers: { "Content-Type": normalizedType, "x-amz-acl": "public-read" },
    };
  } finally {
    client.destroy();
  }
};

// Reads just enough of a stored object to determine its pixel dimensions.
// Used where the bytes never passed through this process - presigned uploads,
// and photos stored before dimensions were recorded.
const readStoredImageDimensions = async (key: string) => {
  const bucket = process.env.DO_SPACE_BUCKET;
  if (!bucket || !key) return null;

  const client = createS3Client();
  try {
    const object = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${IMAGE_HEADER_SAMPLE_BYTES - 1}`,
    }));
    const body = object.Body as NodeJS.ReadableStream | undefined;
    if (!body) return null;

    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    return readImageDimensionsFromBytes(Buffer.concat(chunks));
  } catch (error) {
    logger.error({ err: error, key }, "Failed to read image dimensions");
    return null;
  } finally {
    client.destroy();
  }
};

const confirmDirectUpload = async (userId: string, key: string) => {
  const expectedPrefix = `users/${userId}/photos/`;
  const filename = key.slice(expectedPrefix.length);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!key.startsWith(expectedPrefix) || !uuidPattern.test(filename)) {
    throw new ApiError(httpStatus.FORBIDDEN, "This upload does not belong to the current user");
  }
  const bucket = process.env.DO_SPACE_BUCKET;
  if (!bucket) throw new Error("DO_SPACE_BUCKET is not configured");

  const client = createS3Client();
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const contentType = normalizeImageMimeType(object.ContentType || "");
    const contentLength = object.ContentLength || 0;
    if (!supportedContestImageMimeTypes.includes(contentType as typeof supportedContestImageMimeTypes[number])) {
      throw new ApiError(httpStatus.UNSUPPORTED_MEDIA_TYPE, "Uploaded object is not a supported image");
    }
    if (contentLength <= 0 || contentLength > MAX_DIRECT_UPLOAD_SIZE) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Uploaded object exceeds the 150MB limit");
    }
    const dimensions = await readStoredImageDimensions(key);

    return {
      Location: getObjectUrl(key),
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
      Width: dimensions?.width ?? null,
      Height: dimensions?.height ?? null,
    };
  } finally {
    client.destroy();
  }
};

const deleteFromDigitalOcean = async (key: string) => {
  const bucket = process.env.DO_SPACE_BUCKET;
  if (!bucket || !key) return;
  const client = createS3Client();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } finally {
    client.destroy();
  }
};

// Deletes the file a record used before it got a new one. Only a file in the
// record's own folder is deleted: a banner picked from a user's photo, a banner
// shared by the contests of a recurring contest, default images and files
// uploaded before structured keys all live elsewhere and are kept.
const deleteReplacedFile = async (oldValue: string | null | undefined, folder: string) => {
  const key = oldValue ? toFileKey(oldValue) : null;
  if (!key?.startsWith(`${folder}/`)) return;
  await deleteFromDigitalOcean(key).catch((error) => {
    logger.error({ err: error, key }, "Failed to delete replaced file");
  });
};

// ✅ Redirected to DigitalOcean Upload
const uploadToFilesystem = async (file: Express.Multer.File): Promise<{ Location: string; filename: string }> => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  try {
    // Forward directly to DigitalOcean Spaces
    const result = await uploadToDigitalOcean(file);
    return {
      Location: result.Location,
      filename: result.Key,
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to upload file to DigitalOcean from filesystem");
    throw error;
  }
};

// Releases bytes an upload middleware already persisted when the request that
// carried them ends up rejected. Streaming uploads land in Spaces before any
// business rule runs, so every failure path after the middleware must discard
// what it is not going to reference, or the object leaks.
const markUploadClaimed = (file?: Express.Multer.File) => {
  if (file) file.claimed = true;
};

const discardUploadedFile = async (file?: Express.Multer.File) => {
  if (!file || file.claimed) return;
  if (file.key) {
    await deleteFromDigitalOcean(file.key).catch(() => undefined);
    return;
  }
  if (file.path) {
    await fs.promises.unlink(file.path).catch(() => undefined);
  }
};

const discardUploadedFiles = async (files?: Express.Multer.File[]) => {
  if (!files?.length) return;
  await Promise.all(files.map((file) => discardUploadedFile(file)));
};

// ✅ No Name Changes, Just Fixes
export const fileUploader = {
  productImage,
  readStoredImageDimensions,
  markUploadClaimed,
  discardUploadedFile,
  discardUploadedFiles,
  upload,
  cloudinaryUpload,
  uploadToDigitalOcean,
  createDirectUploadUrl,
  confirmDirectUpload,
  deleteFromDigitalOcean,
  deleteReplacedFile,
  uploadToCloudinary,
  uploadToFilesystem,
  filesystemUpload,
  chatFile,
  filesystemUploadBadge,
  contestBanner,
  filesystemUploadCover,
  contestPhotos,
  filesystemUploadUserPhoto,
  tradePhoto,
  filesystemUploadAvatar,
};
