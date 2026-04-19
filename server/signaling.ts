import { Server as HTTPServer } from "http";
import { RawData, WebSocketServer, WebSocket } from "ws";
import { removeParticipant } from "./db";

interface ParticipantMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

interface ParticipantSnapshot extends ParticipantMediaState {
  id: number;
  displayName: string;
}

interface SignalingMessage {
  type: string;
  meetingId?: string;
  participantId?: number;
  participantCount?: number;
  participants?: ParticipantSnapshot[];
  targetParticipantId?: number;
  displayName?: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  offer?: any;
  answer?: any;
  candidate?: any;
  data?: any;
}

interface MeetingRoom {
  meetingId: string;
  participants: Map<number, WebSocket>;
  participantNames: Map<number, string>;
  participantMedia: Map<number, ParticipantMediaState>;
}

class SignalingServer {
  private wss: WebSocketServer;
  private rooms: Map<string, MeetingRoom> = new Map();
  private participantToRoom: Map<number, string> = new Map();
  private wsToParticipant: Map<WebSocket, number> = new Map();

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: "/api/ws" });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log("New WebSocket connection");

      ws.on("message", (data: RawData) => {
        try {
          const message: SignalingMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(ws);
      });

      ws.on("error", (error: Error) => {
        console.error("WebSocket error:", error);
      });
    });
  }

  private handleMessage(ws: WebSocket, message: SignalingMessage) {
    switch (message.type) {
      case "join":
        this.handleJoin(ws, message);
        break;
      case "offer":
        this.handleOffer(ws, message);
        break;
      case "answer":
        this.handleAnswer(ws, message);
        break;
      case "ice-candidate":
        this.handleIceCandidate(ws, message);
        break;
      case "participant-media-state":
        this.handleParticipantMediaState(ws, message);
        break;
      case "whiteboard-data":
        this.handleWhiteboardData(ws, message);
        break;
      default:
        console.warn("Unknown message type:", message.type);
    }
  }

  private sendMessage(ws: WebSocket, message: SignalingMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private getParticipantSnapshot(room: MeetingRoom, participantId: number): ParticipantSnapshot {
    const mediaState = room.participantMedia.get(participantId) ?? {
      audioEnabled: true,
      videoEnabled: true,
    };

    return {
      id: participantId,
      displayName: room.participantNames.get(participantId) || `Participant ${participantId}`,
      audioEnabled: mediaState.audioEnabled,
      videoEnabled: mediaState.videoEnabled,
    };
  }

  private handleJoin(ws: WebSocket, message: SignalingMessage) {
    const { meetingId, participantId, displayName } = message;

    if (!meetingId || !participantId) {
      console.error("Missing meetingId or participantId");
      return;
    }

    // Get or create room
    let room = this.rooms.get(meetingId);
    if (!room) {
      room = {
        meetingId,
        participants: new Map(),
        participantNames: new Map(),
        participantMedia: new Map(),
      };
      this.rooms.set(meetingId, room);
    }

    const participantMediaState: ParticipantMediaState = {
      audioEnabled: message.audioEnabled ?? true,
      videoEnabled: message.videoEnabled ?? true,
    };

    // Add participant to room
    room.participants.set(participantId, ws);
    room.participantNames.set(participantId, displayName || `Participant ${participantId}`);
    room.participantMedia.set(participantId, participantMediaState);
    this.participantToRoom.set(participantId, meetingId);
    this.wsToParticipant.set(ws, participantId);

    const participantCount = room.participants.size;

    // Notify existing participants about new participant
    room.participants.forEach((participant, pId) => {
      if (pId !== participantId) {
        this.sendMessage(participant, {
          type: "participant-joined",
          participantId,
          participantCount,
          displayName: room!.participantNames.get(participantId),
          audioEnabled: participantMediaState.audioEnabled,
          videoEnabled: participantMediaState.videoEnabled,
        });
      }
    });

    // Send current participant list to new participant
    const participantList = Array.from(room.participants.keys()).map(pId => (
      this.getParticipantSnapshot(room!, pId)
    ));

    this.sendMessage(ws, {
      type: "participant-list",
      participantCount,
      participants: participantList,
    });

    console.log(`Participant ${participantId} joined meeting ${meetingId}`);
  }

  private handleOffer(ws: WebSocket, message: SignalingMessage) {
    const senderParticipantId = this.wsToParticipant.get(ws);
    const { targetParticipantId, offer } = message;

    if (!senderParticipantId || !targetParticipantId || !offer) {
      console.error("Missing senderParticipantId, targetParticipantId, or offer");
      return;
    }

    // Find the meeting room for this participant
    const meetingId = this.participantToRoom.get(senderParticipantId);
    if (!meetingId) {
      console.error("Participant not in any room");
      return;
    }

    const room = this.rooms.get(meetingId);
    if (!room) {
      console.error("Room not found");
      return;
    }

    // Forward offer to target participant
    const targetWs = room.participants.get(targetParticipantId);

    if (targetWs) {
      this.sendMessage(targetWs, {
        type: "offer",
        participantId: senderParticipantId,
        displayName: room.participantNames.get(senderParticipantId),
        offer,
      });
    }
  }

  private handleAnswer(ws: WebSocket, message: SignalingMessage) {
    const senderParticipantId = this.wsToParticipant.get(ws);
    const { targetParticipantId, answer } = message;

    if (!senderParticipantId || !targetParticipantId || !answer) {
      console.error("Missing senderParticipantId, targetParticipantId, or answer");
      return;
    }

    // Find the meeting room for this participant
    const meetingId = this.participantToRoom.get(senderParticipantId);
    if (!meetingId) {
      console.error("Participant not in any room");
      return;
    }

    const room = this.rooms.get(meetingId);
    if (!room) {
      console.error("Room not found");
      return;
    }

    // Forward answer to target participant
    const targetWs = room.participants.get(targetParticipantId);

    if (targetWs) {
      this.sendMessage(targetWs, {
        type: "answer",
        participantId: senderParticipantId,
        answer,
      });
    }
  }

  private handleIceCandidate(ws: WebSocket, message: SignalingMessage) {
    const senderParticipantId = this.wsToParticipant.get(ws);
    const { targetParticipantId, candidate } = message;

    if (!senderParticipantId || !targetParticipantId || !candidate) {
      console.error("Missing senderParticipantId, targetParticipantId, or candidate");
      return;
    }

    // Find the meeting room for this participant
    const meetingId = this.participantToRoom.get(senderParticipantId);
    if (!meetingId) {
      console.error("Participant not in any room");
      return;
    }

    const room = this.rooms.get(meetingId);
    if (!room) {
      console.error("Room not found");
      return;
    }

    // Forward ICE candidate to target participant
    const targetWs = room.participants.get(targetParticipantId);

    if (targetWs) {
      this.sendMessage(targetWs, {
        type: "ice-candidate",
        participantId: senderParticipantId,
        candidate,
      });
    }
  }

  private handleParticipantMediaState(ws: WebSocket, message: SignalingMessage) {
    const participantId = this.wsToParticipant.get(ws);
    if (!participantId) {
      return;
    }

    const meetingId = this.participantToRoom.get(participantId);
    if (!meetingId) {
      return;
    }

    const room = this.rooms.get(meetingId);
    if (!room) {
      return;
    }

    const nextMediaState: ParticipantMediaState = {
      audioEnabled: message.audioEnabled ?? true,
      videoEnabled: message.videoEnabled ?? true,
    };

    room.participantMedia.set(participantId, nextMediaState);

    room.participants.forEach((participant, pId) => {
      if (pId !== participantId) {
        this.sendMessage(participant, {
          type: "participant-media-state",
          participantId,
          audioEnabled: nextMediaState.audioEnabled,
          videoEnabled: nextMediaState.videoEnabled,
        });
      }
    });
  }

  private handleWhiteboardData(ws: WebSocket, message: SignalingMessage) {
    const participantId = this.wsToParticipant.get(ws);
    const { data } = message;

    if (!participantId || !data) {
      return;
    }

    // Find the meeting room for this participant
    const meetingId = this.participantToRoom.get(participantId);
    if (!meetingId) {
      return;
    }

    const room = this.rooms.get(meetingId);
    if (!room) {
      return;
    }

    // Broadcast whiteboard data to all other participants in the room
    room.participants.forEach((participant, pId) => {
      if (pId !== participantId) {
        this.sendMessage(participant, {
          type: "whiteboard-data",
          participantId,
          data,
        });
      }
    });
  }

  private handleDisconnect(ws: WebSocket) {
    const participantId = this.wsToParticipant.get(ws);
    if (!participantId) {
      return;
    }

    const meetingId = this.participantToRoom.get(participantId);
    if (!meetingId) {
      return;
    }

    const room = this.rooms.get(meetingId);
    if (!room) {
      return;
    }

    room.participants.delete(participantId);
    room.participantNames.delete(participantId);
    room.participantMedia.delete(participantId);
    this.participantToRoom.delete(participantId);
    this.wsToParticipant.delete(ws);
    void removeParticipant(participantId).catch(error => {
      console.error("Failed to mark participant as left in the database:", error);
    });

    const participantCount = room.participants.size;

    // Notify other participants
    room.participants.forEach((participant: WebSocket) => {
      this.sendMessage(participant, {
        type: "participant-left",
        participantId,
        participantCount,
      });
    });

    // Clean up empty rooms
    if (room.participants.size === 0) {
      this.rooms.delete(room.meetingId);
    }

    console.log(`Participant ${participantId} left meeting ${room.meetingId}`);
  }

  public getStats() {
    return {
      totalRooms: this.rooms.size,
      totalParticipants: this.participantToRoom.size,
      rooms: Array.from(this.rooms.values()).map(room => ({
        meetingId: room.meetingId,
        participantCount: room.participants.size,
      })),
    };
  }
}

export default SignalingServer;
