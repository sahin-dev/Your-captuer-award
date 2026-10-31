import httpstatus from "http-status";
import ApiError from "../../../../errors/ApiError";
import { paginationHelper } from "../../../../helpers/paginationHelper";
import { AchievementKind, ContestStatus, Prisma } from "../../../../prismaClient";
import prisma from "../../../../shared/prisma";
import { achievementService } from "../../Achievements/achievement.service";
import { photographyOfTheYearRankingService } from "../../PhotographyOfTheYear/photographyOfTheYearRanking.service";
import { withPotyPrizePools } from "../../PhotographyOfTheYear/photographyOfTheYearPrizePool";
import { prizeService } from "../../Prize/prize.service";
import { profileCache } from "../../Profile/profile.cache";
import { voteService } from "../../Vote/vote.service";
import { contestCache } from "../contest.cache";
import { contestFinalizationService } from "../ContestFinalization/contestFinalization.service";
import { contestStatus, notDeletedContest } from "../contestLifecycle";
import { ContestRuleKey, contestRuleDefinitions, isContestRuleKey } from "../ContestRules/contestRule.definitions";
import { contestRuleService } from "../ContestRules/contestRules.service";
import { contestPhotoPresenter } from "../presenters/contestPhoto.presenter";
import { getInitialVotes } from "../scoring/voteTally";
import { getParticipantLevelData } from "./participantLevel";

const contestBannerUploaderInclude = {select:{id:true, fullName:true, username:true, avatar:true, firstName:true, lastName:true}} as const
const contestCardInclude = {
    creator:{omit:{password:true, accessToken:true}},
    bannerUploader:contestBannerUploaderInclude
} as const

const getUserDisplayName = (user?:{
    fullName?:string | null;
    username?:string | null;
    firstName?:string | null;
    lastName?:string | null;
} | null) => {
    if(!user){
        return null
    }

    return [user.firstName, user.lastName]
        .map(name => name?.trim())
        .filter(Boolean)
        .join(" ")
        || user.fullName
        || user.username
        || null
}

const getContestCardAttribution = (contest:any) => {
    const user = contest.creator
    if(!user){
        return null
    }

    return {
        source:"creator",
        displayName:getUserDisplayName(user),
        user
    }
}

const isContestParticipantExist = async (userId:string, contestId:string)=>{
    const participantData =  await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId,userId}}})

    return participantData? participantData: false;
}

// Everything on the contest detail page except the contest row and the vote
// total. Cached in Redis per contest (see contest.cache.ts); the writers of
// these tables call contestCache.invalidateContest.
const loadContestDetailExtras = async (contest:{id:string; status:string}) => {
    const [rules, prizes, levelAwards, finalization, awardSelections, winners] = await Promise.all([
        contestRuleService.getContestRules(contest.id),
        prizeService.getContestAwards(contest.id),
        prisma.contestLevelAward.findMany({where:{contestId:contest.id}}),
        prisma.contestFinalization.findUnique({where:{contestId:contest.id}}),
        contestFinalizationService.getContestAwardSelections(contest.id),
        contestStatus.isCompleted(contest.status as ContestStatus) ? loadContestWinners(contest.id) : Promise.resolve(undefined)
    ])
    return {rules, prizes, levelAwards, finalization, awardSelections, winners}
}

const getCachedDetailExtras = contestCache.cachedLoader("detail", loadContestDetailExtras)

const buildContestDetails = async <T extends {id:string; status:ContestStatus}>(contest:T) => {
    const [{winners, ...extras}, totalVotes] = await Promise.all([
        getCachedDetailExtras(contest),
        voteService.getContestTotalVotes(contest.id)
    ])
    const [contestWithPool] = await withPotyPrizePools([contest as T & {isPhotographyOfYear?:boolean}])
    const baseContestDetails = {...contestWithPool, cardAttribution:getContestCardAttribution(contest), ...extras, totalVotes}

    return contestStatus.isCompleted(contest.status) ? {...baseContestDetails, winners} : baseContestDetails
}

