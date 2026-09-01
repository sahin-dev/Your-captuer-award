import bcrypt from 'bcryptjs'
import {
    AchievementKind,
    AwardTarget,
    ContestParticipant,
    ContestPhoto,
    ContestStatus,
    LevelName,
    LevelRequirementTitle,
    Prize,
    PrismaClient,
    PrizeType,
    UserRole,
    VoteType
} from "./prismaClient"
import { LEVEL_RULES, LevelRule } from "./app/modules/Level/level.config"
import { contestRuleDefinitions } from "./app/modules/Contest/ContestRules/contestRule.definitions"
import { contestRuleService } from "./app/modules/Contest/ContestRules/contestRules.service"
import { getContestLevelBadge, getContestLevelOrder, isContestLevelPrizeType, normalizeAwardIdentity } from "./app/modules/Awards/award.definitions"
import { defaultPrizeDefinitions } from "./app/modules/Prize/prize.definitions"

type SeedUserDefinition = {
    email:string;
    username:string;
    fullName:string;
    targetLevel?:LevelRule;
}

const seedUsers:SeedUserDefinition[] = [
    {
        email:"seed-new@yca.test",
        username:"seed_new",
        fullName:"Seed New User"
    },
    {
        email:"seed-apprentice@yca.test",
        username:"seed_apprentice",
        fullName:"Seed Apprentice User",
        targetLevel:LEVEL_RULES[0]
    },
    {
        email:"seed-student@yca.test",
        username:"seed_student",
        fullName:"Seed Student User",
        targetLevel:LEVEL_RULES[1]
    },
    {
        email:"seed-contender@yca.test",
        username:"seed_contender",
        fullName:"Seed Contender User",
        targetLevel:LEVEL_RULES[4]
    },
    {
        email:"seed-pro@yca.test",
        username:"seed_pro",
        fullName:"Seed Pro User",
        targetLevel:LEVEL_RULES[8]
    },
    {
        email:"seed-voter@yca.test",
        username:"seed_voter",
        fullName:"Seed Voter"
    }
]

const contestCategories = [
    {slug:"street-photography", name:"Street photography", order:10},
    {slug:"portrait", name:"Portrait", order:20},
    {slug:"landscape", name:"Landscape", order:30},
    {slug:"nature-wildlife", name:"Nature and wildlife", order:40},
    {slug:"architecture", name:"Architecture", order:50},
    {slug:"travel", name:"Travel", order:60},
    {slug:"documentary", name:"Documentary", order:70},
    {slug:"fine-art", name:"Fine art", order:80},
]

class DatabaseSeeder {

    private client?:PrismaClient;

    constructor(){
        console.log("Initializing seeder")
        this.init()
        console.log("initializing seeder finished")
    }

    init ():void{
         let dbUrl = process.env.DATABASE_URL

         if (!dbUrl){
            throw new Error("Database is not defined")
         }
        this.client = new PrismaClient({datasourceUrl:dbUrl})

    }

    private get db(){
        if(!this.client){
            throw new Error("Client not initialized")
        }

        return this.client
    }

    async createAdmin(email:string, password:string){
        let existingAdmin = await this.db.user.findUnique({where:{email}})
        if(existingAdmin){
            console.log("user with this email already exist")
            return
        }
        let hashedPassword = await bcrypt.hash(password, 12)
       let admin =  await this.db.user.create({data:{email, password:hashedPassword, username:"admin", role:UserRole.ADMIN}})
       if(admin){
        
            console.log(`Admin Created.\nEmail: ${email}.\nPassowrd:${password}`)
       }else {
            console.log('Admin creation failed!')
       }
    }

    async reset ():Promise<void>{
        await this.db.user.deleteMany()
    }

