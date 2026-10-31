import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { ContestParticipantStatus } from "../../../../prismaClient";
import { publishEvent } from "../../../event/domainEvents";
import logger from "../../../../shared/logger";
import prisma, { PrismaTx } from "../../../../shared/prisma";
import agenda from "../../Agenda";
import { profileService } from "../../Profile/profile.service";
import { voteService } from "../../Vote/vote.service";
import { contestRuleEngine } from "../ContestRules/contestRule.engine";
import { activeContestWhere } from "../contestLifecycle";
import { addContestCategoriesToPhotos, CreatedPhoto, rollbackUploadedContestPhotos } from "../entry/submittedPhotos";
import { EXPOSURE_BOOST_DURATION_MS, EXPOSURE_MAX } from "../exposure/exposure.service";
import { consumeStoreItem } from "./consumeStoreItem";
import { withActiveContest } from "./withActiveContest";

const PROMOTION_DURATION_MS = 24 * 60 * 60 * 1000 // promoted photos stay boosted for ~24 hours

const NOT_ENOUGH_PROMOTES = {status:httpstatus.BAD_REQUEST, message:"You don't have enough promotes"}
const NOT_ENOUGH_TRADES = {status:httpstatus.BAD_REQUEST, message:"you does not have enough trade"}
const NOT_ENOUGH_CHARGES = {status:httpstatus.NOT_FOUND, message:"You don't have enough charges"}

const promoteContestPhoto = async (contestId:string, photoId:string, userId:string)=>{
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    const contestPhoto = await prisma.contestPhoto.findFirst({
        where:{id:photoId, contestId, photoId:{not:null}, participant:{status:ContestParticipantStatus.ACTIVE}},
        include:{participant:true}
    })
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest photo not found")
    }
    if(contestPhoto.promoted && contestPhoto.promotionExpiresAt && contestPhoto.promotionExpiresAt > new Date()){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest photo is already promoted.")
    }
    if(contestPhoto.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to promote this contest photo")
    }

    const promotionExpiresAt = new Date(Date.now() + PROMOTION_DURATION_MS)

    await withActiveContest(contestId, "Contest is no longer accepting promotions", async tx => {
        const livePhoto = await tx.contestPhoto.findFirst({
            where:{id:photoId, contestId, photoId:{not:null}, participant:{userId, status:ContestParticipantStatus.ACTIVE}}
        })
        if(!livePhoto){
            throw new ApiError(httpstatus.CONFLICT, "Contest photo is no longer eligible for promotion")
        }

        await consumeStoreItem(tx, userId, "boost", NOT_ENOUGH_PROMOTES)
        await tx.contestPhoto.update({
            where:{id:photoId},
            data:{promoted:true, promotionExpiresAt}
        })
    })
    await publishEvent("user.storeChanged", {userId})

    // Schedule a job to remove promotion once it expires
    agenda.schedule(promotionExpiresAt, 'promotion:remove', {photoId})
        .catch(error => logger.error({ err: error, photoId }, "Failed to schedule promotion expiry"))

    return { message: `Contest photo with ID ${photoId} has been promoted until ${promotionExpiresAt}` }
}

// Saves the outgoing photo's vote count so it can be restored if the photographer
// brings it back, and restores the incoming photo's count if it was traded out
// before. Returns the votes the incoming photo starts with.
const swapTradeRecords = async (
    tx:PrismaTx,
    contestId:string,
    contestPhotoId:string,
    current:{participantId:string; photoId:string | null},
    replacementPhotoId:string
) => {
    if(current.photoId){
        await tx.contestPhotoTradeRecord.create({
            data:{
                contestId,
                participantId:current.participantId,
                photoId:current.photoId,
                fromContestPhotoId:contestPhotoId,
                frozenVoteCount:await voteService.getVoteCount(contestPhotoId),
                active:true
            }
        })
    }

    const restorableRecord = await tx.contestPhotoTradeRecord.findFirst({
        where:{participantId:current.participantId, contestId, photoId:replacementPhotoId, active:true},
        orderBy:{createdAt:"desc"}
    })
    if(!restorableRecord){
        return 0
    }

    await tx.contestPhotoTradeRecord.update({
        where:{id:restorableRecord.id},
        data:{active:false, toContestPhotoId:contestPhotoId}
    })
    return restorableRecord.frozenVoteCount
}

