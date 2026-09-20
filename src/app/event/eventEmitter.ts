// ./event/eventEmitter.ts
import { EventEmitter } from "events";



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
            if(result.status === "rejected") console.error(`Event listener failed for ${event}`, result.reason)
        })
    }

}

const globalEventHandler = new GlobalEventHandler()

export default globalEventHandler 