    private async seedLevels(){
        for(const levelRule of LEVEL_RULES){
            const topBadgeRequirement = levelRule.badges.reduce((max, badge) => Math.max(max, badge.required), 0)
            const requirements = [
                {title:LevelRequirementTitle.votes, required:levelRule.receivedVotes},
                {title:LevelRequirementTitle.top_photographer, required:topBadgeRequirement}
            ]

            const existingLevel = await this.db.level.findFirst({
                where:{OR:[{level:levelRule.order}, {levelName:levelRule.levelName}]}
            })

            if(existingLevel){
                await this.db.level.update({
                    where:{id:existingLevel.id},
                    data:{
                        level:levelRule.order,
                        levelName:levelRule.levelName,
                        requirements
                    }
                })
            }else {
                await this.db.level.create({
                    data:{
                        level:levelRule.order,
                        levelName:levelRule.levelName,
                        requirements
                    }
                })
            }
        }
    }

    private async upsertSeedUser(userSeed:SeedUserDefinition, password:string){
        const hashedPassword = await bcrypt.hash(password, 12)
        const currentLevel = userSeed.targetLevel?.order ?? -1
        const votingPower = userSeed.targetLevel?.votePower ?? 1

        return this.db.user.upsert({
            where:{email:userSeed.email},
            update:{
                username:userSeed.username,
                fullName:userSeed.fullName,
                firstName:userSeed.fullName.split(" ")[1] || "Seed",
                lastName:userSeed.fullName.split(" ").slice(2).join(" ") || "User",
                isActive:true,
                currentLevel,
                voting_power:votingPower,
                role:UserRole.USER
            },
            create:{
                email:userSeed.email,
                password:hashedPassword,
                username:userSeed.username,
                fullName:userSeed.fullName,
                firstName:userSeed.fullName.split(" ")[1] || "Seed",
                lastName:userSeed.fullName.split(" ").slice(2).join(" ") || "User",
                isActive:true,
                currentLevel,
                voting_power:votingPower,
                role:UserRole.USER
            }
        })
    }

    private async attachSeedLevel(userId:string, levelName?:LevelName){
        if(!levelName){
            return
        }

        const level = await this.db.level.findFirst({where:{levelName}})
        if(!level){
            return
        }

        await this.db.userLevel.upsert({
            where:{userId},
            update:{levelId:level.id},
            create:{userId, levelId:level.id}
        })
    }