const getContestByUserId = async ( userId:string, contestId: string) => {
    const contest = await prisma.contest.findFirst({
        where: { id: contestId, ...notDeletedContest },
        include: {
            creator: {omit:{password:true, accessToken:true}},
            bannerUploader: contestBannerUploaderInclude
        }
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    const contestDetails = await buildContestDetails(contest)

    if(contestStatus.isCompleted(contest.status)){
        return contestDetails;
    }

    if( (await isContestParticipantExist(userId, contestId)) && (contest.status === ContestStatus.ACTIVE)){
        const contestPhotoCount =  await prisma.contestPhoto.count({where:{contestId, photo:{userId}}})

        return {...contestDetails, joined:true, uploadCount:contestPhotoCount}
    }


    return {...contestDetails, joined:false};
}

const getContestById = async ( contestId: string) => {
    const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: {
            creator: {omit:{password:true, accessToken:true}},
            bannerUploader: contestBannerUploaderInclude
        }
    });
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    return buildContestDetails(contest)
}

// A contest list is a "spec": which contests, in what order. Everything else
// (paging, the total, extra data on each card) is the same for all lists, so it
// lives in runContestList. Every order ends on id so pages never overlap or skip
// contests that share a date.
type ContestListSpec = {
    where:Prisma.ContestWhereInput;
    orderBy:Prisma.ContestOrderByWithRelationInput[];
}
type ContestTab = "active" | "ended"

const newestFirst:ContestListSpec["orderBy"] = [{startDate:"desc"}, {id:"desc"}]
const closingSoonestFirst:ContestListSpec["orderBy"] = [{endDate:"asc"}, {id:"asc"}]
const startingSoonestFirst:ContestListSpec["orderBy"] = [{startDate:"asc"}, {id:"asc"}]

const contestListSpecs = {
    // Photographer of the Year contests have their own admin workspace and
    // must not appear in the regular contest management list.
    admin:(search?:string, status?:ContestStatus, includeArchived = false, tab?:ContestTab):ContestListSpec => ({
        where:{
            isPhotographyOfYear:false,
            ...(status && {status}),
            ...(tab && {status:{in:tab === "active" ? contestStatus.activeTabStatuses : contestStatus.endedTabStatuses}}),
            ...(search && {title:{contains:search, mode:"insensitive" as const}}),
            ...(includeArchived ? {} : notDeletedContest)
        },
        orderBy:newestFirst
    }),
    // Running contests are ranked by the one ending soonest, upcoming ones by the
    // one starting soonest - both mirror the countdown shown on the contest card.
    publicList:(status?:ContestStatus, search?:string):ContestListSpec => ({
        where:{
            ...(status && {status}),
            ...(search && {title:{contains:search, mode:"insensitive" as const}}),
            ...notDeletedContest
        },
        orderBy:status === ContestStatus.ACTIVE
            ? closingSoonestFirst
            : status === ContestStatus.UPCOMING ? startingSoonestFirst : newestFirst
    }),
    // Contests a signed-in user can browse: open ones they have not joined yet.
    forUser:(userId:string, status:ContestStatus):ContestListSpec => {
        const notJoined = {participants:{none:{userId}}, ...notDeletedContest}

        switch(status){
            case ContestStatus.ACTIVE:
                return {where:{status, ...notJoined}, orderBy:closingSoonestFirst}
            case ContestStatus.UPCOMING:
                return {where:{status, ...notJoined}, orderBy:startingSoonestFirst}
            // The CLOSED tab lists finished contests the user did not take part in.
            case ContestStatus.CLOSED:
                return {where:{status:ContestStatus.COMPLETED, ...notJoined}, orderBy:[{endDate:"desc"}, {id:"desc"}]}
            default:
                return {where:{status, ...notDeletedContest}, orderBy:newestFirst}
        }
    }
}

const paginatedResult = <T>(contests:T[], total:number, page:number, limit:number) => ({
    contests,
    total,
    page,
    limit,
    meta:paginationHelper.getPaginationMetaData(page, limit, total)
})

const runContestList = async (spec:ContestListSpec, page:number, limit:number) => {
    const {skip, limit:take, page:currentPage} = paginationHelper.calculatePagination({page, limit})
    const [contests, total] = await Promise.all([
        prisma.contest.findMany({...spec, include:contestCardInclude, skip, take}),
        prisma.contest.count({where:spec.where})
    ])

    return paginatedResult(await enrichContestListDetails(contests), total, currentPage, take)
}

const getAllContests = (
    page:number = 1,
    limit:number = 20,
    search?:string,
    status?:ContestStatus,
    includeArchived = false,
    tab?:ContestTab
) => runContestList(contestListSpecs.admin(search, status, includeArchived, tab), page, limit)

const getPublicContests = (
    status?:ContestStatus,
    page:number = 1,
    limit:number = 20,
    search?:string
) => runContestList(contestListSpecs.publicList(status, search), page, limit)

