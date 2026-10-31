import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { PaymentStatus, PaymentType } from "../../../../prismaClient";
import { publishEvent } from "../../../event/domainEvents";
import prisma, { PrismaTx } from "../../../../shared/prisma";
import { pendingWorkQueue } from "../../PendingWork/pendingWork.queue";
import { profileService } from "../../Profile/profile.service";
import { consumeStoreItem } from "../actions/consumeStoreItem";
import { withActiveContest } from "../actions/withActiveContest";
import { parseContestPhotoIds } from "../contestPhotoInput";
import { activeContestWhere } from "../contestLifecycle";
import { ContestType, policyFor } from "../contestTypePolicy";
import { contestRuleEngine } from "../ContestRules/contestRule.engine";
import { EXPOSURE_BOOST_DURATION_MS } from "../exposure/exposure.service";
import { addContestCategoriesToPhotos, CreatedPhoto, rollbackUploadedContestPhotos } from "./submittedPhotos";

const NOT_ENOUGH_COINS = {status:httpstatus.PAYMENT_REQUIRED, message:"Insufficient coins to enter this contest"}
const STRIPE_REQUIRED_MESSAGE = "Stripe payment is required to enter this contest"

const chargeContestEntryFee = async (
    tx:PrismaTx,
    contest:{id:string; entryFeeCoins:number},
    userId:string
) => {
    if(contest.entryFeeCoins <= 0){
        return
    }

    const existingCharge = await tx.contestEntryFeeTransaction.findUnique({
        where:{contestId_userId:{contestId:contest.id, userId}}
    })
    if(existingCharge){
        return
    }

    await consumeStoreItem(tx, userId, "coins", NOT_ENOUGH_COINS, contest.entryFeeCoins)
    await tx.contestEntryFeeTransaction.create({
        data:{contestId:contest.id, userId, amount:contest.entryFeeCoins}
    })
}

// Every new participant is created here. If they belong to a team waiting for
// enough members, the check runs later through the pending work list, which is
// saved in this same transaction so the join and the check cannot get separated.
const createParticipant = async (tx:PrismaTx, contestId:string, userId:string) => {
    const participant = await tx.contestParticipant.create({
        data:{contestId, userId, exposure_bonus:0, exposureUpdatedAt:new Date()}
    })
    await pendingWorkQueue.enqueue("TEAM_QUEUE_CHECK", userId, {contestId, tx})
    return participant
}

const assertMatchingContestType = (contest:{isPhotographyOfYear:boolean}, contestType:ContestType) => {
    if(policyFor(contest).type !== contestType){
        throw new ApiError(httpstatus.BAD_REQUEST, "Use the matching contest participation endpoint")
    }
}

// add a user to the contest participant list
const joinContest = async (
    userId:string,
    contestId:string,
    acceptedRuleKeys?:unknown,
    contestType:ContestType = "REGULAR"
)=>{
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest is not available to participate")
    }
    assertMatchingContestType(contest, contestType)

    const existingParticipant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    if(existingParticipant){
        return {contest_id:contestId, participant_id:existingParticipant.id}
    }

    await contestRuleEngine.validateJoinRules(contestId, userId, acceptedRuleKeys)

    if(policyFor(contest).requiresStripeEntry(contest)){
        throw new ApiError(httpstatus.PAYMENT_REQUIRED, STRIPE_REQUIRED_MESSAGE)
    }

    const participant = await prisma.$transaction(async tx => {
        const participant = await tx.contestParticipant.findUnique({
            where:{contestId_userId:{contestId,userId}}
        })
        if(participant){
            return participant
        }

        const activeContest = await tx.contest.findFirst({
            where:{id:contestId, ...activeContestWhere()},
            select:{id:true, entryFeeCoins:true}
        })
        if(!activeContest){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest is no longer accepting participants")
        }

        await chargeContestEntryFee(tx, activeContest, userId)
        return createParticipant(tx, contestId, userId)
    })

    await publishEvent("user.storeChanged", {userId})

    return {contest_id:contestId, participant_id:participant.id}
}

const assertPaymentMatchesEntry = (
    payment:{userId:string; contestId:string | null; type:PaymentType; status:PaymentStatus},
    userId:string,
    contestId:string
) => {
    if(payment.userId !== userId || payment.contestId !== contestId){
        throw new ApiError(httpstatus.BAD_REQUEST, "Payment does not match this contest entry")
    }
    if(payment.type !== PaymentType.CONTEST){
        throw new ApiError(httpstatus.BAD_REQUEST, "Payment is not a contest entry payment")
    }
    if(payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.SUCCEEDED){
        throw new ApiError(httpstatus.BAD_REQUEST, "Contest entry payment is not eligible for completion")
    }
}

