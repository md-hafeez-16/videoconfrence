import { type NextRequest, NextResponse } from "next/server"
import { roomStore } from "@/lib/room-store"

export async function GET(request: NextRequest, { params }: { params: { roomId: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get("since")

    const messages = roomStore.getMessages(params.roomId, since ? Number.parseInt(since) : undefined)

    return NextResponse.json({ messages })
  } catch (error) {
    return NextResponse.json({ error: "Failed to get messages" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { roomId: string } }) {
  try {
    const { userId, message } = await request.json()

    if (!userId || !message) {
      return NextResponse.json({ error: "User ID and message are required" }, { status: 400 })
    }

    const msg = roomStore.addMessage(params.roomId, userId, message)

    return NextResponse.json({ message: msg })
  } catch (error) {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
