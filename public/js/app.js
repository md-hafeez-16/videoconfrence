class App {
  constructor() {
    this.videoConference = null
    this.isInRoom = false
    this.isMuted = false
    this.isVideoOff = false
    this.isChatOpen = false

    this.initializeElements()
    this.setupEventListeners()
  }

  initializeElements() {
    this.roomInput = document.getElementById("roomInput")
    this.joinBtn = document.getElementById("joinBtn")
    this.roomStatus = document.getElementById("roomStatus")
    this.muteBtn = document.getElementById("muteBtn")
    this.videoBtn = document.getElementById("videoBtn")
    this.screenShareBtn = document.getElementById("screenShareBtn")
    this.chatBtn = document.getElementById("chatBtn")
    this.leaveBtn = document.getElementById("leaveBtn")
    this.chatPanel = document.getElementById("chatPanel")
    this.closeChatBtn = document.getElementById("closeChatBtn")
    this.chatInput = document.getElementById("chatInput")
    this.sendChatBtn = document.getElementById("sendChatBtn")
  }

  setupEventListeners() {
    this.joinBtn.addEventListener("click", () => this.joinRoom())
    this.roomInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.joinRoom()
    })

    this.muteBtn.addEventListener("click", () => this.toggleMute())
    this.videoBtn.addEventListener("click", () => this.toggleVideo())
    this.screenShareBtn.addEventListener("click", () => this.toggleScreenShare())
    this.chatBtn.addEventListener("click", () => this.toggleChat())
    this.leaveBtn.addEventListener("click", () => this.leaveRoom())

    this.closeChatBtn.addEventListener("click", () => this.toggleChat())
    this.sendChatBtn.addEventListener("click", () => this.sendMessage())
    this.chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.sendMessage()
    })

    // Generate random room ID if none provided
    this.roomInput.value = this.generateRoomId()
  }

  generateRoomId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase()
  }

  async joinRoom() {
    const roomId = this.roomInput.value.trim()
    if (!roomId) {
      alert("Please enter a room ID")
      return
    }

    try {
      this.videoConference = window.videoConference
      await this.videoConference.joinRoom(roomId)

      this.isInRoom = true
      this.updateUI()
      this.roomStatus.textContent = `Connected to room: ${roomId}`
    } catch (error) {
      console.error("Error joining room:", error)
      alert("Failed to join room. Please check your camera/microphone permissions.")
    }
  }

  leaveRoom() {
    if (this.videoConference && this.isInRoom) {
      // Close all peer connections
      this.videoConference.peers.forEach((peer) => peer.close())
      this.videoConference.peers.clear()

      // Stop local stream
      if (this.videoConference.localStream) {
        this.videoConference.localStream.getTracks().forEach((track) => track.stop())
      }

      // Clear remote videos
      document.getElementById("remoteVideos").innerHTML = ""
      document.getElementById("localVideo").srcObject = null

      this.isInRoom = false
      this.updateUI()
      this.roomStatus.textContent = "Disconnected"
    }
  }

  toggleMute() {
    if (this.videoConference && this.isInRoom) {
      this.isMuted = this.videoConference.toggleMute()
      this.updateMuteButton()
    }
  }

  toggleVideo() {
    if (this.videoConference && this.isInRoom) {
      this.isVideoOff = this.videoConference.toggleVideo()
      this.updateVideoButton()
    }
  }

  async toggleScreenShare() {
    if (this.videoConference && this.isInRoom) {
      if (this.videoConference.isScreenSharing) {
        await this.videoConference.stopScreenShare()
      } else {
        await this.videoConference.startScreenShare()
      }
      this.updateScreenShareButton()
    }
  }

  toggleChat() {
    this.isChatOpen = !this.isChatOpen
    this.chatPanel.classList.toggle("hidden", !this.isChatOpen)

    if (this.isChatOpen) {
      this.chatInput.focus()
    }
  }

  sendMessage() {
    const message = this.chatInput.value.trim()
    if (message && this.videoConference && this.isInRoom) {
      this.videoConference.sendChatMessage(message)

      // Display own message
      this.videoConference.displayChatMessage({
        message: message,
        from: "You",
        timestamp: new Date().toISOString(),
      })

      this.chatInput.value = ""
    }
  }

  updateUI() {
    this.joinBtn.disabled = this.isInRoom
    this.roomInput.disabled = this.isInRoom

    const controls = document.querySelector(".controls")
    controls.style.display = this.isInRoom ? "flex" : "none"
  }

  updateMuteButton() {
    const icon = this.muteBtn.querySelector(".icon")
    const label = this.muteBtn.querySelector(".label")

    if (this.isMuted) {
      icon.textContent = "🔇"
      label.textContent = "Unmute"
      this.muteBtn.classList.add("active")
    } else {
      icon.textContent = "🎤"
      label.textContent = "Mute"
      this.muteBtn.classList.remove("active")
    }
  }

  updateVideoButton() {
    const icon = this.videoBtn.querySelector(".icon")
    const label = this.videoBtn.querySelector(".label")

    if (this.isVideoOff) {
      icon.textContent = "📹"
      label.textContent = "Start Video"
      this.videoBtn.classList.add("active")
    } else {
      icon.textContent = "📹"
      label.textContent = "Stop Video"
      this.videoBtn.classList.remove("active")
    }
  }

  updateScreenShareButton() {
    const label = this.screenShareBtn.querySelector(".label")

    if (this.videoConference.isScreenSharing) {
      label.textContent = "Stop Sharing"
      this.screenShareBtn.classList.add("active")
    } else {
      label.textContent = "Share Screen"
      this.screenShareBtn.classList.remove("active")
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new App()
})