const completePaidContestJoin = async (
    userId:string,
    contestId:string,
    paymentId:string,
    stripePaymentId?:string
) => {
    const completion = await prisma.$transaction(async tx => {
        const payment = await tx.payment.findUnique({where:{id:paymentId}})
        if(!payment){
            throw new ApiError(httpstatus.NOT_FOUND, "Payment not found")
        }
        assertPaymentMatchesEntry(payment, userId, contestId)

        const contest = await tx.contest.findUnique({
            where:{id:contestId},
            select:{id:true, status:true, entryFeeAmount:true, currency:true, entryFeeCoins:true, isPhotographyOfYear:true}
        })
        if(!contest || contest.status !== "ACTIVE"){
            throw new ApiError(httpstatus.BAD_REQUEST, "Contest is no longer accepting participants")
        }
        if(contest.entryFeeAmount <= 0){
            throw new ApiError(httpstatus.BAD_REQUEST, "This contest does not require Stripe entry payment")
        }
        if(payment.amount !== contest.entryFeeAmount){
            throw new ApiError(httpstatus.BAD_REQUEST, "Payment amount does not match the contest entry fee")
        }

        const alreadyCompleted = payment.status === PaymentStatus.SUCCEEDED
        if(!alreadyCompleted){
            const transitioned = await tx.payment.updateMany({
                where:{id:paymentId, status:PaymentStatus.PENDING},
                data:{
                    status:PaymentStatus.SUCCEEDED,
                    ...(stripePaymentId ? {stripe_payment_id:stripePaymentId} : {})
                }
            })
            if(transitioned.count !== 1){
                throw new ApiError(httpstatus.CONFLICT, "Contest entry payment is already being completed")
            }
        }

        await chargeContestEntryFee(tx, contest, userId)

        const existingParticipant = await tx.contestParticipant.findUnique({
            where:{contestId_userId:{contestId,userId}}
        })
        if(existingParticipant){
            return {participant:existingParticipant, alreadyCompleted}
        }

        return {participant:await createParticipant(tx, contestId, userId), alreadyCompleted}
    })

    await publishEvent("user.storeChanged", {userId})

    return {
        contest_id:contestId,
        participant_id:completion.participant.id,
        alreadyCompleted:completion.alreadyCompleted
    }
}

// The cheap checks a user joining through an upload must pass, run before any
// file is stored. The real charge happens in the submission transaction.
const assertCanEnterThroughUpload = async (
    contest:{entryFeeAmount:number; entryFeeCoins:number; isPhotographyOfYear:boolean},
    userId:string
) => {
    if(contest.entryFeeCoins > 0){
        const store = await prisma.userStore.findUnique({where:{userId}, select:{coins:true}})
        if(!store || store.coins < contest.entryFeeCoins){
            throw new ApiError(NOT_ENOUGH_COINS.status, NOT_ENOUGH_COINS.message)
        }
    }
    if(policyFor(contest).requiresStripeEntry(contest)){
        throw new ApiError(httpstatus.PAYMENT_REQUIRED, STRIPE_REQUIRED_MESSAGE)
    }
}

// A submission uses either new files or photos from the user's gallery. Returns
// the photo ids, plus the new ones so they can be removed if the entry fails.
const prepareSubmittedPhotos = async (userId:string, files:Express.Multer.File[], photoIds:string[]) => {
    const photosCreatedHere:CreatedPhoto[] = []

    if(files.length === 0){
        if(photoIds.length === 0){
            throw new ApiError(httpstatus.BAD_REQUEST, "photoIds is empty or missing")
        }
        const userPhotos = await prisma.userPhoto.findMany({where:{id:{in:photoIds}, userId}})
        if(userPhotos.length !== photoIds.length){
            throw new ApiError(httpstatus.BAD_REQUEST, "One or more photos do not belong to this user")
        }
        return {selectedPhotoIds:userPhotos.map(photo => photo.id), photosCreatedHere}
    }

    // One at a time keeps storage pressure predictable for a full entry. Four
    // simultaneous S3 uploads could fail at the boundary while smaller batches
    // succeeded, and the raw provider error became a 500.
    for(const file of files){
        try{
            const uploadedPhoto = await profileService.uploadUserPhoto(userId, file)
            photosCreatedHere.push({userPhotoId:uploadedPhoto.id, file})
        }catch{
            await rollbackUploadedContestPhotos(photosCreatedHere)
            throw new ApiError(httpstatus.BAD_GATEWAY, `Unable to upload ${file.originalname}. Please try again`)
        }
    }
    return {selectedPhotoIds:photosCreatedHere.map(photo => photo.userPhotoId), photosCreatedHere}
}

