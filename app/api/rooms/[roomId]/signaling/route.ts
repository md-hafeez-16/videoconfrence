import { type NextRequest, NextResponse } from "next/server"
import { roomStore } from "@/lib/room-store"

export async function GET(request: NextRequest, { params }: { params: { roomId: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const since = searchParams.get("since")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const messages = roomStore.getSignalingMessages(params.roomId, userId, since ? Number.parseInt(since) : undefined)

    return NextResponse.json({ messages })
  } catch (error) {
    return NextResponse.json({ error: "Failed to get signaling messages" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { roomId: string } }) {
  try {
    const { from, to, type, data } = await request.json()

    if (!from || !to || !type || !data) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    const message = roomStore.addSignalingMessage(params.roomId, from, to, type, data)

    return NextResponse.json({ message })
  } catch (error) {
    return NextResponse.json({ error: "Failed to send signaling message" }, { status: 500 })
  }
}
