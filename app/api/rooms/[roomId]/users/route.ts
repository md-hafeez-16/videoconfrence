import { type NextRequest, NextResponse } from "next/server"
import { roomStore } from "@/lib/room-store"

export async function GET(request: NextRequest, { params }: { params: { roomId: string } }) {
  try {
    const users = roomStore.getRoomUsers(params.roomId)
    return NextResponse.json({ users })
  } catch (error) {
    return NextResponse.json({ error: "Failed to get users" }, { status: 500 })
  }
}
