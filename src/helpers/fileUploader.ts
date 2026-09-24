import multer from "multer";
import { v4 as uuidv4 } from "uuid";
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
import { isPhotoUploadMimeType, isWebImageMimeType, webImageMimeTypes } from "../shared/uploadFormats";
import { IMAGE_HEADER_SAMPLE_BYTES, readImageDimensionsFromBytes } from "./imageMetadata";
import ApiError from "../errors/ApiError";
import httpStatus from "http-status";
import logger from "../shared/logger";

dotenv.config();

const createS3Client = () => new S3Client({
  region: "us-east-1",
  endpoint: process.env.DO_SPACE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.DO_SPACE_ACCESS_KEY || "",
    secretAccessKey: process.env.DO_SPACE_SECRET_KEY || "",
  },
});

const getObjectUrl = (key: string) => process.env.DO_SPACE_ORIGIN_ENDPOINT
  ? `${process.env.DO_SPACE_ORIGIN_ENDPOINT}/${key}`
  : `${process.env.DO_SPACE_ENDPOINT}/${process.env.DO_SPACE_BUCKET}/${key}`;

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
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

// Spool uploads to temporary disk so concurrent large files cannot exhaust the
// Node.js heap. Upload helpers stream these files to object storage.
const temporaryUploadsDir = path.join(os.tmpdir(), "capture-award-uploads");
fs.mkdirSync(temporaryUploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, temporaryUploadsDir),
  filename: (_req, file, callback) => {
    const safeExtension = path.extname(file.originalname).slice(0, 16);
    callback(null, `${Date.now()}_${uuidv4()}${safeExtension}`);
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

export class S3StreamStorage implements multer.StorageEngine {
  constructor(
    private readonly keyPrefix: string,
    // Overridable so the engine can be exercised against a stub client.
    private readonly createClient: () => S3Client = createS3Client
  ) {}

  _handleFile(
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void
  ): void {
    const bucket = process.env.DO_SPACE_BUCKET;
    if (!bucket) {
      callback(new Error("DO_SPACE_BUCKET is not configured"));
      return;
    }

    const extension = path.extname(file.originalname).slice(0, 16);
    const key = `${this.keyPrefix}/${Date.now()}_${uuidv4()}${extension}`;
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

const contestImageStorage = new S3StreamStorage("captureaward");

const contestImageUpload = multer({
  storage: contestImageStorage,
  limits: {
    files: 4,
    fileSize: MAX_CONTEST_UPLOAD_SIZE,
  },
  fileFilter: photoImageFileFilter,
});
const profilePhotoUpload = multer({
  storage: contestImageStorage,
  limits: {
    files: 1,
    fileSize: MAX_PHOTO_UPLOAD_SIZE,
  },
  fileFilter: photoImageFileFilter,
});
const tradePhotoUpload = multer({
  storage: contestImageStorage,
  limits: {
    files: 1,
    fileSize: MAX_CONTEST_UPLOAD_SIZE,
  },
  fileFilter: photoImageFileFilter,
});
// Banners and other product imagery are rendered straight into an <img>, so the
// accepted set is the web-renderable one rather than the wider photography set.
const contestBannerUpload = multer({
  storage: contestImageStorage,
  limits: {
    files: 1,
    fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE,
  },
  fileFilter: webImageFileFilter,
});

// Avatars, covers, team badges, store artwork and editor images.
const webImageUpload = multer({
  storage: contestImageStorage,
  limits: {
    files: 1,
    fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE,
  },
  fileFilter: webImageFileFilter,
});

// Multi-file product/editor imagery.
const webImageMultiUpload = multer({
  storage: contestImageStorage,
  limits: {
    files: 15,
    fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE,
  },
  fileFilter: webImageFileFilter,
});

// Team match galleries hold submitted photography rather than product imagery.
const matchPhotoUpload = multer({
  storage: contestImageStorage,
  limits: {
    files: 4,
    fileSize: MAX_CONTEST_UPLOAD_SIZE,
  },
  fileFilter: photoImageFileFilter,
});

const filesystemUpload = multer({ storage, fileFilter: webImageFileFilter, limits: { fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE } });

// ✅ Fixed Cloudinary Storage
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {

    public_id: (req, file) => `${Date.now()}_${file.originalname}`,
  },
});

const cloudinaryUpload = multer({
  storage: cloudinaryStorage,
  fileFilter: webImageFileFilter,
  limits: { fileSize: MAX_WEB_IMAGE_UPLOAD_SIZE },
});

// Upload single image
const uploadSingle = webImageUpload.single("image");
const uploadFile = webImageUpload.single("file");

const uploadAvatar = webImageUpload.single("avatar")
const uploadCover = webImageUpload.single("cover")
const uploadBadge = webImageUpload.single("badge")
const contestBanner = contestBannerUpload.single("banner");
const userPhoto = contestImageUpload.single('photo')
// Contest entry supports up to four image parts. Mobile/web clients use several
// legitimate multipart names (`photo`, `photos`, `photos[]`, indexed names), so
// accept the field name here and enforce type/count through Multer and the
// contest submission rule instead of failing early with "Unexpected field".
const contestPhotos = contestImageUpload.any()
const tradePhoto = tradePhotoUpload.single("file")

// Upload multiple images
const uploadMultipleImage = webImageMultiUpload.fields([{ name: "images", maxCount: 15 }]);

// Upload team match photos (multiple files, limit validated in service)
const uploadTeamMatchPhotos = matchPhotoUpload.array('files', 4);

// ========== NAMED UPLOAD MIDDLEWARE ==========
// The `filesystem*` names are kept because routes across the app import them,
// but they no longer imply disk storage - like every other image upload they
// stream to object storage and enforce an image filter and a size cap.
const filesystemUploadBadge = webImageUpload.single("badge");
const filesystemUploadContestBanner = contestBannerUpload.single("banner");
const filesystemUploadUserPhoto = profilePhotoUpload.single('photo');
const filesystemUploadTradePhoto = tradePhotoUpload.single("file");
const filesystemUploadAvatar = webImageUpload.single("avatar");
const filesystemUploadCover = webImageUpload.single("cover");
const fileSystemUploaderProductImage = webImageUpload.single("image")
// Store product artwork, referenced by name instead of being built inline in
// the route so it cannot quietly go back to being unfiltered.
const productImage = webImageUpload.single("image")

const filesystemUploadMultipleImage = webImageMultiUpload.fields([{ name: "images", maxCount: 15 }]);

const filesystemUploadTeamMatchPhotos = matchPhotoUpload.array('files', 4);

// Upload profile and banner images
const updateProfile = webImageMultiUpload.fields([
  { name: "profile", maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);

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
        use_filename: true,
        unique_filename: false,
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

// ✅ Unchanged: DigitalOcean Upload
const uploadToDigitalOcean = async (file: Express.Multer.File) => {

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

  const s3Client = createS3Client();

  try {

    const Key = `captureaward/${Date.now()}_${uuidv4()}_${file.originalname}`;
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
  fileName: string,
  contentType: string,
  fileSize: number,
) => {
  const normalizedType = contentType.toLowerCase();
  if (!supportedContestImageMimeTypes.includes(normalizedType as typeof supportedContestImageMimeTypes[number])) {
    throw new ApiError(httpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported contest image format");
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_DIRECT_UPLOAD_SIZE) {
    throw new ApiError(httpStatus.BAD_REQUEST, "File size must be between 1 byte and 150MB");
  }
  const bucket = process.env.DO_SPACE_BUCKET;
  if (!bucket) throw new Error("DO_SPACE_BUCKET is not configured");

  const extension = path.extname(fileName).slice(0, 16);
  const key = `captureaward/direct/${userId}/${uuidv4()}${extension}`;
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
  const expectedPrefix = `captureaward/direct/${userId}/`;
  if (!key.startsWith(expectedPrefix) || key.includes("..")) {
    throw new ApiError(httpStatus.FORBIDDEN, "This upload does not belong to the current user");
  }
  const bucket = process.env.DO_SPACE_BUCKET;
  if (!bucket) throw new Error("DO_SPACE_BUCKET is not configured");

  const client = createS3Client();
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const contentType = object.ContentType?.toLowerCase() || "";
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
  uploadSingle,
  uploadMultipleImage,
  updateProfile,
  uploadFile,
  cloudinaryUpload,
  uploadToDigitalOcean,
  createDirectUploadUrl,
  confirmDirectUpload,
  deleteFromDigitalOcean,
  uploadToCloudinary,
  uploadToFilesystem,
  filesystemUpload,
  uploadAvatar,
  uploadBadge,
  filesystemUploadBadge,
  contestBanner,
  filesystemUploadContestBanner,
  uploadCover,
  filesystemUploadCover,
  userPhoto,
  contestPhotos,
  filesystemUploadUserPhoto,
  tradePhoto,
  filesystemUploadTradePhoto,
  filesystemUploadAvatar,
  uploadTeamMatchPhotos,
  filesystemUploadTeamMatchPhotos,
  filesystemUploadMultipleImage
};
