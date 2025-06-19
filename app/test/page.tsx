"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export default function TestPage() {
  const [hasVideo, setHasVideo] = useState(false)
  const [hasAudio, setHasAudio] = useState(false)
  const [error, setError] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)

  const testMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      const videoTracks = stream.getVideoTracks()
      const audioTracks = stream.getAudioTracks()

      setHasVideo(videoTracks.length > 0)
      setHasAudio(audioTracks.length > 0)
      setError("")

      console.log("Video tracks:", videoTracks)
      console.log("Audio tracks:", audioTracks)
    } catch (err) {
      setError(`Error: ${err}`)
      console.error("Media error:", err)
    }
  }

  const testWebRTC = async () => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      })

      console.log("WebRTC PeerConnection created successfully")

      pc.onicecandidate = (event) => {
        console.log("ICE candidate:", event.candidate)
      }

      const offer = await pc.createOffer()
      console.log("Offer created:", offer)

      pc.close()
    } catch (err) {
      console.error("WebRTC error:", err)
      setError(`WebRTC Error: ${err}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Media & WebRTC Test</h1>

      <div className="space-y-6">
        <div>
          <Button onClick={testMedia} className="mr-4">
            Test Camera & Microphone
          </Button>
          <Button onClick={testWebRTC}>Test WebRTC</Button>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 p-4 rounded">
            <h3 className="font-bold text-red-300">Error:</h3>
            <p className="text-red-200">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-4">Video Test</h3>
            <video ref={videoRef} autoPlay muted playsInline className="w-full bg-gray-800 rounded-lg" />
            <p className="mt-2">Video: {hasVideo ? "✅ Working" : "❌ Not detected"}</p>
            <p>Audio: {hasAudio ? "✅ Working" : "❌ Not detected"}</p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-4">Browser Info</h3>
            <div className="bg-gray-800 p-4 rounded-lg text-sm">
              <p>
                <strong>User Agent:</strong> {navigator.userAgent}
              </p>
              <p>
                <strong>WebRTC Support:</strong> {window.RTCPeerConnection ? "✅ Yes" : "❌ No"}
              </p>
              <p>
                <strong>getUserMedia Support:</strong> {navigator.mediaDevices?.getUserMedia ? "✅ Yes" : "❌ No"}
              </p>
              <p>
                <strong>HTTPS:</strong> {location.protocol === "https:" ? "✅ Yes" : "❌ No"}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-4">Instructions</h3>
          <div className="bg-gray-800 p-4 rounded-lg">
            <ol className="list-decimal list-inside space-y-2">
              <li>Click "Test Camera & Microphone" and allow permissions</li>
              <li>You should see your video feed above</li>
              <li>Check that both video and audio show "✅ Working"</li>
              <li>Click "Test WebRTC" to verify WebRTC functionality</li>
              <li>Check the browser console for detailed logs</li>
              <li>If everything works here, go back to the main app</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
