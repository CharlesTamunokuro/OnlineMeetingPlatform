# VideoMeet: Video Conferencing MVP Documentation

## Executive Summary

VideoMeet is a minimum viable product for a video conferencing platform designed with simplicity, reliability, and speed of launch as core principles. The application enables users to create and join online meetings with minimal friction, featuring real-time video and audio communication powered by WebRTC peer-to-peer technology. The MVP focuses exclusively on essential features while maintaining an elegant, intuitive user interface.

## Core User Flow

The application follows a straightforward three-step user journey:

**Step 1: Meeting Creation or Discovery**
Users land on the home page where they can either create a new meeting or join an existing one. Creating a meeting generates a unique meeting ID that can be shared with others. Joining a meeting requires entering the meeting ID and providing a display name.

**Step 2: Meeting Room Entry**
Once a user creates or joins a meeting, they are directed to the meeting room where their camera and microphone are activated. The application requests permission to access the user's media devices and establishes a local media stream.

**Step 3: Real-Time Interaction**
Participants can see each other's video feeds in a responsive grid layout, control their audio and video independently, and view a live participant list. The meeting continues until all participants leave or the host ends the session.

## Technical Architecture

### Frontend Stack

The frontend is built with React 19 and Tailwind CSS 4, providing a modern and responsive user interface. Key technologies include:

- **React 19**: Component-based UI framework with hooks for state management
- **Tailwind CSS 4**: Utility-first CSS framework for rapid styling
- **WebRTC API**: Browser-native peer-to-peer communication
- **WebSocket**: Real-time bidirectional communication for signaling
- **tRPC**: Type-safe API communication between frontend and backend

### Backend Stack

The backend is built with Express.js and Node.js, providing REST API endpoints and WebSocket signaling:

- **Express.js 4**: Lightweight web framework for HTTP routing
- **Node.js**: JavaScript runtime for server-side execution
- **WebSocket (ws library)**: WebSocket server for peer signaling
- **tRPC 11**: Type-safe RPC framework for client-server communication
- **Drizzle ORM**: Type-safe database query builder
- **MySQL/TiDB**: Relational database for persistent data storage

### Database Schema

The application uses three primary tables to manage meetings and participants:

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | Authentication and user profiles | id, openId, name, email, role, createdAt |
| `meetings` | Meeting metadata and lifecycle | id, meetingId, hostId, title, status, createdAt, endedAt |
| `participants` | Participant tracking and media status | id, meetingId, userId, displayName, joinedAt, leftAt, audioEnabled, videoEnabled |

### WebRTC Architecture

WebRTC enables peer-to-peer video and audio communication without requiring a centralized media server. The signaling process works as follows:

1. **Signaling Server**: A WebSocket server coordinates peer discovery and session description exchange
2. **Offer/Answer Exchange**: When a new participant joins, the initiator sends an SDP offer, and the responder returns an SDP answer
3. **ICE Candidates**: STUN servers help peers discover their public IP addresses and establish direct connections
4. **Media Streams**: Once peers are connected, media flows directly between them without passing through the server

## Essential UI Screens

### Landing Page

The landing page presents two primary action cards:

- **Start a Meeting**: Creates a new meeting with an optional title. The generated meeting ID is displayed and can be copied to clipboard for sharing.
- **Join a Meeting**: Allows users to enter a meeting ID and display name to join an existing meeting.

The page includes a header with branding, a hero section with value proposition, and feature highlights explaining the application's capabilities.

### Meeting Room

The meeting room provides a full-screen video conferencing experience with:

- **Video Grid**: Displays local video feed and remote participant feeds in a responsive grid layout
- **Control Bar**: Floating toolbar at the bottom with buttons to toggle audio, video, and leave the meeting
- **Participant Sidebar**: Right-side panel (on desktop) showing a list of all participants with their media status indicators
- **Header**: Displays meeting ID, participant count, and copy-to-clipboard functionality

## Key Features Implemented

### 1. Meeting Creation and Joining

Users can create a new meeting with a single click, generating a unique meeting ID. The meeting ID can be copied to clipboard and shared with others. Joining a meeting requires the meeting ID and a display name, allowing anonymous participation.

### 2. Real-Time Video and Audio

WebRTC technology enables direct peer-to-peer communication between participants. Each participant's video and audio streams are transmitted directly to other participants without passing through a central server, reducing latency and bandwidth requirements.

### 3. Media Controls

Participants can independently control their audio and video:

- **Mute/Unmute Microphone**: Toggle audio transmission with visual feedback
- **Turn Camera On/Off**: Toggle video transmission with visual feedback
- **Status Indicators**: Other participants can see whether each person's audio and video are enabled

