import { type NextRequest, NextResponse } from "next/server"
import { roomStore } from "@/lib/room-store"

export async function POST(request: NextRequest, { params }: { params: { roomId: string } }) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const success = roomStore.leaveRoom(params.roomId, userId)

    return NextResponse.json({ success })
  } catch (error) {
    return NextResponse.json({ error: "Failed to leave room" }, { status: 500 })
  }
}
