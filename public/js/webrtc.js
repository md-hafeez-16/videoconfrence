// Import the io function from socket.io-client
const io = require("socket.io-client")

class VideoConference {
  constructor() {
    this.localVideo = document.getElementById("localVideo")
    this.remoteVideos = document.getElementById("remoteVideos")
    this.socket = io()
    this.peers = new Map()
    this.localStream = null
    this.roomId = null
    this.userId = this.generateUserId()
    this.isScreenSharing = false

    this.setupSocketListeners()
  }

  generateUserId() {
    return Math.random().toString(36).substr(2, 9)
  }

  async joinRoom(roomId) {
    this.roomId = roomId

    try {
      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      this.localVideo.srcObject = this.localStream

      // Join room via socket
      this.socket.emit("join-room", roomId, this.userId)
    } catch (error) {
      console.error("Error accessing media devices:", error)
      alert("Could not access camera/microphone")
    }
  }

  setupSocketListeners() {
    this.socket.on("user-connected", (userId) => {
      console.log("User connected:", userId)
      this.createPeerConnection(userId, true)
    })

    this.socket.on("user-disconnected", (userId) => {
      console.log("User disconnected:", userId)
      this.removePeer(userId)
    })

    this.socket.on("offer", async (data) => {
      const peer = this.createPeerConnection(data.from, false)
      await peer.setRemoteDescription(data.offer)

      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)

      this.socket.emit("answer", {
        answer: answer,
        roomId: this.roomId,
        from: this.userId,
      })
    })

    this.socket.on("answer", async (data) => {
      const peer = this.peers.get(data.from)
      if (peer) {
        await peer.setRemoteDescription(data.answer)
      }
    })

    this.socket.on("ice-candidate", async (data) => {
      const peer = this.peers.get(data.from)
      if (peer) {
        await peer.addIceCandidate(data.candidate)
      }
    })

    this.socket.on("user-started-screen-share", (data) => {
      this.showScreenShareNotification(data.userId, true)
    })

    this.socket.on("user-stopped-screen-share", (data) => {
      this.showScreenShareNotification(data.userId, false)
    })

    this.socket.on("chat-message", (data) => {
      this.displayChatMessage(data)
    })
  }

  createPeerConnection(userId, isInitiator) {
    const configuration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    }

    const peer = new RTCPeerConnection(configuration)
    this.peers.set(userId, peer)

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        peer.addTrack(track, this.localStream)
      })
    }

    // Handle remote stream
    peer.ontrack = (event) => {
      const remoteStream = event.streams[0]
      this.addRemoteVideo(userId, remoteStream)
    }

    // Handle ICE candidates
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("ice-candidate", {
          candidate: event.candidate,
          roomId: this.roomId,
          from: this.userId,
        })
      }
    }

    // Create offer if initiator
    if (isInitiator) {
      peer
        .createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => {
          this.socket.emit("offer", {
            offer: peer.localDescription,
            roomId: this.roomId,
            from: this.userId,
          })
        })
    }

    return peer
  }

  addRemoteVideo(userId, stream) {
    // Remove existing video if any
    const existingVideo = document.getElementById(`video-${userId}`)
    if (existingVideo) {
      existingVideo.remove()
    }

    // Create new video element
    const videoContainer = document.createElement("div")
    videoContainer.className = "video-container"
    videoContainer.innerHTML = `
      <video id="video-${userId}" autoplay playsinline></video>
      <div class="video-label">${userId}</div>
    `

    const video = videoContainer.querySelector("video")
    video.srcObject = stream

    this.remoteVideos.appendChild(videoContainer)
  }

  removePeer(userId) {
    const peer = this.peers.get(userId)
    if (peer) {
      peer.close()
      this.peers.delete(userId)
    }

    const videoElement = document.getElementById(`video-${userId}`)
    if (videoElement) {
      videoElement.parentElement.remove()
    }
  }

  async startScreenShare() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })

      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0]

      this.peers.forEach(async (peer) => {
        const sender = peer.getSenders().find((s) => s.track && s.track.kind === "video")
        if (sender) {
          await sender.replaceTrack(videoTrack)
        }
      })

      // Update local video
      this.localVideo.srcObject = screenStream
      this.isScreenSharing = true

      // Notify others
      this.socket.emit("start-screen-share", {
        roomId: this.roomId,
        userId: this.userId,
      })

      // Handle screen share end
      videoTrack.onended = () => {
        this.stopScreenShare()
      }
    } catch (error) {
      console.error("Error starting screen share:", error)
    }
  }

  async stopScreenShare() {
    try {
      // Get camera stream back
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      // Replace video track in all peer connections
      const videoTrack = cameraStream.getVideoTracks()[0]

      this.peers.forEach(async (peer) => {
        const sender = peer.getSenders().find((s) => s.track && s.track.kind === "video")
        if (sender) {
          await sender.replaceTrack(videoTrack)
        }
      })

      // Update local video
      this.localVideo.srcObject = cameraStream
      this.localStream = cameraStream
      this.isScreenSharing = false

      // Notify others
      this.socket.emit("stop-screen-share", {
        roomId: this.roomId,
        userId: this.userId,
      })
    } catch (error) {
      console.error("Error stopping screen share:", error)
    }
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        return !audioTrack.enabled
      }
    }
    return false
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        return !videoTrack.enabled
      }
    }
    return false
  }

  sendChatMessage(message) {
    this.socket.emit("chat-message", {
      message: message,
      roomId: this.roomId,
      from: this.userId,
    })
  }

  displayChatMessage(data) {
    const chatMessages = document.getElementById("chatMessages")
    const messageElement = document.createElement("div")
    messageElement.className = "chat-message"
    messageElement.innerHTML = `
      <strong>${data.from}:</strong> ${data.message}
      <small>${new Date(data.timestamp).toLocaleTimeString()}</small>
    `
    chatMessages.appendChild(messageElement)
    chatMessages.scrollTop = chatMessages.scrollHeight
  }

  showScreenShareNotification(userId, isSharing) {
    const notification = document.createElement("div")
    notification.className = "notification"
    notification.textContent = `${userId} ${isSharing ? "started" : "stopped"} screen sharing`
    document.body.appendChild(notification)

    setTimeout(() => {
      notification.remove()
    }, 3000)
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.videoConference = new VideoConference()
})
