import bcrypt from 'bcryptjs'
import { LevelName, LevelRequirementTitle, PrismaClient, UserRole } from "./prismaClient"

class DatabaseSeeder {

    private  client?:PrismaClient;

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

    async createAdmin(email:string, password:string){
        let existingAdmin = await this.client?.user.findUnique({where:{email}})
        if(existingAdmin){
            console.log("user with this email already exist")
            return
        }
        let hashedPassword = await bcrypt.hash(password, 12)
       let admin =  await this.client?.user.create({data:{email, password:hashedPassword, username:"admin", role:UserRole.ADMIN}})
       if(admin){
        
            console.log(`Admin Created.\nEmail: ${email}.\nPassowrd:${password}`)
       }else {
            console.log('Admin creation failed!')
       }
    }

    async seedBots() {
        console.log("Seeding 500 bot user profiles...")
        if (!this.client) {
            throw new Error("Client not initialized")
        }

        // Find the APPRENTICE level once — all bots start at level 1
        const apprenticeLevel = await this.client.level.findFirst({
            where: { levelName: LevelName.APPRENTICE }
        })
        if (!apprenticeLevel) {
            console.warn("[seedBots] APPRENTICE level not found — run `npm run seed:levels` first. Bots will be created without a level.")
        }
        const password = "botpassword123"
        const hashedPassword = await bcrypt.hash(password, 12)

        const batchSize = 50
        const totalBots = 500
        let createdCount = 0

        for (let i = 1; i <= totalBots; i += batchSize) {
            const batchPromises: Promise<any>[] = []
            const end = Math.min(i + batchSize - 1, totalBots)

            for (let j = i; j <= end; j++) {
                const email = `bot${j}@yopmail.com`
                const username = `bot_${j}`
                const firstName = `BotFirst${j}`
                const lastName = `BotLast${j}`
                const fullName = `${firstName} ${lastName}`
                const phone = `+12345678${String(j).padStart(3, '0')}`

                const createPromise = (async () => {
                    const existingUser = await this.client?.user.findUnique({ where: { email } })
                    if (existingUser) {
                        return
                    }
                    const user = await this.client?.user.create({
                        data: {
                            email,
                            username,
                            firstName,
                            lastName,
                            fullName,
                            phone,
                            password: hashedPassword,
                            role: UserRole.USER,
                            isActive: true,
                            location: "Bot City",
                            country: "Bot Country",
                        }
                    })
                    if (user) {
                        await this.client?.userStore.create({
                            data: {
                                userId: user.id,
                                coins: 0,
                                key: 0,
                                boost: 0,
                                swap: 0
                            }
                        })

                        // Assign APPRENTICE level — mirrors what level.event.ts does for real users
                        if (apprenticeLevel) {
                            await this.client?.userLevel.upsert({
                                where:  { userId: user.id },
                                create: { userId: user.id, levelId: apprenticeLevel.id },
                                update: { levelId: apprenticeLevel.id }
                            })
                            await this.client?.user.update({
                                where: { id: user.id },
                                data:  { currentLevel: apprenticeLevel.level }
                            })
                        }

                        createdCount++
                    }
                })()
                batchPromises.push(createPromise)
            }
            await Promise.all(batchPromises)
            console.log(`Progress: seeded up to bot ${end}...`)
        }
        console.log(`Successfully seeded ${createdCount} bot profiles.`)
    }

    async deleteBots() {
        console.log("Deleting bot user profiles...")
        if (!this.client) {
            throw new Error("Client not initialized")
        }

        const bots = await this.client.user.findMany({
            where: {
                email: {
                    endsWith: "@yopmail.com"
                }
            },
            select: {
                id: true
            }
        })

        const botIds = bots.map(b => b.id)

        if (botIds.length === 0) {
            console.log("No bot profiles found to delete.")
            return
        }

        const deletedStores = await this.client.userStore.deleteMany({
            where: {
                userId: {
                    in: botIds
                }
            }
        })

        const deletedUsers = await this.client.user.deleteMany({
            where: {
                id: {
                    in: botIds
                }
            }
        })

        console.log(`Successfully deleted ${deletedUsers.count} bot users and ${deletedStores.count} user stores.`)
    }

