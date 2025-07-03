import { EventEmitter } from "events";



class GlobalEventHandler extends EventEmitter {

    emit<K>(eventName: string | symbol, ...args: any[]): boolean {
       
        console.log(`${String(eventName)} event emitted`)
        super.emit(eventName, args)
        return true
    }
 
}
const globalEventHandler = new GlobalEventHandler()


export default globalEventHandler 