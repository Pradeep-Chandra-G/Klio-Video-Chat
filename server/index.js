const { Server } = require("socket.io");
const express = require("express");
const path = require("path");
const http = require("http");

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with the HTTP server
const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? false
        : [window.location.origin],
    methods: ["GET", "POST"],
  },
});

const rooms = new Map(); // roomId -> { participants: Map(socketId -> {email, joinedAt}) }

// Serve static files from React build in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/build")));

  // Handle React routing, return all requests to React app
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/build/index.html"));
  });
}

io.on("connection", (socket) => {
  console.log(`Socket Connected: ${socket.id}`);

  socket.on("room:join", (data) => {
    const { email, room } = data;
    console.log(`${email} trying to join room ${room}`);

    // Initialize room if it doesn't exist
    if (!rooms.has(room)) {
      rooms.set(room, { participants: new Map() });
    }

    const roomData = rooms.get(room);

    // Check if room is full (max 10 participants)
    if (roomData.participants.size >= 10) {
      socket.emit("room:full");
      return;
    }

    // Add participant to room
    roomData.participants.set(socket.id, { email, joinedAt: Date.now() });

    // Join the socket room
    socket.join(room);

    // Get list of existing participants (excluding the new joiner)
    const existingParticipants = Array.from(roomData.participants.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ id, email: data.email }));

    console.log(`${email} joined room ${room}. Existing participants:`, existingParticipants.length);

    // First, send room join confirmation to the new user with existing participants
    socket.emit("room:join", {
      room,
      participants: existingParticipants,
      participantCount: roomData.participants.size,
    });

    // Then notify existing users about the new participant
    socket.to(room).emit("user:joined", { email, id: socket.id });

    console.log(
      `Room ${room} now has ${roomData.participants.size} participants`
    );
  });

  socket.on("user:call", ({ to, offer }) => {
    console.log(`Call from ${socket.id} to ${to}`);
    io.to(to).emit("incoming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    console.log(`Call accepted by ${socket.id} for ${to}`);
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    console.log(`Negotiation needed from ${socket.id} to ${to}`);
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    console.log(`Negotiation done from ${socket.id} to ${to}`);
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("toggle:audio", ({ room, isAudioOn }) => {
    console.log(`${socket.id} toggled audio to ${isAudioOn} in room ${room}`);
    socket.to(room).emit("participant:audio:toggle", {
      participantId: socket.id,
      isAudioOn,
    });
  });

  socket.on("toggle:video", ({ room, isVideoOn }) => {
    console.log(`${socket.id} toggled video to ${isVideoOn} in room ${room}`);
    socket.to(room).emit("participant:video:toggle", {
      participantId: socket.id,
      isVideoOn,
    });
  });

  socket.on("disconnect", () => {
    console.log(`Socket Disconnected: ${socket.id}`);

    // Remove participant from all rooms
    rooms.forEach((roomData, roomId) => {
      if (roomData.participants.has(socket.id)) {
        const participant = roomData.participants.get(socket.id);
        roomData.participants.delete(socket.id);

        // Notify other participants about user leaving
        socket.to(roomId).emit("user:left", {
          id: socket.id,
          email: participant.email,
        });

        console.log(
          `${participant.email} left room ${roomId}. Remaining: ${roomData.participants.size}`
        );

        // Clean up empty rooms
        if (roomData.participants.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} cleaned up (empty)`);
        }
      }
    });
  });

  // Handle explicit leave room
  socket.on("leave:room", ({ room }) => {
    const roomData = rooms.get(room);
    if (roomData && roomData.participants.has(socket.id)) {
      const participant = roomData.participants.get(socket.id);
      roomData.participants.delete(socket.id);
      
      socket.leave(room);
      
      // Notify other participants
      socket.to(room).emit("user:left", {
        id: socket.id,
        email: participant.email,
      });

      console.log(`${participant.email} explicitly left room ${room}`);
      
      // Clean up empty rooms
      if (roomData.participants.size === 0) {
        rooms.delete(room);
        console.log(`Room ${room} cleaned up (empty)`);
      }
    }
  });

  // Debug endpoint to check room status
  socket.on("room:status", ({ room }) => {
    const roomData = rooms.get(room);
    if (roomData) {
      const participants = Array.from(roomData.participants.entries()).map(([id, data]) => ({
        id,
        email: data.email,
        joinedAt: data.joinedAt
      }));
      
      socket.emit("room:status:response", {
        room,
        participantCount: roomData.participants.size,
        participants
      });
    } else {
      socket.emit("room:status:response", {
        room,
        participantCount: 0,
        participants: []
      });
    }
  });
});

// Debug endpoint for room information
app.get("/api/rooms", (req, res) => {
  const roomsInfo = {};
  rooms.forEach((roomData, roomId) => {
    roomsInfo[roomId] = {
      participantCount: roomData.participants.size,
      participants: Array.from(roomData.participants.values()).map(p => p.email)
    };
  });
  res.json(roomsInfo);
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});