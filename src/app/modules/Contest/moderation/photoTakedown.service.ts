import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { fileUploader } from "../../../../helpers/fileUploader";
import { toFileKey } from "../../../../helpers/fileUrl";
import { escapeHtml } from "../../../../shared/html";
import logger from "../../../../shared/logger";
import { sendMail } from "../../../../shared/mailSender";
import prisma from "../../../../shared/prisma";
import { runWithWriteConflictRetry } from "../../../../shared/transactionRetry";
import { ContestStatus } from "../../../../prismaClient";
import { publishEvent } from "../../../event/domainEvents";
import { notificationOrchestrator } from "../../Notification/notificationOrchestrator";
import { profileCache } from "../../Profile/profile.cache";
import { contestCache } from "../contest.cache";

// Same image as the `banner` default in prisma/contest.prisma. A contest whose
// banner was picked from the removed photo falls back to it, because the
// website renders the banner with next/image and cannot take an empty value.
export const DEFAULT_CONTEST_BANNER =
    "https://images.unsplash.com/photo-1689539137236-b68e436248de?q=80&w=1171&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"

const isFullUrl = (value: string) => /^https?:\/\//i.test(value)

// Storage key of one of our uploads, or null for an external URL we must not delete.
const ownStorageKey = (value: string | null | undefined) => {
    const key = value ? toFileKey(value) : null
    return key && !isFullUrl(key) ? key : null
}

const unique = <T>(values: T[]) => Array.from(new Set(values))

