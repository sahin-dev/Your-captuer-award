import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from "./prismaClient"

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
            default:
                console.log("Unknown command. Valid options: -reset, create:admin, seed:bots, delete:bots")
        }
    } catch (error) {
        console.error("Error during execution:", error)
    } finally {
        seeder.destroyClient()
    }
}

SeederCLI()