import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import config from "../config";
import { jwtHelpers } from "./jwt";
import prisma from "../shared/prisma";
import { chatService } from "../app/modules/Chat/chat.service";

interface ExtendedWebSocket extends WebSocket {
  userId?: string;
}

type Message  = {event:string, token?:string, teamId?:string, message?:string} 
export const onlineUsers = new Set<string>();
export const userSockets = new Map<string, ExtendedWebSocket>();
export const teamsChannel = new Map<string, Set<ExtendedWebSocket>>()

export function setupWebSocket(server: Server) {
  
  const wss = new WebSocketServer({ server });
  console.log("WebSocket server is running");

  wss.on("connection", (ws: ExtendedWebSocket) => {
    console.log("A user connected");

    ws.on("message", async (data: string) => {
      try {
        const parsedData:Message = JSON.parse(data);

        if (!ws.userId && parsedData.event !== "authenticate"){
          ws.send(JSON.stringify({event:"error",message:"User not authenticated"}))
          return
        }

        switch (parsedData.event) {
          case "authenticate": {
            const token = parsedData.token;

            if (!token) {
              console.log("No token provided");
              ws.close();
              return;
            }

            const user = jwtHelpers.verifyToken(
              token,
              config.jwt.jwt_secret as string
            );

            if (!user) {
              console.log("Invalid token");
              
              ws.close();
              return;
            }
            ws.send(JSON.stringify({event:"authentication_status", data:{message:"User authenticated"}}))
            const { id } = user;

            ws.userId = id;
            onlineUsers.add(id);
            userSockets.set(id, ws);

            broadcastToAll(wss, {
              event: "user_status",
              data: { userId: id, isOnline: true },
            });
            break;
          }

          case "subscribe" : {
             if(!ws.userId){
              ws.send("User is not authenticated")
              ws.terminate()
            }
            const {teamId} = parsedData

            if(!teamId){
              ws.send("teamId is not present")
              break
            } 

            if(!teamsChannel.has(teamId)){
              let set = new Set<ExtendedWebSocket> ()
              set.add(ws)
              teamsChannel.set(teamId, set)
            }else {
              let memberSet = teamsChannel.get(teamId) as Set<ExtendedWebSocket>
              memberSet.add(ws)
            }

            const allChats = await chatService.getAllChats(ws.userId as string,teamId)
            
           ws.send(JSON.stringify({event:'subscribed', data:allChats}))

          }

          case "unsubscribe":{
            const {teamId} = parsedData
            if(!teamId){
              ws.send(JSON.stringify({message:"teamId is required"}))
            }
            
            if (teamsChannel.has(teamId as string)){
              let memberSet = teamsChannel.get(teamId as string) as Set<ExtendedWebSocket>
              memberSet.delete(ws)
            }

            ws.send(JSON.stringify({event:'unsubscribed', data:teamId}))

          }

          case "message": {
            const { teamId , message } = parsedData;
  
            if ( !teamId || !message) {
              console.log("Invalid message payload");
              ws.send("Payload is invalid for message event")
              return;
            }
            
            if(!ws.userId){
              ws.send("User is not authenticated")
              ws.terminate()
            }

            let chat = await prisma.chat.create({
              data:{message,senderId:ws.userId as string,teamId}
            });

            let memberSockets :Set<ExtendedWebSocket> | undefined
            if(!teamsChannel.has(teamId)){
              memberSockets = new Set<ExtendedWebSocket>()
              memberSockets.add(ws)
              teamsChannel.set(teamId, memberSockets)
            }else {
              memberSockets = teamsChannel.get(teamId)
            }
              memberSockets?.forEach(socket => {
                if(socket !== ws){
                  socket.send(JSON.stringify({event:"message", data:chat}))
                }
              })
           
            break;
          }
  
          case "all_chats": {
            const { teamId } = parsedData;
            if (!ws.userId) {
              console.log("User not authenticated");
              ws.send(JSON.stringify({event:"unauthenticated", message:"User not authenticated"}))
              return;
            }
            if (!teamId){
              ws.send(JSON.stringify({event:"error", message:"teamId is required"}))
            }

            const chats = await chatService.getAllChats(ws.userId as string,teamId as string)

            ws.send(
              JSON.stringify({
                event: "all_chats",
                data: chats,
              })
            );
            break;
          }

          default:
            console.log("Unknown event type:", parsedData.event);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      if (ws.userId) {
        onlineUsers.delete(ws.userId);
        userSockets.delete(ws.userId);
        
        teamsChannel.forEach( channel => {
          if(channel.has(ws)){
            channel.delete(ws)
          }
        })

        broadcastToAll(wss, {
          event: "user_status",
          data: { userId: ws.userId, isOnline: false },
        });
      }
      console.log("User disconnected");
    });
  });

  return wss;
}



function broadcastToAll(wss: WebSocketServer, message: object) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}
