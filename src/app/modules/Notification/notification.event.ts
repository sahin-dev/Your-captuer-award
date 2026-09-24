import globalEventHandler from "../../event/eventEmitter";
import Events from "../../event/events.constant";
import logger from "../../../shared/logger";

globalEventHandler.on(Events.USER_REGISTERED, (data)=>{
    logger.info({ userId: data?.id }, "New user registered")
})
