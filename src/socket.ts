import {  Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import querystring from "querystring";

class WebSocketHandler {
    private wsServer:WebSocketServer
    private user:Map<string, WebSocketServer>
    private teamChannel:Map<string, Set<WebSocketServer>>

    constructor (server:Server){
        this.wsServer = new WebSocketServer({server})
        this.user = new Map()
        this.teamChannel = new Map()
        this.init()

        console.log('Websocket server initialized...')
    }

    private init (){



        this.wsServer.on('connection', (socket,req)=>{
           
            
            socket.on("message",data =>{
                console.log(data.toString())
                let parsedData = JSON.parse(data.toString())
                
                
              
            })

        })

    

    }
}

export default WebSocketHandler