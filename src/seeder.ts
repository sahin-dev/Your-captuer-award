import bcrypt from 'bcryptjs'
import {
    ContestParticipant,
    ContestPhoto,
    ContestStatus,
    LevelName,
    PrismaClient,
    PrizeType,
    UserRole,
    VoteType
} from "./prismaClient"
import { LEVEL_RULES, LevelRule } from "./app/modules/Level/level.config"

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
            const requirements = [
                {title:"received_votes", required:levelRule.receivedVotes},
                {title:"promoted_votes", required:levelRule.promotedVotes},
                ...levelRule.badges.map(badge => ({
                    title:`badge:${badge.category}`,
                    required:badge.required
                }))
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
                    level_requirements:[100, 250, 500, 1000, 1500],
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
                level_requirements:[100, 250, 500, 1000, 1500],
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
                power
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

    private async seedBadgeHistory(participantId:string, contestId:string, photoId:string, targetLevel?:LevelRule){
        if(!targetLevel){
            await this.db.contestAchievement.create({
                data:{participantId, contestId, photoId, category:PrizeType.TOP_100}
            })
            return
        }

        for(const badgeRequirement of targetLevel.badges){
            for(let idx = 0; idx < badgeRequirement.required; idx++){
                await this.db.contestAchievement.create({
                    data:{
                        participantId,
                        contestId,
                        photoId,
                        category:badgeRequirement.category
                    }
                })
            }
        }

        await this.db.contestAchievement.create({
            data:{participantId, contestId, photoId, category:PrizeType.TOP_PHOTO}
        })
        await this.db.contestAchievement.create({
            data:{participantId, contestId, photoId, category:PrizeType.TOP_PHOTOGRAPHER}
        })
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
            default:
                console.log("Available commands: create:admin, seed:levels-demo, -reset")
        }
    }finally{
        await seeder.destroyClient()
    }
}

SeederCLI().catch(err => {
    console.error(err)
    process.exit(1)
})
