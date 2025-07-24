// ./event/eventEmitter.ts
import { EventEmitter } from "events";



class GlobalEventHandler extends EventEmitter {


    async subscribe(event:string,handler:(data:any)=>void){
        this.on(event, handler)
    }

    async publish(event:string, data:any){
        this.emit(event, data)
    }

}

const globalEventHandler = new GlobalEventHandler()

export default globalEventHandler 