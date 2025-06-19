const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

// Serve static files
app.use(express.static("public"))

// Store room information
const rooms = new Map()

io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  // Join room
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId)

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set())
    }
    rooms.get(roomId).add(userId)

    // Notify others in the room
    socket.to(roomId).emit("user-connected", userId)

    console.log(`User ${userId} joined room ${roomId}`)

    // Send current users in room
    const usersInRoom = Array.from(rooms.get(roomId))
    socket.emit("room-users", usersInRoom)
  })

  // Handle WebRTC signaling
  socket.on("offer", (data) => {
    socket.to(data.roomId).emit("offer", {
      offer: data.offer,
      from: data.from,
    })
  })

  socket.on("answer", (data) => {
    socket.to(data.roomId).emit("answer", {
      answer: data.answer,
      from: data.from,
    })
  })

  socket.on("ice-candidate", (data) => {
    socket.to(data.roomId).emit("ice-candidate", {
      candidate: data.candidate,
      from: data.from,
    })
  })

  // Handle screen sharing
  socket.on("start-screen-share", (data) => {
    socket.to(data.roomId).emit("user-started-screen-share", {
      userId: data.userId,
    })
  })

  socket.on("stop-screen-share", (data) => {
    socket.to(data.roomId).emit("user-stopped-screen-share", {
      userId: data.userId,
    })
  })

  // Handle chat messages
  socket.on("chat-message", (data) => {
    socket.to(data.roomId).emit("chat-message", {
      message: data.message,
      from: data.from,
      timestamp: new Date().toISOString(),
    })
  })

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)

    // Remove user from all rooms
    rooms.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id)
        socket.to(roomId).emit("user-disconnected", socket.id)

        if (users.size === 0) {
          rooms.delete(roomId)
        }
      }
    })
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
