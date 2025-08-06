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
       let admin =  await this.client?.user.create({data:{email, password:hashedPassword, username:"admin", role:UserRole.ADMIN},omit:{level:true}})
       if(admin){
        
            console.log(`Admin Created.\nEmail: ${email}.\nPassowrd:${password}`)
       }else {
            console.log('Admin creation failed!')
       }
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


function  SeederCLI (){
    let seeder = new  DatabaseSeeder();
    let cmd =  process.argv[2]

    switch(cmd){
        case "-reset":
            console.log("Reseting database")
            seeder.reset()
            console.log("Databse reset successfully")
            break
        case "create:admin":
            let adminEmail = process.env.ADMIN_EMAIL || 'admin@email.com'
            let adminPassword = process.env.ADMIN_PASSWORD ||'admin1122'
            seeder.createAdmin(adminEmail, adminPassword)

        default:
            seeder.destroyClient()

            
    }
}

SeederCLI()