import { PrismaClient } from "@prisma/client"

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
        this.client = new PrismaClient()

    }

    reset ():void{
        if (!this.client){
            throw new Error('Client not initialized')
        }
        this.client.user.deleteMany()
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
        default:
            
    }
}

SeederCLI()