const formatContestRulesForList = (configs:any[]) => {
    return configs
        .filter((rule) => isContestRuleKey(rule.key) && rule.enabled)
        .map((rule) => {
            const definition = contestRuleDefinitions[rule.key as ContestRuleKey];

            return {
                key: definition.key,
                label: definition.label,
                name: definition.label,
                icon: definition.icon,
                inputType: definition.inputType,
                appliesTo: definition.appliesTo,
                displayOnly: definition.displayOnly,
                enabled: rule.enabled,
                order: rule.order,
                value: rule.value,
                description: contestRuleService.formatRuleSummary(definition.key, rule.value),
            };
        });
}

const getDefaultContestRuleConfigsForList = () => {
    return contestRuleService.normalizeContestRules().map((rule) => ({
        key: rule.key,
        value: rule.value,
        enabled: rule.enabled ?? true,
        order: rule.order ?? contestRuleDefinitions[rule.key].order,
    }))
}

const groupByContestId = <T extends {contestId:string}>(rows:T[]) => {
    const map = new Map<string, T[]>();

    rows.forEach((row) => {
        const existing = map.get(row.contestId) || [];
        existing.push(row);
        map.set(row.contestId, existing);
    });

    return map;
}

const getContestWinnerMapForList = async (contests:{id:string; status:ContestStatus}[]) => {
    const completedContestIds = contests
        .filter((contest) => contestStatus.isCompleted(contest.status))
        .map((contest) => contest.id);

    const winnersByContestId = new Map<string, any[]>();
    if(completedContestIds.length === 0){
        return winnersByContestId;
    }

    const grants = await prisma.contestAwardGrant.findMany({
        where:{
            contestId:{in:completedContestIds},
            kind:AchievementKind.CONTEST_AWARD,
            status:"COMPLETED",
        },
        orderBy:[{rank:"asc"}, {createdAt:"asc"}],
    });

    const grantsByContestId = groupByContestId(grants);
    const userIds = [...new Set(grants.map((grant) => grant.userId))];
    const photoIds = [...new Set(grants.flatMap((grant) => grant.photoId ? [grant.photoId] : []))];

    const [users, photos] = await Promise.all([
        userIds.length
            ? prisma.user.findMany({
                where:{id:{in:userIds}},
                select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true},
            })
            : Promise.resolve([]),
        photoIds.length
            ? prisma.contestPhoto.findMany({
                where:{id:{in:photoIds}},
                include:{photo:{select:{id:true, url:true, title:true}}},
            })
            : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((user) => [user.id, user] as const));
    const photoById = new Map(photos.map((photo) => [photo.id, photo] as const));

    grantsByContestId.forEach((contestGrants, contestId) => {
        winnersByContestId.set(contestId, contestGrants.map((grant) => ({
            ...grant,
            user:userById.get(grant.userId),
            photo:grant.photoId ? photoById.get(grant.photoId) : null,
        })));
    });

    const achievementContestIds = completedContestIds.filter((contestId) => !winnersByContestId.has(contestId));
    if(achievementContestIds.length){
        const achievements = await prisma.contestAchievement.findMany({
            where:{contestId:{in:achievementContestIds}, kind:AchievementKind.CONTEST_AWARD},
            include:{participant:{include:{user:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}}},
        });

        const achievementsByContestId = groupByContestId(achievements);
        achievementContestIds.forEach((contestId) => {
            winnersByContestId.set(contestId, achievementsByContestId.get(contestId) || []);
        });
    }

    return winnersByContestId;
}

// Per-contest list-card data except the vote total. Loaded in one batch for
// every contest the Redis cache missed.
const loadContestListExtras = async (contests:{id:string; status:string}[]) => {
    const contestIds = contests.map((contest) => contest.id);

    const [
        ruleConfigs,
        prizes,
        finalizations,
        awardSelections,
        winnersByContestId,
    ] = await Promise.all([
        prisma.contestRuleConfig.findMany({
            where:{contestId:{in:contestIds}},
            orderBy:{order:"asc"},
        }),
        prisma.contestAward.findMany({
            where:{contestId:{in:contestIds}, enabled:true},
            orderBy:[{order:"asc"}, {createdAt:"asc"}],
        }),
        prisma.contestFinalization.findMany({
            where:{contestId:{in:contestIds}},
        }),
        prisma.contestAwardSelection.findMany({
            where:{contestId:{in:contestIds}},
            orderBy:{createdAt:"asc"},
        }),
        getContestWinnerMapForList(contests as {id:string; status:ContestStatus}[]),
    ]);

    const rulesByContestId = groupByContestId(ruleConfigs);
    const prizesByContestId = groupByContestId(prizes);
    const finalizationByContestId = new Map(finalizations.map((finalization) => [finalization.contestId, finalization]));
    const selectionsByContestId = groupByContestId(awardSelections);

    return new Map(contests.map((contest) => {
        const configuredRules = rulesByContestId.get(contest.id);
        return [contest.id, {
            rules:formatContestRulesForList(configuredRules?.length ? configuredRules : getDefaultContestRuleConfigsForList()),
            prizes:prizesByContestId.get(contest.id) || [],
            finalization:finalizationByContestId.get(contest.id) || null,
            awardSelections:selectionsByContestId.get(contest.id) || [],
            winners:winnersByContestId.get(contest.id) || [],
        }];
    }));
}