const tradePhoto = async (userId:string, contestId:string, contestPhotoId:string, photoId:string, file:Express.Multer.File) => {
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.CONFLICT, "Contest photos can no longer be traded")
    }
    const contestPhoto = await prisma.contestPhoto.findUnique({
        where:{id:contestPhotoId, contestId},
        include:{photo:true, participant:true}
    })
    if(!contestPhoto){
        throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
    }
    if(contestPhoto.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to trade this contest photo")
    }

    const store = await prisma.userStore.findUnique({where:{userId}, select:{swap:true}})
    if(!store || store.swap <= 0){
        throw new ApiError(NOT_ENOUGH_TRADES.status, NOT_ENOUGH_TRADES.message)
    }

    // A traded-in photo has to satisfy the contest's format rule too, and this
    // runs before the swap charge so a rejected photo costs the user nothing.
    await contestRuleEngine.validateSubmissionFormat(
        contestId,
        !photoId && file ? [file] : [],
        photoId ? [photoId] : []
    )

    let replacementPhotoId = photoId
    const photosCreatedHere:CreatedPhoto[] = []
    if(!replacementPhotoId){
        if(!file){
            throw new ApiError(httpstatus.BAD_REQUEST, "file is required to replace contest photo")
        }
        const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
        replacementPhotoId = uploadedPhoto.id
        photosCreatedHere.push({userPhotoId:uploadedPhoto.id, file})
    }

    const replacedPhoto = await withActiveContest(contestId, "Contest photos can no longer be traded", async tx => {
        const currentContestPhoto = await tx.contestPhoto.findUnique({
            where:{id:contestPhotoId, contestId, photoId:{not:null}, participant:{status:ContestParticipantStatus.ACTIVE}},
            include:{participant:true}
        })
        if(!currentContestPhoto){
            throw new ApiError(httpstatus.NOT_FOUND, "contest photo not found")
        }
        if(currentContestPhoto.participant.userId !== userId){
            throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to trade this contest photo")
        }

        const replacementPhoto = await tx.userPhoto.findUnique({where:{id:replacementPhotoId, userId}})
        if(!replacementPhoto){
            throw new ApiError(httpstatus.BAD_REQUEST, "One or more photos do not belong to this user")
        }

        await consumeStoreItem(tx, userId, "swap", NOT_ENOUGH_TRADES)
        const bankedVotes = await swapTradeRecords(tx, contestId, contestPhotoId, currentContestPhoto, replacementPhotoId)
        await addContestCategoriesToPhotos(tx, [replacementPhotoId], contest)

        return tx.contestPhoto.update({
            where:{id:contestPhotoId},
            data:{
                photoId:replacementPhotoId,
                stintStartedAt:new Date(),
                bankedVotes,
                // A trade is a fresh start for this slot's spotlight too, same as a
                // brand-new submission.
                exposureBoostExpiresAt:new Date(Date.now() + EXPOSURE_BOOST_DURATION_MS)
            }
        })
    }).catch(async error => {
        // A rejected trade must not leave the replacement photo behind.
        await rollbackUploadedContestPhotos(photosCreatedHere)
        throw error
    })

    // The slot now holds a different image with a different vote history.
    await publishEvent("user.storeChanged", {userId})
    await publishEvent("contest.photosChanged", {contestId, userId})

    return replacedPhoto
}

// Photos this user has previously traded out of any slot in this contest and
// hasn't brought back yet - offered as a "swap back" option alongside a fresh
// upload/gallery pick when starting a new trade. Bringing one of these back in
// resumes its frozenVoteCount instead of starting at zero (see tradePhoto).
const getTradeableHistory = async (userId:string, contestId:string) => {
    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId, userId}}})
    if(!participant){
        return []
    }

    const records = await prisma.contestPhotoTradeRecord.findMany({
        where:{participantId:participant.id, contestId, active:true},
        include:{photo:{select:{id:true, url:true, title:true}}},
        orderBy:{createdAt:"desc"}
    })

    return records.map(record => ({
        tradeRecordId:record.id,
        photoId:record.photoId,
        url:record.photo.url,
        title:record.photo.title,
        frozenVoteCount:record.frozenVoteCount,
        tradedOutAt:record.createdAt
    }))
}

const chargePhoto = async (userId:string, contestId:string) => {
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest not found")
    }

    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    if(!participant){
        throw new ApiError(httpstatus.NOT_FOUND, "You have not joined this contest")
    }

    const updatedParticipant = await prisma.$transaction(async tx => {
        await consumeStoreItem(tx, userId, "key", NOT_ENOUGH_CHARGES)

        return tx.contestParticipant.update({
            where:{id:participant.id},
            data:{exposure_bonus:EXPOSURE_MAX, exposureUpdatedAt:new Date()}
        })
    })
    await publishEvent("user.storeChanged", {userId})

    return updatedParticipant
}

export const contestPhotoActions = {
    promoteContestPhoto,
    tradePhoto,
    getTradeableHistory,
    chargePhoto,
}
