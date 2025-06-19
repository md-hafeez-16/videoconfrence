interface User {
  id: string
  joinedAt: number
}

interface Message {
  id: string
  userId: string
  message: string
  timestamp: number
}

interface SignalingMessage {
  id: string
  from: string
  to: string
  type: "offer" | "answer" | "ice-candidate"
  data: any
  timestamp: number
}

interface Room {
  id: string
  users: Map<string, User>
  messages: Message[]
  signalingMessages: SignalingMessage[]
  createdAt: number
}

class RoomStore {
  private rooms = new Map<string, Room>()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up old rooms every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      5 * 60 * 1000,
    )
  }

  createRoom(roomId: string): Room {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!
    }

    const room: Room = {
      id: roomId,
      users: new Map(),
      messages: [],
      signalingMessages: [],
      createdAt: Date.now(),
    }

    this.rooms.set(roomId, room)
    return room
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) || null
  }

  joinRoom(roomId: string, userId: string): boolean {
    const room = this.getRoom(roomId) || this.createRoom(roomId)

    room.users.set(userId, {
      id: userId,
      joinedAt: Date.now(),
    })

    return true
  }

  leaveRoom(roomId: string, userId: string): boolean {
    const room = this.getRoom(roomId)
    if (!room) return false

    room.users.delete(userId)

    // Remove room if empty
    if (room.users.size === 0) {
      this.rooms.delete(roomId)
    }

    return true
  }

  getRoomUsers(roomId: string): string[] {
    const room = this.getRoom(roomId)
    return room ? Array.from(room.users.keys()) : []
  }

  addMessage(roomId: string, userId: string, message: string): Message | null {
    const room = this.getRoom(roomId)
    if (!room) return null

    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      userId,
      message,
      timestamp: Date.now(),
    }

    room.messages.push(msg)

    // Keep only last 100 messages
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100)
    }

    return msg
  }

  getMessages(roomId: string, since?: number): Message[] {
    const room = this.getRoom(roomId)
    if (!room) return []

    if (since) {
      return room.messages.filter((msg) => msg.timestamp > since)
    }

    return room.messages
  }

  addSignalingMessage(
    roomId: string,
    from: string,
    to: string,
    type: SignalingMessage["type"],
    data: any,
  ): SignalingMessage | null {
    const room = this.getRoom(roomId)
    if (!room) return null

    const msg: SignalingMessage = {
      id: Math.random().toString(36).substr(2, 9),
      from,
      to,
      type,
      data,
      timestamp: Date.now(),
    }

    room.signalingMessages.push(msg)

    // Keep only last 50 signaling messages
    if (room.signalingMessages.length > 50) {
      room.signalingMessages = room.signalingMessages.slice(-50)
    }

    return msg
  }

  getSignalingMessages(roomId: string, userId: string, since?: number): SignalingMessage[] {
    const room = this.getRoom(roomId)
    if (!room) return []

    let messages = room.signalingMessages.filter((msg) => msg.to === userId)

    if (since) {
      messages = messages.filter((msg) => msg.timestamp > since)
    }

    return messages
  }

  private cleanup() {
    const now = Date.now()
    const maxAge = 2 * 60 * 60 * 1000 // 2 hours

    for (const [roomId, room] of this.rooms.entries()) {
      // Remove old signaling messages
      room.signalingMessages = room.signalingMessages.filter(
        (msg) => now - msg.timestamp < 5 * 60 * 1000, // 5 minutes
      )

      // Remove inactive users (no activity for 30 seconds)
      for (const [userId, user] of room.users.entries()) {
        if (now - user.joinedAt > 30 * 1000) {
          room.users.delete(userId)
        }
      }

      // Remove old empty rooms
      if (room.users.size === 0 && now - room.createdAt > maxAge) {
        this.rooms.delete(roomId)
      }
    }
  }
}

export const roomStore = new RoomStore()
