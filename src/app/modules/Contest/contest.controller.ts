import { Response } from "express";
import sendResponse from "../../../shared/ApiResponse";
import catchAsync from "../../../shared/catchAsync";
import { respondWith } from "../../../shared/respondWith";
import { contestService } from "./contest.service";

const getPage = (req:any) => Number(req.query.page) || 1
const getLimit = (req:any, defaultLimit = 20) => Number(req.query.limit) || defaultLimit

const createContest = respondWith(
    "Contest created successfully",
    req => contestService.createContest(req.user.id, req.body, req.file),
    201
)

const getCreateOptions = respondWith(
    "Contest creation options fetched successfully",
    () => contestService.getContestCreateOptions()
)

const getBannerCandidates = respondWith(
    "Banner candidates fetched successfully",
    req => contestService.getBannerCandidates(getPage(req), getLimit(req), req.query.search)
)

const getAllContests = respondWith("All contests fetched successfully", req => {
    const {search, status, includeArchived, tab} = req.query
    return contestService.getAllContests(getPage(req), getLimit(req), search, status, includeArchived === "true", tab)
})

const getPublicContests = respondWith(
    "public contests fetched successfully",
    req => contestService.getPublicContests(req.query.status, getPage(req), getLimit(req), req.query.search)
)

const getPublicContestById = respondWith(
    "public contest fetched successfully",
    req => contestService.getContestById(req.params.contestId)
)

const getContestById = respondWith(
    "Contest fetched successfully",
    req => contestService.getContestByUserId(req.user.id, req.params.contestId)
)

const updateContestDetails = respondWith(
    "contest updated successfully",
    req => contestService.updateContest(req.params.contestId, req.body, req.file)
)

const joinContest = respondWith(
    "user joined a contest successfully",
    req => contestService.joinContest(req.user.id, req.params.contestId, req.body?.acceptedRuleKeys)
)

const getUploadedPhotos = respondWith(
    "photos fetched successfully",
    req => contestService.getContestUploads(req.user.id, req.params.contestId)
)

// Sent separately because this response also carries `meta`.
const getUploadedPhotosToVote = catchAsync(async (req:any, res:Response) => {
    const uploadedPhotos = await contestService.getContestUploadsToVote(
        req.user.id,
        req.params.contestId,
        getPage(req),
        getLimit(req, 10),
        req.query.seed
    )

    sendResponse(res, {
        statusCode:200,
        success:true,
        message:"photos fetched successfully",
        meta:uploadedPhotos.meta,
        data:uploadedPhotos.data
    })
})

const uploadPhoto = respondWith("photos submitted to contest successfully", req => {
    const {photoIds, acceptedRuleKeys} = req.body
    const files = contestService.getContestUploadFiles(req.file, req.files)
    return contestService.uploadPhotoToContest(req.params.contestId, req.user.id, photoIds, files, acceptedRuleKeys)
})

const deleteContest = respondWith("Contest deleted successfully", async req => {
    await contestService.deleteContestByContestId(req.params.contestId)
    return null
})

const getContestsByStatus = respondWith(
    "contests fetched successfully",
    req => contestService.getContestsByStatus(req.user.id, req.query.status, getPage(req), getLimit(req))
)

const getMyActiveContests = respondWith(
    "user active contest fetched successfully",
    req => contestService.getMyActiveContests(req.user.id)
)

const deleteContestPhoto = respondWith(
    "photo deleted successfully",
    req => contestService.deleteContestUploadById(req.params.contestId, req.user.id, req.params.photoId)
)

const adminDeleteContestPhoto = respondWith(
    "photo removed successfully",
    req => contestService.adminDeleteContestPhoto(req.params.photoId, req.user.id, req.body.reason, req.body.reportId)
)

const getContestParticipants = respondWith(
    "participants fetched successfully",
    req => contestService.getContestParticipants(req.params.contestId, req.query.search)
)

const promotePhoto = respondWith(
    "photo promoted successfully",
    req => contestService.promoteContestPhoto(req.body.contestId, req.body.photoId, req.user.id)
)

const getWinners = respondWith(
    "contest winners fetched successfully",
    req => contestService.getContestWinners(req.params.contestId)
)

const getUserRemainingPhotos = respondWith(
    "remaining photos found successfully",
    req => contestService.getRemainingPhotos(req.user.id, req.params.contestId)
)

const getTradeableHistory = respondWith(
    "tradeable photo history fetched successfully",
    req => contestService.getTradeableHistory(req.user.id, req.params.contestId)
)

const tradePhoto = respondWith("trade a photo successfully", req => {
    const {contestId, contestPhotoId, newPhotoId} = req.body
    return contestService.tradePhoto(req.user.id, contestId, contestPhotoId, newPhotoId, req.file)
})

const chargePhoto = respondWith(
    "photo charged successfully",
    req => contestService.chargePhoto(req.user.id, req.body.contestId)
)

const getContestPhotosSortedByVote = respondWith(
    "photos fetched successfully",
    req => contestService.getContestPhotosSortedByVote(req.params.contestId, getPage(req), getLimit(req))
)

const getContestPhotographers = respondWith("photographer fetched successfully", req =>
    contestService.getContestTopPhotographers(
        req.params.contestId,
        req.user?.id,
        getPage(req),
        getLimit(req),
        req.query.level,
        undefined,
        {allLevelsWhenUnset:true}
    )
)

const getContestRanking = respondWith(
    "ranking fetched successfully",
    req => contestService.getContestRanking(req.params.contestId, req.user?.id, getPage(req), getLimit(req), req.query.level)
)

const selectAwardPhoto = respondWith(
    "prize photo selected successfully",
    req => contestService.selectAwardPhoto(req.params.contestId, req.params.awardId, req.body.photoId, req.user.id)
)

const getAwardSelections = respondWith(
    "contest prize selections fetched successfully",
    req => contestService.getContestAwardSelections(req.params.contestId)
)

const getContestPrizes = respondWith(
    "contest prizes fetched successfully",
    req => contestService.getContestPrizes(req.params.contestId)
)

export const contestController = {
    createContest,
    getCreateOptions,
    getBannerCandidates,
    getTradeableHistory,
    uploadPhoto,
    getUploadedPhotos,
    deleteContest,
    getContestsByStatus,
    getMyActiveContests,
    joinContest,
    updateContestDetails,
    getContestById,
    getPublicContests,
    getPublicContestById,
    getAllContests,
    promotePhoto,
    getWinners,
    getUserRemainingPhotos,
    tradePhoto,
    chargePhoto,
    deleteContestPhoto,
    adminDeleteContestPhoto,
    getContestParticipants,
    getContestPhotosSortedByVote,
    getContestPhotographers,
    getContestRanking,
    selectAwardPhoto,
    getAwardSelections,
    getUploadedPhotosToVote,
    getContestPrizes
}
