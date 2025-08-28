import prisma from "../../../shared/prisma";
import { contestService } from "../../modules/Contest/contest.service";
import globalEventHandler from "../eventEmitter";
import Events from "../events.constant";

globalEventHandler.on(Events.NEW_VOTE, async ({photoId, contestId}:{photoId:string, contestId:string})=>{

    const photo = await prisma.contestPhoto.findFirst({where:{photoId, contestId},include:{participant:true}})
    const getContestDetails = await contestService.getContestById(contestId)

})

globalEventHandler.on(Events.CONTEST_ENDED, async (contestId:string)=>{

    console.log(`${contestId} has ended`)

})