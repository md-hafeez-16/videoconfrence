"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Mic, MicOff, Video, VideoOff, Monitor, MessageSquare, Phone } from "lucide-react"
import DebugPanel from "./debug-panel"

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
    console.log(`Handling signaling message from ${message.from}:`, message.type)

    let peer = peersRef.current.get(message.from)

    // Create peer connection if it doesn't exist
    if (!peer) {
      console.log(`Creating new peer connection for ${message.from}`)
      peer = createPeerConnection(message.from, false)
    }

    try {
      switch (message.type) {
        case "offer":
          console.log(`Processing offer from ${message.from}`)
          await peer.setRemoteDescription(new RTCSessionDescription(message.data))

          const answer = await peer.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          })
          await peer.setLocalDescription(answer)

          console.log(`Sending answer to ${message.from}`)
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
          console.log(`Processing answer from ${message.from}`)
          await peer.setRemoteDescription(new RTCSessionDescription(message.data))
          break

        case "ice-candidate":
          console.log(`Processing ICE candidate from ${message.from}`)
          await peer.addIceCandidate(new RTCIceCandidate(message.data))
          break
      }
    } catch (error) {
      console.error(`Error handling signaling message from ${message.from}:`, error)
    }
  }

  const createPeerConnection = (remoteUserId: string, isInitiator: boolean) => {
    console.log(`Creating peer connection for ${remoteUserId}, isInitiator: ${isInitiator}`)

    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
      ],
    }

    const peer = new RTCPeerConnection(configuration)
    peersRef.current.set(remoteUserId, peer)

    // Add connection state logging
    peer.onconnectionstatechange = () => {
      console.log(`Peer connection state for ${remoteUserId}:`, peer.connectionState)
    }

    peer.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${remoteUserId}:`, peer.iceConnectionState)
    }

    // Add local stream tracks with better error handling
    if (localStreamRef.current) {
      console.log(`Adding local stream tracks for ${remoteUserId}`)
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`Adding track: ${track.kind}`)
        peer.addTrack(track, localStreamRef.current!)
      })
    } else {
      console.error("No local stream available when creating peer connection")
    }

    // Handle remote stream with improved logging
    peer.ontrack = (event) => {
      console.log(`Received remote track from ${remoteUserId}:`, event.track.kind)
      const remoteStream = event.streams[0]
      if (remoteStream) {
        console.log(`Remote stream has ${remoteStream.getTracks().length} tracks`)
        addRemoteVideo(remoteUserId, remoteStream)
      } else {
        console.error("No remote stream in track event")
      }
    }

    // Handle ICE candidates with better error handling
    peer.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate for ${remoteUserId}`)
        try {
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
        } catch (error) {
          console.error("Error sending ICE candidate:", error)
        }
      }
    }

    // Create offer if initiator with better error handling
    if (isInitiator) {
      console.log(`Creating offer for ${remoteUserId}`)
      peer
        .createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
        .then((offer) => {
          console.log(`Setting local description for ${remoteUserId}`)
          return peer.setLocalDescription(offer)
        })
        .then(async () => {
          console.log(`Sending offer to ${remoteUserId}`)
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
        .catch((error) => {
          console.error(`Error creating offer for ${remoteUserId}:`, error)
        })
    }

    return peer
  }

  const addRemoteVideo = (userId: string, stream: MediaStream) => {
    console.log(`Adding remote video for ${userId}`)

    // Remove existing video if any
    const existingContainer = document.getElementById(`container-${userId}`)
    if (existingContainer) {
      existingContainer.remove()
    }

    // Create new video element
    const videoElement = document.createElement("video")
    videoElement.id = `video-${userId}`
    videoElement.autoplay = true
    videoElement.playsInline = true
    videoElement.muted = false // Don't mute remote videos
    videoElement.srcObject = stream
    videoElement.className = "w-full h-full object-cover rounded-lg"

    // Add event listeners for debugging
    videoElement.onloadedmetadata = () => {
      console.log(`Video metadata loaded for ${userId}`)
    }

    videoElement.onplay = () => {
      console.log(`Video started playing for ${userId}`)
    }

    videoElement.onerror = (error) => {
      console.error(`Video error for ${userId}:`, error)
    }

    const container = document.createElement("div")
    container.id = `container-${userId}`
    container.className = "relative bg-gray-800 rounded-lg aspect-video"

    const label = document.createElement("div")
    label.className = "absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm"
    label.textContent = userId

    container.appendChild(videoElement)
    container.appendChild(label)

    const remoteVideosContainer = document.getElementById("remote-videos")
    if (remoteVideosContainer) {
      remoteVideosContainer.appendChild(container)
      console.log(`Added video container for ${userId} to DOM`)
    } else {
      console.error("Remote videos container not found")
    }

    remoteVideosRef.current.set(userId, videoElement)

    // Force video to play (some browsers require this)
    setTimeout(() => {
      videoElement.play().catch((error) => {
        console.error(`Error playing video for ${userId}:`, error)
      })
    }, 100)
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
      {/* Debug Panel */}
      <DebugPanel isInRoom={isInRoom} users={users} localStream={localStreamRef.current} peers={peersRef.current} />
    </div>
  )
}