const enrichContestListDetails = async (contests:any[]) => {
    const contestIds = contests.map((contest) => contest.id);

    if(contestIds.length === 0){
        return [];
    }

    // The contest rows come from the caller's live query, so status, dates and
    // membership filters are always current; only the per-contest extras are
    // cached, and vote totals are always counted live.
    const [extrasByContestId, voteGroups, contestsWithPools] = await Promise.all([
        contestCache.getMany("list", contests, loadContestListExtras),
        // Votes counted with voting power, like every other vote total.
        prisma.vote.groupBy({
            by:["contestId"],
            where:{contestId:{in:contestIds}},
            _sum:{power:true},
        }),
        withPotyPrizePools(contests),
    ]);
    const voteCountByContestId = new Map(voteGroups.map(group => [group.contestId, group._sum.power ?? 0]));

    return contestsWithPools.map((contest) => {
        const {winners, ...extras} = extrasByContestId.get(contest.id)!;
        const baseContestDetails = {
            ...contest,
            cardAttribution:getContestCardAttribution(contest),
            rules:extras.rules,
            prizes:extras.prizes,
            totalVotes:voteCountByContestId.get(contest.id) || 0,
            finalization:extras.finalization,
            awardSelections:extras.awardSelections,
        };

        if(contestStatus.isCompleted(contest.status)){
            return {...baseContestDetails, winners};
        }

        return baseContestDetails;
    });
}

//Search contest by contest status
const getContestsByStatus = async (userId:string, status:ContestStatus, page:number = 1, limit:number = 20) => {
    if(status && !Object.values(ContestStatus).includes(status)){
        throw new ApiError(httpstatus.BAD_REQUEST, "Invalid contest status")
    }

    if(status === ContestStatus.COMPLETED){
        const {skip, limit:take, page:currentPage} = paginationHelper.calculatePagination({page, limit})
        const {contests, total} = await getMyCompletedContest(userId, skip, take)
        return paginatedResult(contests, total, currentPage, take)
    }

    return runContestList(contestListSpecs.forUser(userId, status), page, limit)
}

const sortByVotesThenUploadSequence = <T extends {id:string; createdAt:Date; votes?:number; totalVotes?:number; voteCount?:number}>(uploads:T[]) => {
    return uploads.sort((left, right) => {
        const leftVotes = left.votes ?? left.totalVotes ?? left.voteCount ?? 0
        const rightVotes = right.votes ?? right.totalVotes ?? right.voteCount ?? 0

        if(rightVotes !== leftVotes){
            return rightVotes - leftVotes
        }

        return left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    })
}

const getContestUploadsByUserId = async (contestId:string, userId:string)=>{
    const participant = await prisma.contestParticipant.findUnique({where:{contestId_userId:{contestId, userId}}, select:{id:true}})
    if(!participant){
        return []
    }
    const userUploads = await prisma.contestPhoto.findMany({
        where:{contestId, participantId:participant.id},
        orderBy:[{createdAt:"asc"}, {id:"asc"}],
        include:{photo:{select:{id:true, url:true}}}
    })
    const voteCountByContestPhotoId = await voteService.getVoteCountsForContestPhotos(userUploads.map(upload => upload.id))

    const mappedPhotos = userUploads.flatMap(upload => {

        const {photo, ...slot} = upload
        if(!photo){
            return []
        }

        const totalVotes = voteCountByContestPhotoId.get(upload.id) ?? 0
        const voteCount = Math.max(totalVotes - getInitialVotes(upload), 0)

        return [contestPhotoPresenter.toOwnerPhoto(slot, photo, voteCount, totalVotes)]
    })

    return sortByVotesThenUploadSequence(mappedPhotos)
}

