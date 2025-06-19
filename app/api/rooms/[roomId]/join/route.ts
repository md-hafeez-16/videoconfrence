import { type NextRequest, NextResponse } from "next/server"
import { roomStore } from "@/lib/room-store"

export async function POST(request: NextRequest, { params }: { params: { roomId: string } }) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const success = roomStore.joinRoom(params.roomId, userId)
    const users = roomStore.getRoomUsers(params.roomId)

    return NextResponse.json({ success, users })
  } catch (error) {
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 })
  }
}
