import globalEventHandler from "../../event/eventEmitter";
import Events from "../../event/events.constant";

globalEventHandler.on(Events.USER_REGISTERED, (data)=>{
    console.log("New User regsitered", data)
})

globalEventHandler.on(Events.NEW_VOTE, (photoId)=>{
    console.log(`${photoId} got a new vote`)
})