import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import streamifier from "streamifier"; 
import dotenv from "dotenv";

dotenv.config();

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

const filesystemUpload = multer({ storage: filesystemStorage });

// Multer configuration using memoryStorage (for DigitalOcean & Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Fixed Cloudinary Storage
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
  
    public_id: (req, file) => `${Date.now()}_${file.originalname}`,
  },
});

const cloudinaryUpload = multer({ storage: cloudinaryStorage });

// Upload single image
const uploadSingle = upload.single("image");
const uploadFile = upload.single("file");

const uploadAvatar = upload.single("avatar")
const uploadCover = upload.single("cover")
const uploadBadge = upload.single("badge")
const contestBanner = upload.single("banner");
const userPhoto = upload.single('photo')
const tradePhoto = upload.single("tradePhoto")

// Upload multiple images
const uploadMultipleImage = upload.fields([{ name: "images", maxCount: 15 }]);

// Upload team match photos (multiple files, limit validated in service)
const uploadTeamMatchPhotos = upload.array('files', 4);

// ========== FILESYSTEM MIDDLEWARE VERSIONS ==========
// Filesystem storage single file uploads
const filesystemUploadBadge = filesystemUpload.single("badge");
const filesystemUploadContestBanner = filesystemUpload.single("banner");
const filesystemUploadUserPhoto = filesystemUpload.single('photo');
const filesystemUploadTradePhoto = filesystemUpload.single("tradePhoto");
const filesystemUploadAvatar = filesystemUpload.single("avatar");
const filesystemUploadCover = filesystemUpload.single("cover");
const fileSystemUploaderProductImage = filesystemUpload.single("image")

// Filesystem storage multiple file uploads
const filesystemUploadMultipleImage = filesystemUpload.fields([{ name: "images", maxCount: 15 }]);

// Filesystem storage team match photos
const filesystemUploadTeamMatchPhotos = filesystemUpload.array('files', 4);

// Upload profile and banner images
const updateProfile = upload.fields([
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
          console.error("Error uploading file to Cloudinary:", error);
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
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

// ✅ Unchanged: DigitalOcean Upload
const uploadToDigitalOcean = async (file: Express.Multer.File) => {

  if (!file) {
    throw new Error("File is required for uploading.");
  }
  const s3Client = new S3Client({
      region: "us-east-1",
      endpoint: process.env.DO_SPACE_ENDPOINT,
      credentials: {
        accessKeyId: process.env.DO_SPACE_ACCESS_KEY || "",
        secretAccessKey: process.env.DO_SPACE_SECRET_KEY || "",
      },
    });

  try {
    
    const Key = `captureaward/${Date.now()}_${uuidv4()}_${file.originalname}`;
    const uploadParams = {
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
      Body: file.buffer, // ✅ Use buffer instead of file path
      ACL: "public-read" as ObjectCannedACL,
      ContentType: file.mimetype,
    };

    // Upload file to DigitalOcean Spaces
    await s3Client.send(new PutObjectCommand(uploadParams));
  

    // Format the URL
    const fileURL = `${process.env.DO_SPACE_ENDPOINT}/${process.env.DO_SPACE_BUCKET}/${Key}`;
    return {
      Location: fileURL,
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
    };
  } catch (error) {
    console.error("Error uploading file to DigitalOcean:", error);
    throw error;
  }finally {
    s3Client.destroy()
  }
  
  
};

// ✅ Filesystem Upload Function
const uploadToFilesystem = async (file: Express.Multer.File): Promise<{ Location: string; filename: string }> => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  try {
    // File is already saved by multer diskStorage middleware
    const relativePath = `/uploads/${file.filename}`;
    const fullPath = path.join(uploadsDir, file.filename);

    // Verify file exists
    if (!fs.existsSync(fullPath)) {
      throw new Error("File failed to upload to filesystem.");
    }

    // Prefix with BASE_URL for full URL
    const fullUrl = `${process.env.BASE_URL}${relativePath}`;

    return {
      Location: fullUrl,  // Full URL with BASE_URL prefix
      filename: file.filename,
    };
  } catch (error) {
    console.error("Error uploading file to filesystem:", error);
    throw error;
  }
};

// ✅ No Name Changes, Just Fixes
export const fileUploader = {
  upload,
  uploadSingle,
  uploadMultipleImage,
  updateProfile,
  uploadFile,
  cloudinaryUpload,
  uploadToDigitalOcean,
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
  filesystemUploadUserPhoto,
  tradePhoto,
  filesystemUploadTradePhoto,
  filesystemUploadAvatar,
  uploadTeamMatchPhotos,
  filesystemUploadTeamMatchPhotos,
  filesystemUploadMultipleImage
};