const buildPhotoTakenDownEmail = (ownerName: string, photoTitle: string | null, reason?: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 2px solid #0056b3; padding-bottom: 15px;">
          <h2 style="color: #0056b3; margin: 0;">Photo Removed</h2>
        </div>
        <div style="padding: 20px 0; line-height: 1.6; color: #333;">
          <p>Dear <strong>${escapeHtml(ownerName)}</strong>,</p>
          <p>Your photo${photoTitle ? ` <strong>"${escapeHtml(photoTitle)}"</strong>` : ""} has been removed from the platform by an admin after a review.
          It has been taken out of your gallery and every contest it was entered in.</p>
          ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
          <p>If you believe this was a mistake, please contact support.</p>
        </div>
      </div>
    `

export type PhotoTakedownResult = {
    userPhotoId: string
    ownerId: string
    affectedContestIds: string[]
    affectedContestPhotoIds: string[]
    resetBannerContestIds: string[]
}

// Admin takedown (e.g. a confirmed copyright claim): removes a gallery photo from
// the whole platform, not just from one contest. The photo row is deleted, every
// contest slot that shows it is emptied, trade history for it is dropped, a
// contest banner borrowed from it is reset, and the stored file is deleted.
//
// Contest slots are emptied rather than deleted, the same way a user deleting
// their own photo works (Profile/profile.service.ts deleteUserPhoto), so finished
// contests keep their rankings, awards and POTY results intact.
const takeDownUserPhoto = async (
    userPhotoId: string,
    reason?: string
): Promise<PhotoTakedownResult> => {
    const photo = await prisma.userPhoto.findUnique({
        where: { id: userPhotoId },
        include: { user: { select: { id: true, email: true, fullName: true, username: true } } },
    })
    if (!photo) {
        throw new ApiError(httpstatus.NOT_FOUND, "Photo not found or already removed from the platform")
    }

    const fileKey = ownStorageKey(photo.url)
    // Banners are stored as the raw key; older rows may still hold a full URL.
    const bannerValues = unique([photo.url, ...(fileKey ? [fileKey] : [])])

    const [slots, likes, bannerContests, bannerTemplates] = await Promise.all([
        prisma.contestPhoto.findMany({ where: { photoId: photo.id }, select: { id: true, contestId: true } }),
        prisma.like.findMany({ where: { photoId: photo.id }, select: { providerId: true } }),
        prisma.contest.findMany({ where: { banner: { in: bannerValues } }, select: { id: true } }),
        prisma.recurringContest.findMany({ where: { banner: { in: bannerValues } }, select: { id: true } }),
    ])
    const affectedContestIds = unique(slots.map((slot) => slot.contestId))
    const resetBannerContestIds = bannerContests.map((contest) => contest.id)

    await runWithWriteConflictRetry(
        () => prisma.$transaction(async (tx) => {
            if (affectedContestIds.length) {
                // A contest mid-finalization is saving a ranking built from its
                // current photos. Touching every affected contest makes a finalizer
                // that starts right now conflict with this transaction instead of
                // racing it.
                const finalizing = await tx.contest.count({
                    where: { id: { in: affectedContestIds }, status: ContestStatus.FINALIZING },
                })
                if (finalizing > 0) {
                    throw new ApiError(
                        httpstatus.CONFLICT,
                        "A contest using this photo is being finalized right now. Try again in a few minutes."
                    )
                }
                await tx.contest.updateMany({
                    where: { id: { in: affectedContestIds } },
                    data: { updatedAt: new Date() },
                })
            }

            await tx.contestPhotoTradeRecord.deleteMany({ where: { photoId: photo.id } })
            await tx.like.updateMany({ where: { photoId: photo.id }, data: { photoId: null } })
            await tx.contestPhoto.updateMany({
                where: { photoId: photo.id },
                data: { photoId: null, promoted: false, promotionExpiresAt: null, exposureBoostExpiresAt: null },
            })
            if (resetBannerContestIds.length) {
                await tx.contest.updateMany({
                    where: { id: { in: resetBannerContestIds } },
                    data: { banner: DEFAULT_CONTEST_BANNER, bannerUploaderId: null },
                })
            }
            if (bannerTemplates.length) {
                await tx.recurringContest.updateMany({
                    where: { id: { in: bannerTemplates.map((template) => template.id) } },
                    data: { banner: DEFAULT_CONTEST_BANNER, bannerUploaderId: null },
                })
            }
            await tx.userPhoto.delete({ where: { id: photo.id } })
        }, { timeout: 30000, maxWait: 10000 }),
        { label: "photo takedown" }
    )

    // Everything below runs after the commit and is best effort: the photo is
    // already gone, so a failure here is logged rather than returned.
    const owner = photo.user
    const settle = async (label: string, step: () => Promise<unknown>) => {
        try {
            await step()
        } catch (error) {
            logger.error({ err: error, userPhotoId }, `Photo takedown cleanup failed: ${label}`)
        }
    }

    await Promise.all([
        settle("storage", async () => {
            if (!fileKey) return
            // Never delete a file another photo row still points at.
            const stillUsed = await prisma.userPhoto.count({ where: { url: { in: bannerValues } } })
            if (stillUsed === 0) await fileUploader.deleteFromDigitalOcean(fileKey)
        }),
        settle("caches", () => Promise.all([
            profileCache.invalidateUser(owner.id),
            profileCache.invalidatePhoto(photo.id),
            profileCache.invalidateUsers(likes.flatMap((like) => like.providerId ? [like.providerId] : [])),
            ...unique([...affectedContestIds, ...resetBannerContestIds]).map((contestId) => contestCache.invalidateContest(contestId)),
        ])),
        settle("events", () => Promise.all(
            affectedContestIds.map((contestId) => publishEvent("contest.photosChanged", { contestId, userId: owner.id }))
        )),
        settle("owner notification", () => notificationOrchestrator.notifyPhotoRemovedFromPlatform(
            owner.id,
            photo.id,
            photo.title,
            reason
        )),
    ])

    sendMail({
        to: owner.email,
        subject: "Your photo was removed from the platform",
        html: buildPhotoTakenDownEmail(owner.fullName || owner.username || "user", photo.title, reason),
    }).catch((err) => {
        logger.error({ err, userPhotoId }, "Failed to send photo takedown email")
    })

    return {
        userPhotoId: photo.id,
        ownerId: owner.id,
        affectedContestIds,
        affectedContestPhotoIds: slots.map((slot) => slot.id),
        resetBannerContestIds,
    }
}

export const photoTakedownService = {
    takeDownUserPhoto,
}
