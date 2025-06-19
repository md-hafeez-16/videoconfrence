"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Mic, MicOff, Video, VideoOff, MessageSquare, Phone, AlertCircle } from "lucide-react"

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
  type: "offer" | "answer" | "ice-candidate" | "user-joined" | "user-left"
  data: any
  timestamp: number
}

interface PeerInfo {
  connection: RTCPeerConnection
  hasReceivedOffer: boolean
  hasReceivedAnswer: boolean
  iceCandidatesQueue: RTCIceCandidate[]
}

export default function VideoConferenceImproved() {
  const [roomId, setRoomId] = useState("")
  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`)
  const [isInRoom, setIsInRoom] = useState(false)
  const [users, setUsers] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [chatMessage, setChatMessage] = useState("")
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<Record<string, string>>({})
  const [debugInfo, setDebugInfo] = useState<string[]>([])

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, PeerInfo>>(new Map())
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSignalingTimestamp = useRef<number>(0)
  const isJoiningRef = useRef(false)

  const addDebugInfo = (info: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const message = `[${timestamp}] ${info}`
    console.log(message)
    setDebugInfo((prev) => [...prev.slice(-20), message]) // Keep last 20 messages
  }

  const generateRoomId = () => {
    return Math.random().toString(36).substr(2, 8).toUpperCase()
  }

  useEffect(() => {
    setRoomId(generateRoomId())
  }, [])

  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    addDebugInfo(`Creating peer connection for ${remoteUserId}`)

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
      iceCandidatePoolSize: 10,
    }

    const peerConnection = new RTCPeerConnection(configuration)

    // Add local stream tracks immediately
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        addDebugInfo(`Adding ${track.kind} track to peer ${remoteUserId}`)
        peerConnection.addTrack(track, localStreamRef.current!)
      })
    }

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState
      addDebugInfo(`Peer ${remoteUserId} connection state: ${state}`)
      setConnectionStatus((prev) => ({ ...prev, [remoteUserId]: state }))
    }

    peerConnection.oniceconnectionstatechange = () => {
      addDebugInfo(`Peer ${remoteUserId} ICE state: ${peerConnection.iceConnectionState}`)
    }

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      addDebugInfo(`Received ${event.track.kind} track from ${remoteUserId}`)
      const remoteStream = event.streams[0]
      if (remoteStream) {
        addRemoteVideo(remoteUserId, remoteStream)
      }
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        addDebugInfo(`Sending ICE candidate to ${remoteUserId}`)
        await sendSignalingMessage(remoteUserId, "ice-candidate", event.candidate)
      }
    }

    return peerConnection
  }, [])

  const sendSignalingMessage = async (to: string, type: SignalingMessage["type"], data: any) => {
    try {
      await fetch(`/api/rooms/${roomId}/signaling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: userId,
          to,
          type,
          data,
        }),
      })
    } catch (error) {
      addDebugInfo(`Error sending ${type} to ${to}: ${error}`)
    }
  }

  const handleSignalingMessage = async (message: SignalingMessage) => {
    const { from, type, data } = message
    addDebugInfo(`Received ${type} from ${from}`)

    let peerInfo = peersRef.current.get(from)

    // Create peer connection if it doesn't exist
    if (!peerInfo) {
      const peerConnection = createPeerConnection(from)
      peerInfo = {
        connection: peerConnection,
        hasReceivedOffer: false,
        hasReceivedAnswer: false,
        iceCandidatesQueue: [],
      }
      peersRef.current.set(from, peerInfo)
    }

    const { connection } = peerInfo

    try {
      switch (type) {
        case "user-joined":
          addDebugInfo(`User ${from} joined, creating offer`)
          await createOffer(from)
          break

        case "offer":
          addDebugInfo(`Processing offer from ${from}`)
          await connection.setRemoteDescription(new RTCSessionDescription(data))
          peerInfo.hasReceivedOffer = true

          // Process queued ICE candidates
          for (const candidate of peerInfo.iceCandidatesQueue) {
            await connection.addIceCandidate(candidate)
          }
          peerInfo.iceCandidatesQueue = []

          // Create and send answer
          const answer = await connection.createAnswer()
          await connection.setLocalDescription(answer)
          await sendSignalingMessage(from, "answer", answer)
          break

        case "answer":
          addDebugInfo(`Processing answer from ${from}`)
          await connection.setRemoteDescription(new RTCSessionDescription(data))
          peerInfo.hasReceivedAnswer = true

          // Process queued ICE candidates
          for (const candidate of peerInfo.iceCandidatesQueue) {
            await connection.addIceCandidate(candidate)
          }
          peerInfo.iceCandidatesQueue = []
          break

        case "ice-candidate":
          const candidate = new RTCIceCandidate(data)

          // Queue ICE candidates if remote description is not set
          if (!connection.remoteDescription) {
            peerInfo.iceCandidatesQueue.push(candidate)
            addDebugInfo(`Queued ICE candidate from ${from}`)
          } else {
            await connection.addIceCandidate(candidate)
            addDebugInfo(`Added ICE candidate from ${from}`)
          }
          break

        case "user-left":
          addDebugInfo(`User ${from} left`)
          removePeer(from)
          break
      }
    } catch (error) {
      addDebugInfo(`Error handling ${type} from ${from}: ${error}`)
    }
  }

  const createOffer = async (remoteUserId: string) => {
    const peerInfo = peersRef.current.get(remoteUserId)
    if (!peerInfo) return

    try {
      const offer = await peerInfo.connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await peerInfo.connection.setLocalDescription(offer)
      await sendSignalingMessage(remoteUserId, "offer", offer)
      addDebugInfo(`Sent offer to ${remoteUserId}`)
    } catch (error) {
      addDebugInfo(`Error creating offer for ${remoteUserId}: ${error}`)
    }
  }

  const addRemoteVideo = (userId: string, stream: MediaStream) => {
    addDebugInfo(`Adding remote video for ${userId}`)

    // Remove existing video if any
    const existingContainer = document.getElementById(`container-${userId}`)
    if (existingContainer) {
      existingContainer.remove()
    }

    // Create video element
    const videoElement = document.createElement("video")
    videoElement.id = `video-${userId}`
    videoElement.autoplay = true
    videoElement.playsInline = true
    videoElement.muted = false
    videoElement.srcObject = stream
    videoElement.className = "w-full h-full object-cover rounded-lg"

    // Create container
    const container = document.createElement("div")
    container.id = `container-${userId}`
    container.className = "relative bg-gray-800 rounded-lg aspect-video"

    // Add label
    const label = document.createElement("div")
    label.className = "absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm"
    label.textContent = userId

    // Add connection status indicator
    const statusIndicator = document.createElement("div")
    statusIndicator.id = `status-${userId}`
    statusIndicator.className = "absolute top-2 right-2 w-3 h-3 rounded-full bg-yellow-500"

    container.appendChild(videoElement)
    container.appendChild(label)
    container.appendChild(statusIndicator)

    const remoteVideosContainer = document.getElementById("remote-videos")
    if (remoteVideosContainer) {
      remoteVideosContainer.appendChild(container)
    }

    // Force play
    setTimeout(() => {
      videoElement.play().catch(console.error)
    }, 100)
  }

  const removePeer = (userId: string) => {
    const peerInfo = peersRef.current.get(userId)
    if (peerInfo) {
      peerInfo.connection.close()
      peersRef.current.delete(userId)
    }

    const container = document.getElementById(`container-${userId}`)
    if (container) {
      container.remove()
    }

    setConnectionStatus((prev) => {
      const newStatus = { ...prev }
      delete newStatus[userId]
      return newStatus
    })
  }

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return

    addDebugInfo("Starting polling")
    pollingIntervalRef.current = setInterval(async () => {
      if (!isInRoom) return

      try {
        // Poll for signaling messages
        const signalingResponse = await fetch(
          `/api/rooms/${roomId}/signaling?userId=${userId}&since=${lastSignalingTimestamp.current}`,
        )
        const signalingData = await signalingResponse.json()

        if (signalingData.messages && signalingData.messages.length > 0) {
          for (const message of signalingData.messages) {
            await handleSignalingMessage(message)
          }
          lastSignalingTimestamp.current = Math.max(...signalingData.messages.map((m: SignalingMessage) => m.timestamp))
        }

        // Poll for users
        const usersResponse = await fetch(`/api/rooms/${roomId}/users`)
        const usersData = await usersResponse.json()

        if (usersData.users) {
          const currentUsers = usersData.users.filter((u: string) => u !== userId)
          setUsers(currentUsers)

          // Notify new users that we joined
          const existingPeers = new Set(peersRef.current.keys())
          for (const user of currentUsers) {
            if (!existingPeers.has(user)) {
              await sendSignalingMessage(user, "user-joined", { userId })
            }
          }
        }

        // Poll for messages
        const messagesResponse = await fetch(`/api/rooms/${roomId}/messages`)
        const messagesData = await messagesResponse.json()
        if (messagesData.messages) {
          setMessages(messagesData.messages)
        }
      } catch (error) {
        addDebugInfo(`Polling error: ${error}`)
      }
    }, 2000) // Poll every 2 seconds
  }, [isInRoom, roomId, userId])

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
      addDebugInfo("Stopped polling")
    }
  }, [])

  const joinRoom = async () => {
    if (!roomId.trim()) {
      alert("Please enter a room ID")
      return
    }

    if (isJoiningRef.current) {
      addDebugInfo("Already joining room, please wait...")
      return
    }

    isJoiningRef.current = true
    addDebugInfo(`Joining room ${roomId}`)

    try {
      // Get user media first
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      })

      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      addDebugInfo(`Got local stream with ${stream.getTracks().length} tracks`)

      // Join room via API
      const response = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      const data = await response.json()
      if (data.success) {
        setIsInRoom(true)
        addDebugInfo("Successfully joined room")
        startPolling()
      } else {
        throw new Error("Failed to join room")
      }
    } catch (error) {
      addDebugInfo(`Error joining room: ${error}`)
      alert("Failed to join room. Please check your camera/microphone permissions.")
    } finally {
      isJoiningRef.current = false
    }
  }

  const leaveRoom = async () => {
    addDebugInfo("Leaving room")

    try {
      // Notify other users
      for (const userId of users) {
        await sendSignalingMessage(userId, "user-left", {})
      }

      // Leave room via API
      await fetch(`/api/rooms/${roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      // Clean up
      stopPolling()

      peersRef.current.forEach((peerInfo) => {
        peerInfo.connection.close()
      })
      peersRef.current.clear()

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
      setConnectionStatus({})
    } catch (error) {
      addDebugInfo(`Error leaving room: ${error}`)
    }
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
        addDebugInfo(`Audio ${audioTrack.enabled ? "enabled" : "disabled"}`)
      }
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOff(!videoTrack.enabled)
        addDebugInfo(`Video ${videoTrack.enabled ? "enabled" : "disabled"}`)
      }
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
      addDebugInfo(`Error sending message: ${error}`)
    }
  }

  // Update connection status indicators
  useEffect(() => {
    Object.entries(connectionStatus).forEach(([userId, status]) => {
      const indicator = document.getElementById(`status-${userId}`)
      if (indicator) {
        indicator.className = `absolute top-2 right-2 w-3 h-3 rounded-full ${
          status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-yellow-500" : "bg-red-500"
        }`
      }
    })
  }, [connectionStatus])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Video Conference (Improved)</h1>

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
              <Button onClick={joinRoom} disabled={isJoiningRef.current}>
                {isJoiningRef.current ? "Joining..." : "Join Room"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300">Room: {roomId}</span>
              <span className="text-sm text-gray-300">Users: {users.length + 1}</span>
              <span className="text-sm text-gray-300">
                Connected: {Object.values(connectionStatus).filter((s) => s === "connected").length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-300px)]">
          {/* Local Video */}
          <div className="relative bg-gray-800 rounded-lg aspect-video">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover rounded-lg" />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              You {isScreenSharing && "(Screen)"}
            </div>
            <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-green-500"></div>
          </div>

          {/* Remote Videos */}
          <div id="remote-videos" className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {users.length === 0 && isInRoom && (
              <div className="flex items-center justify-center bg-gray-800 rounded-lg aspect-video">
                <div className="text-center">
                  <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                  <p className="text-gray-400">Waiting for others to join...</p>
                  <p className="text-sm text-gray-500 mt-2">Share room ID: {roomId}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Debug Info */}
      {isInRoom && (
        <div className="bg-gray-800 p-2 border-t border-gray-700 max-h-32 overflow-y-auto">
          <div className="text-xs text-gray-400 space-y-1">
            {debugInfo.slice(-5).map((info, index) => (
              <div key={index}>{info}</div>
            ))}
          </div>
        </div>
      )}

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
