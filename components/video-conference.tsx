"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Mic, MicOff, Video, VideoOff, Monitor, MessageSquare, Phone } from "lucide-react"

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

export default function VideoConference() {
  const [roomId, setRoomId] = useState("")
  const [userId] = useState(() => Math.random().toString(36).substr(2, 9))
  const [isInRoom, setIsInRoom] = useState(false)
  const [users, setUsers] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [chatMessage, setChatMessage] = useState("")
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastMessageTimestamp = useRef<number>(0)
  const lastSignalingTimestamp = useRef<number>(0)

  const generateRoomId = () => {
    return Math.random().toString(36).substr(2, 8).toUpperCase()
  }

  useEffect(() => {
    setRoomId(generateRoomId())
  }, [])

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return

    pollingIntervalRef.current = setInterval(async () => {
      if (!isInRoom) return

      try {
        // Poll for new users
        const usersResponse = await fetch(`/api/rooms/${roomId}/users`)
        const usersData = await usersResponse.json()

        if (usersData.users) {
          const newUsers = usersData.users.filter((u: string) => u !== userId)
          setUsers((prev) => {
            const prevSet = new Set(prev)
            const newSet = new Set(newUsers)

            // Handle new users
            newUsers.forEach((user: string) => {
              if (!prevSet.has(user)) {
                createPeerConnection(user, true)
              }
            })

            // Handle disconnected users
            prev.forEach((user) => {
              if (!newSet.has(user)) {
                removePeer(user)
              }
            })

            return newUsers
          })
        }

        // Poll for new messages
        const messagesResponse = await fetch(`/api/rooms/${roomId}/messages?since=${lastMessageTimestamp.current}`)
        const messagesData = await messagesResponse.json()

        if (messagesData.messages && messagesData.messages.length > 0) {
          setMessages((prev) => [...prev, ...messagesData.messages])
          lastMessageTimestamp.current = Math.max(...messagesData.messages.map((m: Message) => m.timestamp))
        }

        // Poll for signaling messages
        const signalingResponse = await fetch(
          `/api/rooms/${roomId}/signaling?userId=${userId}&since=${lastSignalingTimestamp.current}`,
        )
        const signalingData = await signalingResponse.json()

        if (signalingData.messages && signalingData.messages.length > 0) {
          for (const msg of signalingData.messages) {
            await handleSignalingMessage(msg)
          }
          lastSignalingTimestamp.current = Math.max(...signalingData.messages.map((m: SignalingMessage) => m.timestamp))
        }
      } catch (error) {
        console.error("Polling error:", error)
      }
    }, 1000) // Poll every second
  }, [isInRoom, roomId, userId])

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [])

  const handleSignalingMessage = async (message: SignalingMessage) => {
    const peer = peersRef.current.get(message.from)
    if (!peer) return

    try {
      switch (message.type) {
        case "offer":
          await peer.setRemoteDescription(message.data)
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)

          await fetch(`/api/rooms/${roomId}/signaling`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from: userId,
              to: message.from,
              type: "answer",
              data: answer,
            }),
          })
          break

        case "answer":
          await peer.setRemoteDescription(message.data)
          break

        case "ice-candidate":
          await peer.addIceCandidate(message.data)
          break
      }
    } catch (error) {
      console.error("Error handling signaling message:", error)
    }
  }

  const createPeerConnection = (remoteUserId: string, isInitiator: boolean) => {
    const configuration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    }

    const peer = new RTCPeerConnection(configuration)
    peersRef.current.set(remoteUserId, peer)

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current!)
      })
    }

    // Handle remote stream
    peer.ontrack = (event) => {
      const remoteStream = event.streams[0]
      addRemoteVideo(remoteUserId, remoteStream)
    }

    // Handle ICE candidates
    peer.onicecandidate = async (event) => {
      if (event.candidate) {
        await fetch(`/api/rooms/${roomId}/signaling`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: userId,
            to: remoteUserId,
            type: "ice-candidate",
            data: event.candidate,
          }),
        })
      }
    }

    // Create offer if initiator
    if (isInitiator) {
      peer
        .createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(async () => {
          await fetch(`/api/rooms/${roomId}/signaling`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from: userId,
              to: remoteUserId,
              type: "offer",
              data: peer.localDescription,
            }),
          })
        })
        .catch(console.error)
    }

    return peer
  }

  const addRemoteVideo = (userId: string, stream: MediaStream) => {
    const videoElement = document.createElement("video")
    videoElement.autoplay = true
    videoElement.playsInline = true
    videoElement.srcObject = stream
    videoElement.className = "w-full h-full object-cover rounded-lg"

    const container = document.createElement("div")
    container.className = "relative bg-gray-800 rounded-lg aspect-video"
    container.innerHTML = `
      <div class="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
        ${userId}
      </div>
    `
    container.appendChild(videoElement)

    const remoteVideosContainer = document.getElementById("remote-videos")
    if (remoteVideosContainer) {
      remoteVideosContainer.appendChild(container)
    }

    remoteVideosRef.current.set(userId, videoElement)
  }

  const removePeer = (userId: string) => {
    const peer = peersRef.current.get(userId)
    if (peer) {
      peer.close()
      peersRef.current.delete(userId)
    }

    const videoElement = remoteVideosRef.current.get(userId)
    if (videoElement && videoElement.parentElement) {
      videoElement.parentElement.remove()
      remoteVideosRef.current.delete(userId)
    }
  }

  const joinRoom = async () => {
    if (!roomId.trim()) {
      alert("Please enter a room ID")
      return
    }

    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      // Join room
      const response = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      const data = await response.json()
      if (data.success) {
        setIsInRoom(true)
        setUsers(data.users.filter((u: string) => u !== userId))
        startPolling()
      }
    } catch (error) {
      console.error("Error joining room:", error)
      alert("Failed to join room. Please check your camera/microphone permissions.")
    }
  }

  const leaveRoom = async () => {
    try {
      await fetch(`/api/rooms/${roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      // Clean up
      stopPolling()
      peersRef.current.forEach((peer) => peer.close())
      peersRef.current.clear()
      remoteVideosRef.current.clear()

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = null
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null
      }

      document.getElementById("remote-videos")!.innerHTML = ""

      setIsInRoom(false)
      setUsers([])
      setMessages([])
    } catch (error) {
      console.error("Error leaving room:", error)
    }
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
      }
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOff(!videoTrack.enabled)
      }
    }
  }

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })

      const videoTrack = screenStream.getVideoTracks()[0]

      // Replace video track in all peer connections
      peersRef.current.forEach(async (peer) => {
        const sender = peer.getSenders().find((s) => s.track && s.track.kind === "video")
        if (sender) {
          await sender.replaceTrack(videoTrack)
        }
      })

      // Update local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream
      }

      setIsScreenSharing(true)

      // Handle screen share end
      videoTrack.onended = () => {
        stopScreenShare()
      }
    } catch (error) {
      console.error("Error starting screen share:", error)
    }
  }

  const stopScreenShare = async () => {
    try {
      // Get camera stream back
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      const videoTrack = cameraStream.getVideoTracks()[0]

      // Replace video track in all peer connections
      peersRef.current.forEach(async (peer) => {
        const sender = peer.getSenders().find((s) => s.track && s.track.kind === "video")
        if (sender) {
          await sender.replaceTrack(videoTrack)
        }
      })

      // Update local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = cameraStream
      }

      localStreamRef.current = cameraStream
      setIsScreenSharing(false)
    } catch (error) {
      console.error("Error stopping screen share:", error)
    }
  }

  const sendMessage = async () => {
    if (!chatMessage.trim()) return

    try {
      await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          message: chatMessage,
        }),
      })

      setChatMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Video Conference</h1>

          {!isInRoom ? (
            <div className="flex items-center gap-4">
              <Input
                type="text"
                placeholder="Enter room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="bg-gray-700 border-gray-600"
                onKeyPress={(e) => e.key === "Enter" && joinRoom()}
              />
              <Button onClick={joinRoom}>Join Room</Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300">Room: {roomId}</span>
              <span className="text-sm text-gray-300">Users: {users.length + 1}</span>
            </div>
          )}
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-200px)]">
          {/* Local Video */}
          <div className="relative bg-gray-800 rounded-lg aspect-video">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover rounded-lg" />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              You {isScreenSharing && "(Screen)"}
            </div>
          </div>

          {/* Remote Videos */}
          <div id="remote-videos" className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {users.length === 0 && isInRoom && (
              <div className="flex items-center justify-center bg-gray-800 rounded-lg aspect-video">
                <p className="text-gray-400">Waiting for others to join...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {isInRoom && (
        <div className="bg-gray-800 p-4 border-t border-gray-700">
          <div className="flex justify-center items-center gap-4">
            <Button variant={isMuted ? "destructive" : "secondary"} size="lg" onClick={toggleMute}>
              {isMuted ? <MicOff /> : <Mic />}
            </Button>

            <Button variant={isVideoOff ? "destructive" : "secondary"} size="lg" onClick={toggleVideo}>
              {isVideoOff ? <VideoOff /> : <Video />}
            </Button>

            <Button
              variant={isScreenSharing ? "destructive" : "secondary"}
              size="lg"
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            >
              <Monitor />
            </Button>

            <Button variant="secondary" size="lg" onClick={() => setIsChatOpen(!isChatOpen)}>
              <MessageSquare />
            </Button>

            <Button variant="destructive" size="lg" onClick={leaveRoom}>
              <Phone />
            </Button>
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {isChatOpen && isInRoom && (
        <Card className="fixed right-4 top-20 w-80 h-96 bg-gray-800 border-gray-700">
          <CardContent className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Chat</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsChatOpen(false)}>
                ×
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className="bg-gray-700 p-2 rounded text-sm">
                  <div className="font-semibold text-blue-400">{msg.userId}:</div>
                  <div>{msg.message}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Type a message..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                className="bg-gray-700 border-gray-600"
              />
              <Button onClick={sendMessage}>Send</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
