import prisma from "../../../shared/prisma";
import globalEventHandler from "../eventEmitter";
import Events from "../events.constant";

globalEventHandler.on(Events.NEW_VOTE, async ({photoId, contestId}:{photoId:string, contestId:string})=>{

    const photo = await prisma.contestPhoto.findFirst({where:{photoId, contestId},include:{participant:true}})

})