"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DebugPanelProps {
  isInRoom: boolean
  users: string[]
  localStream: MediaStream | null
  peers: Map<string, RTCPeerConnection>
}

export default function DebugPanel({ isInRoom, users, localStream, peers }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [connectionStates, setConnectionStates] = useState<Record<string, string>>({})

  const checkConnectionStates = () => {
    const states: Record<string, string> = {}
    peers.forEach((peer, userId) => {
      states[userId] = `Connection: ${peer.connectionState}, ICE: ${peer.iceConnectionState}`
    })
    setConnectionStates(states)
  }

  const testLocalVideo = () => {
    const localVideo = document.querySelector("#localVideo") as HTMLVideoElement
    if (localVideo && localStream) {
      console.log("Local video element:", localVideo)
      console.log("Local stream:", localStream)
      console.log("Local stream tracks:", localStream.getTracks())
      localVideo.srcObject = localStream
      localVideo.play()
    }
  }

  if (!isInRoom) return null

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Button onClick={() => setIsOpen(!isOpen)} variant="outline" size="sm" className="mb-2">
        {isOpen ? "Hide Debug" : "Show Debug"}
      </Button>

      {isOpen && (
        <Card className="w-80 bg-gray-800 border-gray-700 text-white">
          <CardHeader>
            <CardTitle className="text-sm">Debug Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div>
              <strong>Users in room:</strong> {users.length + 1}
            </div>
            <div>
              <strong>Connected users:</strong> {users.join(", ") || "None"}
            </div>
            <div>
              <strong>Local stream:</strong> {localStream ? "✅" : "❌"}
            </div>
            {localStream && (
              <div>
                <strong>Local tracks:</strong> {localStream.getTracks().length}
                <ul className="ml-4">
                  {localStream.getTracks().map((track, i) => (
                    <li key={i}>
                      {track.kind}: {track.enabled ? "enabled" : "disabled"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <strong>Peer connections:</strong> {peers.size}
            </div>
            {Array.from(peers.entries()).map(([userId, peer]) => (
              <div key={userId} className="ml-4">
                <strong>{userId}:</strong>
                <div>Connection: {peer.connectionState}</div>
                <div>ICE: {peer.iceConnectionState}</div>
              </div>
            ))}

            <div className="pt-2 space-y-1">
              <Button onClick={checkConnectionStates} size="sm" className="w-full">
                Check Connections
              </Button>
              <Button onClick={testLocalVideo} size="sm" className="w-full">
                Test Local Video
              </Button>
              <Button
                onClick={() => {
                  console.log("=== DEBUG INFO ===")
                  console.log("Users:", users)
                  console.log("Local stream:", localStream)
                  console.log("Peers:", peers)
                  console.log("==================")
                }}
                size="sm"
                className="w-full"
              >
                Log to Console
              </Button>
            </div>

            {Object.keys(connectionStates).length > 0 && (
              <div className="pt-2">
                <strong>Connection States:</strong>
                {Object.entries(connectionStates).map(([userId, state]) => (
                  <div key={userId} className="ml-4 text-xs">
                    {userId}: {state}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
