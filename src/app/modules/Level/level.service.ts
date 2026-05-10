import ApiError from "../../../errors/ApiError"
import { LevelName, LevelRequirement } from "../../../prismaClient"
import { paginationHelper } from "../../../helpers/paginationHelper"
import prisma from "../../../shared/prisma"
import httpStatus from 'http-status'



// model Level {
//   id         String @id @default(auto()) @map("_id") @db.ObjectId
//   level       Int
//   levelName   LevelName
//   requirements    LevelRequirement[]

//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt

//   UserLevel UserLevel[]
// }

const addLevel = async (order:number, name:LevelName, requirements:LevelRequirement[])=>{

    const level = await prisma.level.create({data:{level:order, levelName:name, requirements}})

    return level
}   

const editLevel = async (levelId:string, newRequirements:{title:string, required:number}[])=>{
    const level = await prisma.level.findUnique({where:{id:levelId}})
    if(!level){
        throw new ApiError(httpStatus.NOT_FOUND, "level not found")
    }

        
    let editedrequirements = level.requirements.map( savedRequirement => {
        
        let newR = newRequirements.find( r => r.title === savedRequirement.title)
        if(newR)
            savedRequirement.required = newR.required

        return savedRequirement
    })

    await prisma.level.update({where:{id:levelId}, data:{requirements:editedrequirements}})
}

const deleteLevl  =async (levelId:string)=> {
    const level = await prisma.level.delete({where:{id:levelId}})
    return level
}

const getLevels = async (page: number = 1, limit: number = 10)=>{
    const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({ page, limit });
    
    const levels = await prisma.level.findMany({skip, take: paginationLimit, orderBy: { level: 'asc' }})

    const total = await prisma.level.count();
    const paginationMetaData = paginationHelper.getPaginationMetaData(page, paginationLimit, total);

    return { data: levels, meta: paginationMetaData };
}



const getLevelByOrder = async (order:number) => {
    const level = await prisma.level.findFirst({where:{level:order}})

    return level
}
export const levelService =  {
    addLevel,
    editLevel,
    deleteLevl,
    getLevels,
    getLevelByOrder
}