    reset ():void{
        if (!this.client){
            throw new Error('Client not initialized')
        }
        this.client.user.deleteMany()
    }

    async seedLevels() {
        console.log("Seeding levels...")
        if (!this.client) {
            throw new Error("Client not initialized")
        }

        const levels: { order: number; levelName: LevelName; votesRequired: number }[] = [
            { order: 1, levelName: LevelName.APPRENTICE,  votesRequired: 0    },
            { order: 2, levelName: LevelName.STUDENT,     votesRequired: 50   },
            { order: 3, levelName: LevelName.TRAINED,     votesRequired: 150  },
            { order: 4, levelName: LevelName.TALENTED,    votesRequired: 350  },
            { order: 5, levelName: LevelName.CONTENDER,   votesRequired: 700  },
            { order: 6, levelName: LevelName.VIRTUOSO,    votesRequired: 1200 },
            { order: 7, levelName: LevelName.LEADER,      votesRequired: 2000 },
            { order: 8, levelName: LevelName.AVANTGARDE,  votesRequired: 3500 },
            { order: 9, levelName: LevelName.PRO,         votesRequired: 5000 },
        ]

        let created = 0
        let skipped = 0

        for (const lvl of levels) {
            const existing = await this.client.level.findFirst({
                where: { levelName: lvl.levelName }
            })

            if (existing) {
                console.log(`  ↳ Skipping ${lvl.levelName} — already exists`)
                skipped++
                continue
            }

            await this.client.level.create({
                data: {
                    level: lvl.order,
                    order: lvl.order,
                    levelName: lvl.levelName,
                    requirements: [
                        {
                            title: LevelRequirementTitle.votes,
                            required: lvl.votesRequired
                        }
                    ]
                }
            })

            console.log(`  ✔ Created ${lvl.levelName} (order: ${lvl.order}, votes: ${lvl.votesRequired})`)
            created++
        }

        console.log(`\nLevels seeded: ${created} created, ${skipped} skipped.`)
    }

    async deleteLevels() {
        console.log("Deleting all levels...")
        if (!this.client) {
            throw new Error("Client not initialized")
        }

        // Delete dependent UserLevel records first
        const deletedUserLevels = await this.client.userLevel.deleteMany({})
        const deletedLevels = await this.client.level.deleteMany({})

        console.log(`Successfully deleted ${deletedLevels.count} levels and ${deletedUserLevels.count} user level records.`)
    }

    destroyClient(){
        this.client?.$disconnect()
    }

}


async function SeederCLI (){
    let seeder = new  DatabaseSeeder();
    let cmd =  process.argv[2]

    try {
        switch(cmd){
            case "-reset":
                console.log("Reseting database")
                seeder.reset()
                console.log("Databse reset successfully")
                break
            case "create:admin":
                let adminEmail = process.env.ADMIN_EMAIL || 'admin@email.com'
                let adminPassword = process.env.ADMIN_PASSWORD ||'admin1122'
                await seeder.createAdmin(adminEmail, adminPassword)
                break
            case "seed:bots":
            case "create:bots":
                await seeder.seedBots()
                break
            case "delete:bots":
                await seeder.deleteBots()
                break
            case "seed:levels":
                await seeder.seedLevels()
                break
            case "delete:levels":
                await seeder.deleteLevels()
                break
            default:
                console.log("Unknown command. Valid options: -reset, create:admin, seed:bots, delete:bots, seed:levels, delete:levels")
        }
    } catch (error) {
        console.error("Error during execution:", error)
    } finally {
        seeder.destroyClient()
    }
}

SeederCLI()