### 4. Participant List

A live participant list displays all connected users with their display names and media status. The list updates in real-time as participants join or leave the meeting.

### 5. Leave Meeting

Users can leave a meeting with a confirmation dialog. Leaving a meeting closes all peer connections and removes the participant from the meeting room.

### 6. Elegant User Interface

The application features a carefully designed interface with:

- **Gradient backgrounds**: Modern, professional color schemes
- **Responsive grid layout**: Video tiles adapt to different screen sizes
- **Smooth animations**: Transitions and loading states provide visual feedback
- **Intuitive controls**: Clear, accessible buttons and dialogs
- **Dark theme for meeting room**: Reduces eye strain during extended video calls

## Scalability Considerations

### Current Limitations

The MVP uses a peer-to-peer architecture suitable for small meetings (2-4 participants). As the number of participants increases, bandwidth and CPU usage grow exponentially due to the full-mesh topology where each participant connects to every other participant.

### Future Enhancements

**Selective Forwarding Unit (SFU) Architecture**: For larger meetings, implement an SFU that receives media from each participant and forwards it to others. This reduces bandwidth requirements and CPU usage on client devices.

**Media Server Integration**: Integrate a media server like Jitsi, Kurento, or Medooze to handle media routing, recording, and advanced features.

**Adaptive Bitrate Streaming**: Implement dynamic quality adjustment based on network conditions to maintain smooth video even on poor connections.

**Connection Pooling**: Optimize database connections and implement caching to handle increased load.

**Load Balancing**: Deploy multiple server instances behind a load balancer to distribute traffic.

**CDN Integration**: Use a content delivery network for static assets and reduce latency for global users.

### Performance Optimization

- **Hardware Acceleration**: Leverage GPU for video encoding/decoding
- **Bandwidth Optimization**: Implement VP9 or AV1 codecs for better compression
- **Connection Monitoring**: Implement network quality estimation and automatic quality adjustment
- **Lazy Loading**: Load participant videos on-demand to reduce initial bandwidth

## Deployment Guide

### Prerequisites

- Node.js 22.13.0 or later
- MySQL 8.0 or later (or TiDB compatible database)
- npm or pnpm package manager

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd video-conferencing-mvp

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and OAuth credentials

# Run database migrations
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### Development

```bash
# Start the development server
pnpm dev

# Run tests
pnpm test

# Type checking
pnpm check
```

### Production Build

```bash
# Build the application
pnpm build

# Start the production server
pnpm start
```

## Testing

The application includes unit tests for core logic:

- **Authentication Tests**: Verify logout functionality and session management
- **WebRTC Manager Tests**: Test peer connection creation and stream management
- **Database Tests**: Verify query helpers and data persistence

Run tests with:

```bash
pnpm test
```

## Security Considerations

- **Authentication**: Uses Manus OAuth for secure user authentication
- **Session Management**: Implements secure session cookies with HTTP-only and SameSite flags
- **Data Validation**: All user inputs are validated on both client and server
- **HTTPS/WSS**: All connections use encrypted protocols in production
- **CORS Protection**: Implements proper CORS headers to prevent unauthorized access

## Future Feature Roadmap

**Phase 2: Enhanced Features**
- Screen sharing capability
- Chat messaging during meetings
- Meeting recordings
- Participant hand-raising
- Waiting room for host approval

**Phase 3: Advanced Features**
- AI-powered background blur and replacement
- Real-time captions and transcription
- Meeting scheduling and calendar integration
- Breakout rooms for group discussions
- Virtual whiteboard for collaboration

**Phase 4: Enterprise Features**
- Single sign-on (SSO) integration
- Meeting analytics and reporting
- Custom branding and white-labeling
- API for third-party integrations
- Advanced security and compliance features

## Troubleshooting

### Camera/Microphone Not Working

- Ensure the browser has permission to access media devices
- Check that no other application is using the camera
- Try refreshing the page and granting permissions again

### Poor Video Quality

- Check your internet connection speed
- Reduce the number of active video streams
- Move closer to your WiFi router
- Close other applications consuming bandwidth

### Connection Issues

- Verify that WebSocket connections are not blocked by firewall
- Check that the server is running and accessible
- Try using a different network or VPN

### Participants Not Appearing

- Ensure all participants have joined the same meeting ID
- Check that the meeting status is "active"
- Verify that WebRTC peer connections are established (check browser console)

## Support and Feedback

For issues, feature requests, or feedback, please contact the development team or submit an issue through the project repository.

---

**Document Version**: 1.0  
**Last Updated**: March 14, 2026  
**Author**: Manus AI
