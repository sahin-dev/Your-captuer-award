// ./event/eventEmitter.ts
import { EventEmitter } from "events";
import logger from "../../shared/logger";



class GlobalEventHandler extends EventEmitter {


    async subscribe(event:string,handler:(data:any)=>void){
        this.on(event, handler)
    }

    async publish(event:string, data:any){
        const results = this.listeners(event).map(listener =>
            Promise.resolve().then(() => listener(data))
        )
        const settled = await Promise.allSettled(results)
        settled.forEach(result => {
            if(result.status === "rejected") logger.error({ err: result.reason, event }, "Event listener failed")
        })
    }

}

const globalEventHandler = new GlobalEventHandler()

export default globalEventHandler 
