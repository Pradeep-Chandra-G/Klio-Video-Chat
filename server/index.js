const { Server } = require("socket.io");

const io = new Server(8000, {
  cors: true,
});

const rooms = new Map(); // roomId -> { participants: Map(socketId -> {email, stream}) }

io.on("connection", (socket) => {
  console.log(`Socket Connected`, socket.id);

  socket.on("room:join", (data) => {
    const { email, room } = data;

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

    // Get list of existing participants for the new user
    const existingParticipants = Array.from(roomData.participants.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ id, email: data.email }));

    // Join the socket room
    socket.join(room);

    // Notify existing users about the new participant
    socket.to(room).emit("user:joined", { email, id: socket.id });

    // Send existing participants list to the new user
    socket.emit("room:join", {
      room,
      participants: existingParticipants,
      participantCount: roomData.participants.size,
    });

    console.log(
      `${email} joined room ${room}. Total participants: ${roomData.participants.size}`
    );
  });

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incoming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("toggle:audio", ({ room, isAudioOn }) => {
    socket.to(room).emit("participant:audio:toggle", {
      participantId: socket.id,
      isAudioOn,
    });
  });

  socket.on("toggle:video", ({ room, isVideoOn }) => {
    socket.to(room).emit("participant:video:toggle", {
      participantId: socket.id,
      isVideoOn,
    });
  });

  socket.on("disconnect", () => {
    console.log(`Socket Disconnected`, socket.id);

    // Remove participant from all rooms
    rooms.forEach((roomData, roomId) => {
      if (roomData.participants.has(socket.id)) {
        const participant = roomData.participants.get(socket.id);
        roomData.participants.delete(socket.id);

        // Notify other participants
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
          console.log(`Room ${roomId} cleaned up`);
        }
      }
    });
  });
});