const getMyActiveContests = async (userId:string) => {
    return profileCache.getUserData(
        userId,
        "active-contests",
        {},
        async () => {
            // Order by when the user joined each contest (latest joined first) rather than
            // any contest field - joining is tracked on ContestParticipant.createdAt.
            const participants = await prisma.contestParticipant.findMany({
                where:{userId, contest:{status:ContestStatus.ACTIVE}},
                orderBy:{createdAt:"desc"},
                select:{contestId:true}
            })
            const joinOrder = participants.map(participant => participant.contestId)

            const contests = joinOrder.length > 0 ? await prisma.contest.findMany({
                where:{id:{in:joinOrder}, status:ContestStatus.ACTIVE},
                include: { creator: {select:{id:true, avatar:true,fullName:true,cover:true, firstName:true, lastName:true}}, bannerUploader: contestBannerUploaderInclude}
            }) : [];

            const contestById = new Map(contests.map(contest => [contest.id, contest]))
            const orderedContests = joinOrder
                .map(contestId => contestById.get(contestId))
                .filter((contest): contest is typeof contests[number] => Boolean(contest))

            const enrichedContests = await enrichContestListDetails(orderedContests)

            const contestDetails = enrichedContests.map (async (contest) => {
                const levelData = await getParticipantLevelData(contest.id, userId)
                const photos = await getContestUploadsByUserId(contest.id,userId)

                return {...contest, level_data:levelData, photos, uploadCount:photos.length}
            })

            return Promise.all(contestDetails);
        },
        {ttlSeconds:30}
    )
};

const COMPLETED_CARD_TTL_SECONDS = 60 * 60

const loadCompletedContestCard = async (contestId:string, userId:string) => {
    const [details, participantPhotos, achievements, levelData] = await Promise.all([
        getContestById(contestId),
        getContestUploadsByUserId(contestId, userId),
        achievementService.getMyAchievementsByContest(userId, contestId),
        getParticipantLevelData(contestId, userId)
    ])
    // POTY entries are scored by the votes their photos got in regular contests
    // during the POTY dates, not by votes cast inside the POTY contest itself.
    const potyVotes = details?.isPhotographyOfYear
        ? new Map((await photographyOfTheYearRankingService.getMyPhotographyOfYearEntry(contestId, userId))
            .photos.map(photo => [photo.contestPhotoId, photo.voteCount]))
        : null
    const photos = await Promise.all(participantPhotos.map(async photo => ({
        ...photo,
        voteCount:potyVotes ? (potyVotes.get(photo.id) ?? 0) : await voteService.getVoteCount(photo.id)
    })))
    const totalVotes = photos.reduce((pre, photo) => photo.voteCount + pre, 0)

    return {...details, photos, totalVotes, achievements, rank:levelData.currentLevel}
}

const getMyCompletedContest = async (userId:string, skip?:number, take?:number) => {

    if (!userId){
        throw new ApiError(httpstatus.BAD_REQUEST, "User id is not provided")
    }
    const user = await prisma.user.findUnique({where:{id:userId}})

    if (!user){
        throw new ApiError(httpstatus.NOT_FOUND, "User not found")
    }

    // Paginate before the per-contest detail/photo/achievement loads below -
    // those run several queries per contest.
    const where:Prisma.ContestWhereInput = {status:{in:contestStatus.completedStatuses}, participants:{some:{userId}}, ...notDeletedContest}
    const [myParticipatedContest, total] = await Promise.all([
        prisma.contest.findMany({where, orderBy:[{endDate:"desc"}, {id:"desc"}], skip, take}),
        prisma.contest.count({where})
    ])

    // A finished contest's card is frozen - votes are rejected once it leaves
    // the active states and photos cannot be removed after finalization - so
    // the whole per-user card is cached. Anything that can still change it
    // (finalization, awards, selections, achievements) bumps the contest's
    // cache version.
    const cardsByContestId = await contestCache.getMany(
        "completedCard",
        myParticipatedContest,
        async (contests) => new Map(await Promise.all(
            contests.map(async contest => [contest.id, await loadCompletedContestCard(contest.id, userId)] as const)
        )),
        {scope:userId, ttlSeconds:COMPLETED_CARD_TTL_SECONDS}
    )
    const mappetdCompletedContest = myParticipatedContest.map(contest => cardsByContestId.get(contest.id)!)

    return {contests:mappetdCompletedContest, total}
}

const getContestPrizes = async (contestId:string) => prizeService.getContestAwards(contestId)

