import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { escapeHtml } from "../../../../shared/html";
import logger from "../../../../shared/logger";
import { sendMail } from "../../../../shared/mailSender";
import prisma from "../../../../shared/prisma";
import { publishEvent } from "../../../event/domainEvents";
import { notificationOrchestrator } from "../../Notification/notificationOrchestrator";
import { reportService } from "../../Report/report.service";
import { contestStatus } from "../contestLifecycle";

const buildPhotoRemovedEmail = (ownerName:string, contestTitle:string, reason?:string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 2px solid #0056b3; padding-bottom: 15px;">
          <h2 style="color: #0056b3; margin: 0;">Contest Photo Removed</h2>
        </div>
        <div style="padding: 20px 0; line-height: 1.6; color: #333;">
          <p>Dear <strong>${escapeHtml(ownerName)}</strong>,</p>
          <p>Your submission to <strong>"${escapeHtml(contestTitle)}"</strong> has been removed by an admin.</p>
          ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
          <p>This does not affect your account status. If you have questions, please contact support.</p>
        </div>
      </div>
    `

// Admin moderation delete: unlike deleteContestUploadById this has no owner check,
// always emails the photo's owner, and never touches the user's block status -
// banning stays a separate, manual admin action (Dashboard toggle-block).
const adminDeleteContestPhoto = async (photoId:string, adminId:string, reason?:string, reportId?:string) => {
    const contestUpload = await prisma.contestPhoto.findUnique({
        where:{id:photoId},
        include:{
            participant:{include:{user:{select:{id:true, email:true, fullName:true, username:true}}}}
        }
    })
    if(!contestUpload){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest upload not found")
    }

    const {contestId} = contestUpload
    const contest = await prisma.contest.findUnique({where:{id:contestId}, select:{title:true}})

    // The status check and the removal must happen together. If finalization
    // started in between, the photo would vanish from a ranking being saved.
    await prisma.$transaction(async tx => {
        const notFrozen = await tx.contest.updateMany({
            where:{id:contestId, status:{notIn:contestStatus.frozenStatuses}},
            data:{updatedAt:new Date()}
        })
        if(notFrozen.count !== 1){
            throw new ApiError(httpstatus.CONFLICT, "A photo cannot be removed after finalization starts")
        }
        await tx.contestPhoto.update({
            where:{id:photoId},
            data:{photoId:null, promoted:false, promotionExpiresAt:null, exposureBoostExpiresAt:null}
        })
    })

    const owner = contestUpload.participant.user
    const contestTitle = contest?.title || "the contest"
    await publishEvent("contest.photosChanged", {contestId, userId:owner.id})

    sendMail({
        to:owner.email,
        subject:"Your contest photo was removed",
        html:buildPhotoRemovedEmail(owner.fullName || owner.username || "user", contestTitle, reason)
    }).catch((err) => {
        logger.error({ err }, "Failed to send contest photo removal email")
    })

    await notificationOrchestrator.notifyContestPhotoRemoved(owner.id, contestId, contestTitle, reason)

    if(reportId){
        await reportService.markActionTaken(reportId, adminId, reason)
    }

    return "Contest photo removed successfully"
}

const getContestParticipants = async (contestId:string, search?:string)=>{
    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    return prisma.contestParticipant.findMany({
        where:{
            contestId,
            ...(search && {
                user:{
                    OR:[
                        {username:{contains:search, mode:"insensitive"}},
                        {fullName:{contains:search, mode:"insensitive"}}
                    ]
                }
            })
        },
        include:{
            user:{select:{id:true, username:true, fullName:true, avatar:true, email:true}}
        }
    })
}

export const contestModerationService = {
    adminDeleteContestPhoto,
    getContestParticipants,
}
