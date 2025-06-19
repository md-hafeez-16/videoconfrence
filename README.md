# Vercel Video Conference App

A video conferencing application built with Next.js and optimized for Vercel deployment.

## Features

- 🎥 **Video Conferencing**: WebRTC-based peer-to-peer video calls
- 🖥️ **Screen Sharing**: Share your screen with participants
- 💬 **Real-time Chat**: Messaging during video calls
- 🎤 **Audio/Video Controls**: Mute/unmute and camera on/off
- 📱 **Responsive Design**: Works on desktop and mobile
- ☁️ **Vercel Optimized**: Uses API routes and polling for real-time features

## Deployment to Vercel

1. **Clone this repository**
2. **Install Vercel CLI**: `npm i -g vercel`
3. **Deploy**: `vercel --prod`

Or deploy directly from GitHub:
1. Connect your GitHub repository to Vercel
2. Vercel will automatically build and deploy

## Local Development

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Open [http://localhost:3000](http://localhost:3000)

## How It Works

Since Vercel doesn't support persistent WebSocket connections, this app uses:

- **API Routes**: For signaling and room management
- **Polling**: For real-time updates (messages, user presence, signaling)
- **WebRTC**: For direct peer-to-peer video/audio streaming
- **In-memory Storage**: For room state (use a database in production)

## Production Considerations

For production use, consider:

1. **Database**: Replace in-memory storage with a database (Supabase, PlanetScale, etc.)
2. **TURN Servers**: Add TURN servers for better connectivity
3. **Rate Limiting**: Implement rate limiting for API routes
4. **Authentication**: Add user authentication
5. **Monitoring**: Add error tracking and analytics

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Limitations

- **Polling-based**: Uses 1-second polling instead of WebSockets
- **Memory Storage**: Room state is lost on server restart
- **No TURN**: May have connectivity issues behind strict NATs

## Environment Variables

No environment variables required for basic functionality.
