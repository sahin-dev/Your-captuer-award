import { EventEmitter } from "events";
import { registerEventLogger } from "./event.logger";
import Events from "./events.contant";



class GlobalEventHandler extends EventEmitter {
    constructor(){
        super()
    }
   onNewUserRegistered (listener:()=>{}){
    this.on(Events.USER_REGISTERED, listener)
   }

}
const globalEventHandler = new GlobalEventHandler()


export default globalEventHandler 