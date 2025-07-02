import globalEventHandler from "./eventEmitter";
import Events from "./events.contant";

class EventLogger {
    constructor(){
        registerEventLogger()
    }

    regisetrEvents(){
        Object.getOwnPropertyNames(Events).forEach((event)=>{
            globalEventHandler.on(event, ()=>{
                console.log(`${event} is triggered`)
            })
        })

    }
}

export function registerEventLogger(){
    const eventLogger = new EventLogger()
}