    private async getOrCreateShowcaseContest(creatorId:string){
        const title = "Seed Level Showcase Contest"
        const existingContest = await this.db.contest.findFirst({where:{title}})

        if(existingContest){
            return this.db.contest.update({
                where:{id:existingContest.id},
                data:{
                    creatorId,
                    status:ContestStatus.CLOSED,
                    startDate:new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    endDate:new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            })
        }

        return this.db.contest.create({
            data:{
                creatorId,
                title,
                description:"Seed contest used to demonstrate achievement badges and user level progression.",
                status:ContestStatus.CLOSED,
                startDate:new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                endDate:new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
        })
    }

    private async getOrCreateSeedPhoto(userId:string, title:string){
        const existingPhoto = await this.db.userPhoto.findFirst({
            where:{userId, title}
        })

        if(existingPhoto){
            return existingPhoto
        }

        return this.db.userPhoto.create({
            data:{
                userId,
                title,
                url:`https://picsum.photos/seed/${encodeURIComponent(title)}/1200/800`,
                description:"Seeded photo for level and achievement testing."
            }
        })
    }

    private async getOrCreateParticipant(contestId:string, userId:string){
        return this.db.contestParticipant.upsert({
            where:{contestId_userId:{contestId, userId}},
            update:{status:"ACTIVE"},
            create:{contestId, userId}
        })
    }

    private async getOrCreateContestPhoto(contestId:string, participantId:string, photoId:string, title:string, promoted:boolean){
        const existingUpload = await this.db.contestPhoto.findFirst({
            where:{contestId, participantId, photoId}
        })

        if(existingUpload){
            return this.db.contestPhoto.update({
                where:{id:existingUpload.id},
                data:{
                    title,
                    promoted,
                    promotionExpiresAt:promoted ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null
                }
            })
        }

        return this.db.contestPhoto.create({
            data:{
                contestId,
                participantId,
                photoId,
                title,
                promoted,
                promotionExpiresAt:promoted ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null
            }
        })
    }

    private async createContestBadgeAchievementContest(userId:string, title:string, bannerUrl:string, contestLevel?:PrizeType){
        const existingContest = await this.db.contest.findFirst({where:{title}})
        const contest = existingContest
            ? await this.db.contest.update({
                where:{id:existingContest.id},
                data:{banner:bannerUrl, status:ContestStatus.CLOSED}
            })
            : await this.db.contest.create({
                data:{
                    creatorId:userId,
                    title,
                    description:`Seeded contest for ${title}`,
                    banner:bannerUrl,
                    status:ContestStatus.CLOSED,
                    startDate:new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    endDate:new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            })

        const participantData:any = {status:"ACTIVE"}
        if(contestLevel){
            participantData.level = contestLevel
        }

        const participant = await this.db.contestParticipant.upsert({
            where:{contestId_userId:{contestId:contest.id, userId}},
            update:participantData,
            create:{contestId:contest.id, userId, ...participantData}
        })

        const photoTitle = `${title} achievement photo`
        const existingPhoto = await this.db.userPhoto.findFirst({where:{userId, title:photoTitle}})
        const photo = existingPhoto || await this.db.userPhoto.create({
            data:{
                userId,
                title:photoTitle,
                url:`https://picsum.photos/seed/${encodeURIComponent(photoTitle)}/1200/800`,
                description:"Seeded contest badge achievement photo."
            }
        })

        const contestPhoto = await this.getOrCreateContestPhoto(contest.id, participant.id, photo.id, photo.title || photoTitle, true)
        return {contest, participant, contestPhoto}
    }

    private async clearSeedProgress(participantIds:string[], contestPhotoIds:string[]){
        if(participantIds.length > 0){
            await this.db.contestAchievement.deleteMany({
                where:{participantId:{in:participantIds}}
            })
        }

        if(contestPhotoIds.length > 0){
            await this.db.vote.deleteMany({
                where:{photoId:{in:contestPhotoIds}}
            })
        }
    }

    private async createVote(providerId:string, contestId:string, photoId:string, type:VoteType, power:number){
        await this.db.vote.create({
            data:{
                providerId,
                contestId,
                photoId,
                type,
                power,
                weight:power
            }
        })
    }

    private async seedVotesForTarget(providerId:string, contestId:string, organicPhotoId:string, promotedPhotoId:string, targetLevel?:LevelRule){
        if(!targetLevel){
            await this.createVote(providerId, contestId, organicPhotoId, VoteType.Organic, 75)
            return
        }

        const promotedPower = targetLevel.promotedVotes
        const organicPower = Math.max(targetLevel.receivedVotes - promotedPower, 0)

        if(organicPower > 0){
            await this.createVote(providerId, contestId, organicPhotoId, VoteType.Organic, organicPower)
        }

        await this.createVote(providerId, contestId, promotedPhotoId, VoteType.Promoted, promotedPower)
    }

    private achievementKindForCategory(category:PrizeType){
        return isContestLevelPrizeType(category) ? AchievementKind.CONTEST_LEVEL : AchievementKind.CONTEST_AWARD
    }

    private async seedBadgeHistory(participantId:string, contestId:string, photoId:string, targetLevel?:LevelRule){
        if(!targetLevel){
            await this.db.contestAchievement.create({
                data:{participantId, contestId, photoId, category:PrizeType.TOP_100_PHOTOGRAPHER, kind:this.achievementKindForCategory(PrizeType.TOP_100_PHOTOGRAPHER)}
            })
            return
        }

        for(const badgeRequirement of targetLevel.badges){
            for(let idx = 0; idx < badgeRequirement.required; idx++){
                const category = badgeRequirement.categories[0]
                await this.db.contestAchievement.create({
                    data:{
                        participantId,
                        contestId,
                        photoId,
                        category,
                        kind:this.achievementKindForCategory(category)
                    }
                })
            }
        }

        await this.db.contestAchievement.create({
            data:{participantId, contestId, photoId, category:PrizeType.TOP_PHOTO, kind:AchievementKind.CONTEST_AWARD}
        })
        await this.db.contestAchievement.create({
            data:{participantId, contestId, photoId, category:PrizeType.TOP_PHOTOGRAPHER, kind:AchievementKind.CONTEST_AWARD}
        })
    }

    async seedAchievementsForUser(userId?:string, email?:string){
        const targetUser = userId
            ? await this.db.user.findUnique({where:{id:userId}})
            : email
                ? await this.db.user.findUnique({where:{email}})
                : null

        if(!targetUser){
            throw new Error(`User not found for id=${userId ?? ""} email=${email ?? ""}`)
        }

        const contestTitle = `Achievement seed contest for ${targetUser.email}`
        const existingContest = await this.db.contest.findFirst({where:{title:contestTitle}})
        const contest = existingContest
            ? await this.db.contest.update({
                where:{id:existingContest.id},
                data:{status:ContestStatus.CLOSED}
            })
            : await this.db.contest.create({
                data:{
                    creatorId:targetUser.id,
                    title:contestTitle,
                    description:"Seeded contest used to attach achievement badges for a specific user.",
                    status:ContestStatus.CLOSED,
                    startDate:new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    endDate:new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            })

        const participant = await this.db.contestParticipant.upsert({
            where:{contestId_userId:{contestId:contest.id, userId:targetUser.id}},
            update:{status:"ACTIVE"},
            create:{contestId:contest.id, userId:targetUser.id}
        })

        const existingPhoto = await this.db.userPhoto.findFirst({
            where:{userId:targetUser.id, title:`Achievement seed photo for ${targetUser.username}`}
        })

        const photo = existingPhoto
            ? existingPhoto
            : await this.db.userPhoto.create({
                data:{
                    userId:targetUser.id,
                    title:`Achievement seed photo for ${targetUser.username}`,
                    url:`https://picsum.photos/seed/${encodeURIComponent(targetUser.email)}/1200/800`,
                    description:"Seeded photo used for achievement records."
                }
            })

        const existingContestPhoto = await this.db.contestPhoto.findFirst({
            where:{contestId:contest.id, photoId:photo.id}
        })
        const contestPhoto = existingContestPhoto
            ? await this.db.contestPhoto.update({
                where:{id:existingContestPhoto.id},
                data:{title:photo.title, promoted:true, promotionExpiresAt:new Date(Date.now() + 24 * 60 * 60 * 1000)}
            })
            : await this.db.contestPhoto.create({
                data:{
                contestId:contest.id,
                participantId:participant.id,
                photoId:photo.id,
                title:photo.title,
                promoted:true,
                promotionExpiresAt:new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
            })

        const achievementsToSeed = [
            {category:PrizeType.TOP_PHOTO, kind:AchievementKind.CONTEST_AWARD},
            {category:PrizeType.TOP_PHOTOGRAPHER, kind:AchievementKind.CONTEST_AWARD},
            {category:PrizeType.WINNER, kind:AchievementKind.CONTEST_AWARD}
        ] as const

        let createdCount = 0
        for(const achievement of achievementsToSeed){
            const existing = await this.db.contestAchievement.findFirst({
                where:{
                    contestId:contest.id,
                    participantId:participant.id,
                    photoId:contestPhoto.id,
                    category:achievement.category,
                    kind:achievement.kind
                }
            })

            if(!existing){
                await this.db.contestAchievement.create({
                    data:{
                        participantId:participant.id,
                        contestId:contest.id,
                        photoId:contestPhoto.id,
                        category:achievement.category,
                        kind:achievement.kind
                    }
                })
                createdCount += 1
            }
        }

        console.log(`Seeded ${createdCount} achievements for user ${targetUser.email} (${targetUser.id})`)
        console.log(`Contest ID: ${contest.id}`)
        console.log(`Participant ID: ${participant.id}`)
        console.log(`Contest photo ID: ${contestPhoto.id}`)

        const levelBadges: Array<{category:PrizeType; title:string}> = [
            {category:PrizeType.AMATEUR, title:"Amateur Badge"},
            {category:PrizeType.TALENTED, title:"Talented Badge"},
            {category:PrizeType.SUPREME, title:"Supreme Badge"}
        ]

        let highestLevelOrder = targetUser.currentLevel ?? -1

        for(const levelBadge of levelBadges){
            const title = `${levelBadge.title} Contest for ${targetUser.username || targetUser.email}`
            const bannerUrl = `https://picsum.photos/seed/${encodeURIComponent(title)}/1600/900`
            const {contest: badgeContest, participant: badgeParticipant, contestPhoto: badgeContestPhoto} = await this.createContestBadgeAchievementContest(targetUser.id, title, bannerUrl, levelBadge.category)

            const existingBadge = await this.db.contestAchievement.findFirst({
                where:{
                    contestId:badgeContest.id,
                    participantId:badgeParticipant.id,
                    photoId:badgeContestPhoto.id,
                    category:levelBadge.category,
                    kind:AchievementKind.CONTEST_LEVEL
                }
            })

            if(!existingBadge){
                await this.db.contestAchievement.create({
                    data:{
                        participantId:badgeParticipant.id,
                        contestId:badgeContest.id,
                        photoId:badgeContestPhoto.id,
                        category:levelBadge.category,
                        kind:AchievementKind.CONTEST_LEVEL,
                        levelBadge:getContestLevelBadge(levelBadge.category),
                        levelOrder:getContestLevelOrder(levelBadge.category) || 0
                    }
                })
                createdCount += 1
            }

            const rule = LEVEL_RULES.find(rule => rule.badges.some(b => b.categories.includes(levelBadge.category)))
            if(rule && rule.order > highestLevelOrder){
                highestLevelOrder = rule.order
            }
        }

        if(highestLevelOrder > (targetUser.currentLevel ?? -1)){
            const levelRecord = await this.db.level.findFirst({where:{level:highestLevelOrder}})
            if(levelRecord){
                await this.db.userLevel.upsert({
                    where:{userId:targetUser.id},
                    create:{userId:targetUser.id, levelId:levelRecord.id},
                    update:{levelId:levelRecord.id}
                })
            }

            await this.db.user.update({
                where:{id:targetUser.id},
                data:{currentLevel:highestLevelOrder}
            })
        }

        console.log(`Also seeded level badge achievements and updated level data for ${targetUser.email}`)
    }

    private getSeedContestRules(){
        return [
            {
                key:"SUBMISSION_LIMIT",
                value:4,
                enabled:true,
                order:contestRuleDefinitions.SUBMISSION_LIMIT.order
            },
            {
                key:"SUBMISSION_RULES",
                value:[
                    "Non-relevant images are not allowed.",
                    "Similar images with the same subject, background, foreground, and location are not allowed.",
                    "The same image cannot be submitted multiple times, including cropped, angle, or tone changes.",
                    "AI-generated images are not allowed.",
                    "Images that do not comply may be removed from the challenge."
                ],
                enabled:true,
                order:contestRuleDefinitions.SUBMISSION_RULES.order
            },
            {
                key:"LEVEL_REQUIREMENTS",
                value:[
                    {level:"AMATEUR", votes:50},
                    {level:"TALENTED", votes:250},
                    {level:"SUPREME", votes:900},
                    {level:"SUPERIOR", votes:1900},
                    {level:"TOP_NOTCH", votes:5000}
                ],
                enabled:true,
                order:contestRuleDefinitions.LEVEL_REQUIREMENTS.order
            },
            {
                key:"SUBMISSION_FORMAT",
                value:{
                    mimeTypes:["image/jpeg", "image/png"],
                    minWidth:700,
                    minHeight:700,
                    maxSizeMB:25
                },
                enabled:true,
                order:contestRuleDefinitions.SUBMISSION_FORMAT.order
            },
            {
                key:"ELIGIBILITY",
                value:{
                    minAge:18,
                    text:"Open to all photographers ages 18 and above. Photos must not contain obscene, provocative, defamatory, sexually explicit, or otherwise objectionable or inappropriate content. Photos deemed inappropriate will be disqualified. Challenge void where prohibited.",
                    requiresAcceptance:true
                },
                enabled:true,
                order:contestRuleDefinitions.ELIGIBILITY.order
            },
            {
                key:"COPYRIGHT",
                value:{
                    text:"You maintain the copyrights to all photos you submit. You must own all submitted images.",
                    requiresOwnership:true,
                    requiresAcceptance:true
                },
                enabled:true,
                order:contestRuleDefinitions.COPYRIGHT.order
            },
            {
                key:"VOTING",
                value:{
                    text:"Voting is done by members of the site only. The voting system uses a blind voting method which is designed to keep the voting as fair as possible.",
                    membersOnly:true,
                    requireContestParticipant:true,
                    disallowSelfVote:true,
                    blindVoting:true
                },
                enabled:true,
                order:contestRuleDefinitions.VOTING.order
            },
            {
                key:"PARTICIPATION",
                value:{
                    text:"By entering this challenge you accept the standard Terms of Use.",
                    requiresTermsAcceptance:true,
                    termsUrl:"/terms"
                },
                enabled:true,
                order:contestRuleDefinitions.PARTICIPATION.order
            }
        ]
    }

    private async upsertPrizeDefinition(category:PrizeType, title:string, description:string, icon:string, values:{boost?:number; key?:number; swap?:number; coin?:number}, options:{target?:AwardTarget; rankLimit?:number; isDefault?:boolean; order?:number} = {}){
        const identity = normalizeAwardIdentity({category, ...options})
        const existingPrize = await this.db.prize.findFirst({
            where:{
                type:identity.type,
                target:identity.target,
                rankLimit:identity.rankLimit
            }
        })
        const data = {
            category:identity.category,
            type:identity.type,
            target:identity.target,
            rankLimit:identity.rankLimit,
            title,
            description,
            icon,
            boost:values.boost || 0,
            key:values.key || 0,
            swap:values.swap || 0,
            coin:values.coin || 0,
            isActive:true,
            isDefault:options.isDefault || false,
            order:options.order || 0
        }

        if(existingPrize){
            return this.db.prize.update({
                where:{id:existingPrize.id},
                data
            })
        }

        return this.db.prize.create({data})
    }

    async seedContestCategories(){
        for(const category of contestCategories){
            await this.db.contestCategory.upsert({
                where:{slug:category.slug},
                update:{...category, isActive:true},
                create:{...category, isActive:true}
            })
        }

        console.log(`Seeded ${contestCategories.length} contest categories`)
    }

    async seedPrizeDefinitions(){
        const prizes:Prize[] = []

        for(const definition of defaultPrizeDefinitions){
            prizes.push(await this.upsertPrizeDefinition(
                definition.category,
                definition.title,
                definition.description,
                definition.icon,
                {
                    boost:definition.boost,
                    key:definition.key,
                    swap:definition.swap,
                    coin:definition.coin
                },
                {
                    target:definition.target,
                    rankLimit:definition.rankLimit || undefined,
                    isDefault:definition.isDefault,
                    order:definition.order
                }
            ))
        }

        await this.db.prize.updateMany({
            where:{id:{notIn:prizes.map(prize => prize.id)}},
            data:{isActive:false, isDefault:false}
        })

        const [activeCount, defaultCount] = await Promise.all([
            this.db.prize.count({where:{isActive:true}}),
            this.db.prize.count({where:{isActive:true, isDefault:true}})
        ])

        console.log(`Seeded ${prizes.length} prize definitions (${activeCount} active, ${defaultCount} contest defaults)`)
        return prizes
    }

    async seedContestConfigDemo(){
        const adminEmail = process.env.ADMIN_EMAIL || "admin@email.com"
        const adminPassword = process.env.ADMIN_PASSWORD || "admin1122"
        await this.createAdmin(adminEmail, adminPassword)

        const admin = await this.db.user.findUnique({where:{email:adminEmail}})
        if(!admin){
            throw new Error("Admin user was not created")
        }

        const prizes = (await this.seedPrizeDefinitions()).filter(prize => prize.isDefault)

        const title = "Seed Configurable Rules Contest"
        const rules = this.getSeedContestRules()
        const existingContest = await this.db.contest.findFirst({where:{title}})
        const contestData = {
            creatorId:admin.id,
            title,
            description:"Seed contest with configurable rules and contest-specific awards.",
            status:ContestStatus.ACTIVE,
            startDate:new Date(Date.now() - 60 * 60 * 1000),
            endDate:new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            rules,
            prizes:null
        }

        const contest = existingContest
            ? await this.db.contest.update({where:{id:existingContest.id}, data:contestData})
            : await this.db.contest.create({data:contestData})

        await this.db.contestRuleConfig.deleteMany({where:{contestId:contest.id}})
        await this.db.contestRuleConfig.createMany({
            data:rules.map(rule => ({
                contestId:contest.id,
                key:rule.key,
                value:rule.value,
                enabled:rule.enabled,
                order:rule.order
            }))
        })

        await this.db.contestAward.deleteMany({where:{contestId:contest.id}})
        await this.db.contestAward.createMany({
            data:prizes.map(prize => ({
                contestId:contest.id,
                prizeId:prize.id,
                category:prize.category,
                type:prize.type,
                target:prize.target,
                rankLimit:prize.rankLimit,
                slotKey:`${prize.type}:${prize.target}`,
                title:`Seed ${prize.title}`,
                description:`Contest-specific ${prize.description}`,
                icon:prize.icon,
                boost:prize.boost,
                key:prize.key,
                swap:prize.swap,
                coin:prize.coin,
                enabled:true,
                order:prize.order
            }))
        })

        const seededRules = await this.db.contestRuleConfig.findMany({where:{contestId:contest.id}, orderBy:{order:"asc"}})
        const seededAwards = await this.db.contestAward.findMany({where:{contestId:contest.id}, include:{prize:true}})

        console.log("Seeded configurable contest data")
        console.log(`Contest ID: ${contest.id}`)
        console.log(`Admin: ${adminEmail} / ${adminPassword}`)
        console.log(`Rules: ${seededRules.length}`)
        console.log(`Awards: ${seededAwards.length}`)
        console.log("Prize definitions:")
        prizes.forEach(prize => console.log(`- ${prize.category}: ${prize.id}`))
    }

    async seedLevelDemo(){
        const password = process.env.SEED_USER_PASSWORD || "SeedUser1122"
        await this.seedLevels()

        const users = await Promise.all(seedUsers.map(user => this.upsertSeedUser(user, password)))
        const voter = users.find(user => user.email === "seed-voter@yca.test")
        const creator = users[0]

        if(!voter || !creator){
            throw new Error("Seed users were not created")
        }

        for(const seedUser of seedUsers){
            const user = users.find(user => user.email === seedUser.email)
            await this.attachSeedLevel(user?.id as string, seedUser.targetLevel?.levelName)
            await this.db.userStore.upsert({
                where:{userId:user?.id as string},
                update:{key:10, boost:10, swap:10},
                create:{userId:user?.id as string, key:10, boost:10, swap:10}
            })
        }

        const contest = await this.getOrCreateShowcaseContest(creator.id)
        const seededParticipants:{participant:ContestParticipant; seedUser:SeedUserDefinition}[] = []
        const seededUploads:ContestPhoto[] = []

        for(const seedUser of seedUsers.filter(user => user.email !== voter.email)){
            const user = users.find(user => user.email === seedUser.email)
            if(!user){
                continue
            }

            const participant = await this.getOrCreateParticipant(contest.id, user.id)
            const organicPhoto = await this.getOrCreateSeedPhoto(user.id, `${seedUser.username} organic`)
            const promotedPhoto = await this.getOrCreateSeedPhoto(user.id, `${seedUser.username} promoted`)
            const organicUpload = await this.getOrCreateContestPhoto(contest.id, participant.id, organicPhoto.id, `${seedUser.username} organic upload`, false)
            const promotedUpload = await this.getOrCreateContestPhoto(contest.id, participant.id, promotedPhoto.id, `${seedUser.username} promoted upload`, true)

            seededParticipants.push({participant, seedUser})
            seededUploads.push(organicUpload, promotedUpload)
        }

        await this.clearSeedProgress(
            seededParticipants.map(item => item.participant.id),
            seededUploads.map(upload => upload.id)
        )

        for(const {participant, seedUser} of seededParticipants){
            const uploads = seededUploads.filter(upload => upload.participantId === participant.id)
            const organicUpload = uploads.find(upload => !upload.promoted)
            const promotedUpload = uploads.find(upload => upload.promoted)

            if(!organicUpload || !promotedUpload){
                continue
            }

            await this.seedVotesForTarget(voter.id, contest.id, organicUpload.id, promotedUpload.id, seedUser.targetLevel)
            await this.seedBadgeHistory(participant.id, contest.id, promotedUpload.id, seedUser.targetLevel)
        }

        console.log("Seeded level demo data")
        console.log(`Password for seed users: ${password}`)
        console.log("Seed users:")
        seedUsers.forEach(user => console.log(`- ${user.email} (${user.targetLevel?.levelName || "NEW"})`))
    }

    async backfillContestRuleDefaults(){
        const contests = await this.db.contest.findMany({select:{id:true}})
        const defaultRules = contestRuleService.normalizeContestRules()

        let updatedCount = 0
        for(const contest of contests){
            const existingCount = await this.db.contestRuleConfig.count({where:{contestId:contest.id}})
            if(existingCount > 0){
                continue
            }

            await this.db.contestRuleConfig.createMany({
                data:defaultRules.map(rule => ({
                    contestId:contest.id,
                    key:rule.key,
                    value:rule.value,
                    enabled:rule.enabled ?? true,
                    order:rule.order ?? contestRuleDefinitions[rule.key].order
                }))
            })
            updatedCount += 1
        }

        console.log(`Backfilled default contest rules for ${updatedCount} of ${contests.length} contest(s)`)
    }

    async destroyClient(){
        await this.client?.$disconnect()
    }

}


async function SeederCLI (){
    let seeder = new DatabaseSeeder();
    let cmd =  process.argv[2]

    try{
        switch(cmd){
            case "-reset":
                console.log("Reseting database")
                await seeder.reset()
                console.log("Databse reset successfully")
                break
            case "create:admin": {
                let adminEmail = process.env.ADMIN_EMAIL || 'admin@email.com'
                let adminPassword = process.env.ADMIN_PASSWORD ||'admin1122'
                await seeder.createAdmin(adminEmail, adminPassword)
                break
            }
            case "seed:levels-demo":
                await seeder.seedLevelDemo()
                break
            case "seed:contest-config":
                await seeder.seedContestConfigDemo()
                break
            case "seed:prizes":
                await seeder.seedPrizeDefinitions()
                break
            case "seed:contest-categories":
                await seeder.seedContestCategories()
                break
            case "seed:achievements-for-user": {
                const userId = process.argv[3] || process.env.TARGET_USER_ID
                const email = process.argv[4] || process.env.TARGET_EMAIL
                await seeder.seedAchievementsForUser(userId, email)
                break
            }
            case "backfill:contest-rules":
                await seeder.backfillContestRuleDefaults()
                break
            default:
                console.log("Available commands: create:admin, seed:levels-demo, seed:contest-config, seed:prizes, seed:contest-categories, seed:achievements-for-user, backfill:contest-rules, -reset")
        }
    }finally{
        await seeder.destroyClient()
    }
}

SeederCLI().catch(err => {
    console.error(err)
    process.exit(1)
})
