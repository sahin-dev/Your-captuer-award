import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import config from "../config";
import { jwtHelpers } from "./jwt";
import prisma from "../shared/prisma";
import { chatService } from "../app/modules/Chat/chat.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  teamIds?: Set<string>;
}

type Message = { event: string; token?: string; teamId?: string; message?: string };
export const onlineUsers = new Set<string>();
export const userSockets = new Map<string, AuthenticatedSocket>();

// Global io instance for use in other services
let ioInstance: SocketIOServer | null = null;

export function setupWebSocket(server: HTTPServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Store io instance globally
  ioInstance = io;

  console.log("Socket.IO server is running");

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log("A user connected:", socket.id);
    socket.teamIds = new Set();

    socket.on("authenticate", async (token: string, callback) => {
      try {
        if (!token) {
          console.log("No token provided");
          callback({ success: false, message: "No token provided" });
          return;
        }

        const user = jwtHelpers.verifyToken(token, config.jwt.jwt_secret as string);

        if (!user) {
          console.log("Invalid token");
          callback({ success: false, message: "Invalid token" });
          return;
        }

        const { id } = user;
        socket.userId = id;
        onlineUsers.add(id);
        userSockets.set(id, socket);

        await prisma.user.update({ where: { id }, data: { isActive: true } });
        console.log(`User ${id} authenticated`);

        callback({ success: true, userId: id, message: "User authenticated" });

        // Broadcast user online status
        io.emit("user_status", { userId: id, isOnline: true });
      } catch (error) {
        console.error("Authentication error:", error);
        callback({ success: false, message: "Authentication failed" });
      }
    });

    socket.on("join_team", async (teamId: string, callback) => {
      try {
        if (!socket.userId) {
          callback({ success: false, message: "User not authenticated" });
          return;
        }

        if (!teamId) {
          callback({ success: false, message: "teamId is required" });
          return;
        }

        // Verify user is member of this team
        const teamMember = await prisma.teamMember.findFirst({
          where: { teamId, memberId: socket.userId },
        });

        if (!teamMember) {
          callback({ success: false, message: "User is not a member of this team" });
          return;
        }

        // Join the team room
        socket.join(`team_${teamId}`);
        socket.teamIds?.add(teamId);

        // Get all chats for this team
        const allChats = await chatService.getAllChats(socket.userId, teamId);

        callback({ success: true, data: allChats });

        // Notify team members that user joined
        io.to(`team_${teamId}`).emit("member_joined", {
          userId: socket.userId,
          teamId,
          timestamp: new Date(),
        });

        console.log(`User ${socket.userId} joined team ${teamId}`);
      } catch (error) {
        console.error("Join team error:", error);
        callback({ success: false, message: "Failed to join team" });
      }
    });

    socket.on("leave_team", (teamId: string, callback) => {
      try {
        if (!socket.userId) {
          callback({ success: false, message: "User not authenticated" });
          return;
        }

        socket.leave(`team_${teamId}`);
        socket.teamIds?.delete(teamId);

        // Notify team members that user left
        io.to(`team_${teamId}`).emit("member_left", {
          userId: socket.userId,
          teamId,
          timestamp: new Date(),
        });

        callback({ success: true, message: "Left team room" });
        console.log(`User ${socket.userId} left team ${teamId}`);
      } catch (error) {
        console.error("Leave team error:", error);
        callback({ success: false, message: "Failed to leave team" });
      }
    });

    socket.on("send_message", async (payload: { teamId: string; message: string; messageType?: string; fileUrl?: string }, callback) => {
      try {
        if (!socket.userId) {
          callback({ success: false, message: "User not authenticated" });
          return;
        }

        const { teamId, message, messageType, fileUrl } = payload;

        if (!teamId || !message) {
          callback({ success: false, message: "teamId and message are required" });
          return;
        }

        // Verify user is member of this team
        const teamMember = await prisma.teamMember.findFirst({
          where: { teamId, memberId: socket.userId },
        });

        if (!teamMember) {
          callback({ success: false, message: "User is not a member of this team" });
          return;
        }

        // Create chat record
        const chat = await prisma.chat.create({
          data: {
            message,
            senderId: socket.userId,
            teamId,
            messageType: messageType || "text",
            fileUrl: fileUrl || null,
          },
          include: {
            sender: {
              select: { id: true, firstName: true, lastName: true, avatar: true },
            },
          },
        });

        // Broadcast message to all team members in the room
        io.to(`team_${teamId}`).emit("new_message", {
          event: "message",
          data: chat,
        });

        callback({ success: true, data: chat });
        console.log(`Message from ${socket.userId} to team ${teamId}`);
      } catch (error) {
        console.error("Send message error:", error);
        callback({ success: false, message: "Failed to send message" });
      }
    });

    socket.on("get_team_messages", async (data: { page: number; limit: number; teamId: string }, callback) => {
      try {
        if (!socket.userId) {
          callback({ success: false, message: "User not authenticated" });
          return;
        }



        const chats = await chatService.getAllChats(socket.userId, data.teamId, data.page, data.limit);
        callback({ success: true, data: chats });
      } catch (error) {
        console.error("Get team messages error:", error);
        callback({ success: false, message: "Failed to retrieve messages" });
      }
    });

    socket.on("disconnect", async () => {
      try {
        if (socket.userId) {
          // Notify teams that user disconnected
          socket.teamIds?.forEach((teamId) => {
            io.to(`team_${teamId}`).emit("member_left", {
              userId: socket.userId,
              teamId,
              timestamp: new Date(),
            });
          });

          onlineUsers.delete(socket.userId);
          userSockets.delete(socket.userId);

          await prisma.user.update({
            where: { id: socket.userId },
            data: { isActive: false },
          });

          io.emit("user_status", { userId: socket.userId, isOnline: false });
          console.log(`User ${socket.userId} disconnected`);
        }
      } catch (error) {
        console.error("Disconnect error:", error);
      }
    });
  });

  return io;
}

/**
 * Get the global Socket.IO instance
 * Used by other services to emit notifications and messages
 */
export function getIO(): SocketIOServer | null {
  return ioInstance;
}

// Export io for direct import in other modules
export const io = ioInstance;
