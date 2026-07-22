import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { setupWebSocket } from "./helpers/websocketSetUp";

class WebSocketHandler {
  private io: SocketIOServer;

  constructor(server: HTTPServer) {
    this.io = setupWebSocket(server);
    this.init();
    console.log("Socket.IO server initialized...");
  }

  private init() {
    // Initialization is handled in setupWebSocket
    // This method can be used for additional setup if needed
  }

  getIO() {
    return this.io;
  }
}

export default WebSocketHandler;