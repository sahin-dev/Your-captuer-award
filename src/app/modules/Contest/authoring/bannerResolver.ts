import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { fileUploader } from "../../../../helpers/fileUploader";
import { toFileKey } from "../../../../helpers/fileUrl";
import prisma from "../../../../shared/prisma";

// When the admin picks an existing user-submitted photo as the banner instead of
// uploading a fresh image, resolve its URL and credit the uploading user so the
// website can show attribution on the contest card.
const findBannerFromUserPhoto = async (userPhotoId: string) => {
  const userPhoto = await prisma.userPhoto.findUnique({
    where: { id: userPhotoId },
    select: { url: true, userId: true },
  });
  if (!userPhoto) {
    throw new ApiError(httpstatus.NOT_FOUND, "Selected user photo not found");
  }
  return { banner: toFileKey(userPhoto.url), bannerUploaderId: userPhoto.userId };
};

// A banner comes from one of three places: a picked photo, an uploaded file, or
// neither. Returns the fields to save, which is empty when the banner did not
// change. A file sent together with a picked photo is thrown away.
export const resolveBanner = async (userPhotoId?: string, file?: Express.Multer.File) => {
  if (userPhotoId) {
    const picked = await findBannerFromUserPhoto(userPhotoId);
    if (file) {
      await fileUploader.discardUploadedFile(file);
    }
    return picked;
  }

  if (file) {
    const uploaded = await fileUploader.uploadToDigitalOcean(file);
    return { banner: uploaded.Key, bannerUploaderId: null };
  }

  return {};
};