const saveSubmission = (
    contestId:string,
    userId:string,
    selectedPhotoIds:string[],
    submissionLimit:number | null
) => withActiveContest(contestId, "Contest is no longer accepting submissions", async tx => {
    const activeContest = await tx.contest.findUniqueOrThrow({where:{id:contestId}})

    let participant = await tx.contestParticipant.findUnique({
        where:{contestId_userId:{contestId,userId}}
    })
    if(!participant){
        await chargeContestEntryFee(tx, activeContest, userId)
        participant = await createParticipant(tx, contestId, userId)
    }
    const participantId = participant.id

    if(submissionLimit !== null){
        const existingUploadCount = await tx.contestPhoto.count({where:{contestId, participantId}})
        if(existingUploadCount + selectedPhotoIds.length > submissionLimit){
            throw new ApiError(httpstatus.BAD_REQUEST, "Maximum upload limit exceeded")
        }
    }

    const exposureBoostExpiresAt = new Date(Date.now() + EXPOSURE_BOOST_DURATION_MS)
    await tx.contestPhoto.createMany({
        data:selectedPhotoIds.map(photoId => ({
            contestId,
            participantId,
            photoId,
            originalPhotoId:photoId,
            exposureBoostExpiresAt
        }))
    })
    await addContestCategoriesToPhotos(tx, selectedPhotoIds, activeContest)

    return tx.contestPhoto.findMany({
        where:{contestId, participantId, photoId:{in:selectedPhotoIds}},
        include:{photo:true}
    })
}, {
    // Prisma's interactive transaction default is 5 seconds. Joining can also
    // charge an entry fee and create a participant, so keep a safety margin.
    maxWait:5000,
    timeout:15000
})

//Upload photo to a contest, user can upload photo from profile or can upload directly from computer
const uploadPhotoToContest = async (
    contestId:string,
    userId:string,
    photoIds:unknown,
    files:Express.Multer.File[],
    acceptedRuleKeys?:unknown,
    contestType:ContestType = "REGULAR"
)=>{
    if(!contestId){
        throw new ApiError(httpstatus.BAD_REQUEST, "contest id is required")
    }
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found or contest closed")
    }
    assertMatchingContestType(contest, contestType)

    const user = await prisma.user.findUnique({where:{id:userId}, select:{id:true}})
    if(!user){
        throw new ApiError(httpstatus.NOT_FOUND, "user not found")
    }

    const contestParticipant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})
    const isJoiningThroughUpload = !contestParticipant
    // A file and profile-photo IDs are alternative inputs. Multipart fields are
    // strings, so JSON-encoded arrays must be decoded before they reach Prisma.
    // In particular, never query MongoDB with the common placeholder value
    // `photoIds: "[]"` when a real file was supplied.
    const parsedPhotoIds = files.length > 0 ? [] : parseContestPhotoIds(photoIds)

    const {submissionLimit} = await contestRuleEngine.validateUploadRules({
        contestId,
        userId,
        participantId:contestParticipant?.id,
        files,
        photoIds:parsedPhotoIds,
        acceptedRuleKeys,
        isJoiningThroughUpload
    })

    if(isJoiningThroughUpload){
        await assertCanEnterThroughUpload(contest, userId)
    }

    const {selectedPhotoIds, photosCreatedHere} = await prepareSubmittedPhotos(userId, files, parsedPhotoIds)

    let images
    try{
        images = await saveSubmission(contestId, userId, selectedPhotoIds, submissionLimit)
    }catch(error){
        await rollbackUploadedContestPhotos(photosCreatedHere)
        throw error
    }

    await publishEvent("user.storeChanged", {userId})
    await publishEvent("contest.photosChanged", {contestId, userId})

    return images
}

const deleteContestUploadById = async (contestId:string, userId:string, photoId:string)=>{
    const contest = await prisma.contest.findFirst({where:{id:contestId, ...activeContestWhere()}})
    if(!contest){
        throw new ApiError(httpstatus.CONFLICT, "Contest submissions can no longer be changed")
    }
    const contestUpload = await prisma.contestPhoto.findFirst({where:{id:photoId, contestId, photoId:{not:null}}, include:{participant:true}})
    if(!contestUpload){
        throw new ApiError(httpstatus.NOT_FOUND, "Contest upload not found")
    }
    if(contestUpload.participant.userId !== userId){
        throw new ApiError(httpstatus.FORBIDDEN, "You are not allowed to delete this contest upload")
    }

    await withActiveContest(contestId, "Contest submissions can no longer be changed", async tx => {
        // Keep the slot as a tombstone so existing votes, comments and audit
        // records remain valid. Rankings already ignore slots without a photo.
        await tx.contestPhoto.update({
            where:{id:photoId},
            data:{photoId:null, promoted:false, promotionExpiresAt:null, exposureBoostExpiresAt:null}
        })
    })

    await publishEvent("contest.photosChanged", {contestId, userId})
    return "Contest upload deleted successfully"
}

export const contestEntryService = {
    joinContest,
    completePaidContestJoin,
    uploadPhotoToContest,
    deleteContestUploadById,
}