const getCachedWinners = contestCache.cachedLoader("winners", contest => loadContestWinners(contest.id))

const getContestWinners = async (contestId:string) => {
    const contest = await prisma.contest.findFirst({where:{id:contestId, status:{in:contestStatus.completedStatuses}}})

    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }

    return getCachedWinners(contest)
}

const loadContestWinners = async (contestId:string) => {
    const grants = await contestFinalizationService.getContestAwardResults(contestId)
    if(grants.length > 0){
        const [users, photos] = await Promise.all([
            prisma.user.findMany({
                where:{id:{in:[...new Set(grants.map(grant => grant.userId))]}},
                select:{id:true, avatar:true, fullName:true, firstName:true, lastName:true}
            }),
            prisma.contestPhoto.findMany({
                where:{id:{in:grants.flatMap(grant => grant.photoId ? [grant.photoId] : [])}},
                include:{photo:{select:{id:true, url:true, title:true}}}
            })
        ])
        const userById = new Map(users.map(user => [user.id,user]))
        const photoById = new Map(photos.map(photo => [photo.id,photo]))
        return grants.map(grant => ({
            ...grant,
            user:userById.get(grant.userId),
            photo:grant.photoId ? photoById.get(grant.photoId) : null
        }))
    }

    return prisma.contestAchievement.findMany({
        where:{contestId, kind:AchievementKind.CONTEST_AWARD},
        include:{participant:{include:{user:{select:{avatar:true, fullName:true, firstName:true, lastName:true}}}}}
    })
}

const getRemainingPhotos = async (userId:string, contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "conetest not found")
    }
    
    const contestUploads = await prisma.contestPhoto.findMany({
        where:{contestId, participant:{userId}, photoId:{not:null}},
        select:{photoId:true}
    })
    const usedPhotoIds = contestUploads
        .map(upload => upload.photoId)
        .filter((photoId): photoId is string => Boolean(photoId))
    const userPhotos = await prisma.userPhoto.findMany({
        where:{userId, ...(usedPhotoIds.length > 0 && {id:{notIn:usedPhotoIds}})},
        // Include the same upload metadata used by SUBMISSION_FORMAT validation
        // so the client can explain/disable an ineligible gallery photo before
        // the user submits the form. The server remains the source of truth.
        select:{id:true, url:true, labels:true, categories:true, mimeType:true, width:true, height:true, sizeBytes:true},
        orderBy:[{createdAt:"desc"}, {id:"desc"}]
    })
    
    return userPhotos
}

const getContestUploads = async (userId:string,contestId:string)=>{

    const contest = await prisma.contest.findUnique({where:{id:contestId}})
    if(!contest){
        throw new ApiError(httpstatus.NOT_FOUND, "contest not found")
    }
    const participant = await isContestParticipantExist(userId, contestId)

    if( !participant){
        throw new ApiError(httpstatus.NOT_FOUND, "user is not in the participation list")
    }


    const voterVotes = await prisma.vote.findMany({
        where:{contestId, providerId:participant.userId},
        select:{contestPhotoId:true}
    })
    const contestUploads = await prisma.contestPhoto.findMany({
        where:{contestId, id:{notIn:voterVotes.map(vote => vote.contestPhotoId)}},
        orderBy:[{createdAt:"asc"}, {id:"asc"}],
        include:{photo:{select:{id:true, url:true}}}
    })

    const voteCountByContestPhotoId = await voteService.getVoteCountsForContestPhotos(contestUploads.map(upload => upload.id))
    const uploads = contestUploads.flatMap(upload => {
        if(!upload.photo){
            return []
        }
        return [{
            id:upload.id,
            createdAt:upload.createdAt,
            voteCount:voteCountByContestPhotoId.get(upload.id) ?? 0,
            photo:upload.photo
        }]
    })

    return sortByVotesThenUploadSequence(uploads).map(upload =>
        contestPhotoPresenter.toVotablePhoto(upload.id, upload.photo, upload.voteCount)
    )
}

const getContestPhotoCount = async (contestId:string) => {
    const photoCount = await prisma.contestPhoto.count({where:{contestId:contestId}})

    return photoCount
}

export const contestQueryService = {
    getContestById,
    getContestByUserId,
    getAllContests,
    getPublicContests,
    getContestsByStatus,
    getContestUploadsByUserId,
    getContestUploads,
    getMyActiveContests,
    getMyCompletedContest,
    getContestPrizes,
    getContestWinners,
    getRemainingPhotos,
    getContestPhotoCount,
}
