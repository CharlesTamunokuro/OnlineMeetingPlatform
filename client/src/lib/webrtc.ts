/**
 * WebRTC utility functions for peer connection management
 */

const DEFAULT_STUN_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

type IceServerEnv = Record<string, string | undefined>;

function parseIceUrls(value?: string) {
  return value
    ?.split(",")
    .map(url => url.trim())
    .filter(Boolean) ?? [];
}

export function getIceServers(env: IceServerEnv = import.meta.env as IceServerEnv): RTCIceServer[] {
  const configuredIceServers: RTCIceServer[] = [];
  const stunServers = parseIceUrls(env.VITE_STUN_SERVERS);
  const turnServers = parseIceUrls(env.VITE_TURN_URLS ?? env.VITE_TURN_URL);

  if (stunServers.length > 0) {
    configuredIceServers.push({ urls: stunServers });
  }

  if (turnServers.length > 0) {
    configuredIceServers.push({
      urls: turnServers,
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }

  if (configuredIceServers.length === 0) {
    configuredIceServers.push({ urls: DEFAULT_STUN_SERVERS });
  }

  return configuredIceServers;
}

export interface RemoteStreamInfo {
  participantId: number;
  displayName: string;
  stream: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  peerConnection: RTCPeerConnection;
}

export class WebRTCManager {
  private peerConnections: Map<number, RTCPeerConnection> = new Map();
  private remoteStreams: Map<number, RemoteStreamInfo> = new Map();
  private pendingIceCandidates: Map<number, RTCIceCandidateInit[]> = new Map();
  private localStream: MediaStream | null = null;
  private onRemoteStreamAdded: ((stream: RemoteStreamInfo) => void) | null = null;
  private onRemoteStreamRemoved: ((participantId: number) => void) | null = null;
  private onConnectionStateChanged: ((participantId: number, state: RTCPeerConnectionState) => void) | null = null;

  constructor(
    onRemoteStreamAdded?: (stream: RemoteStreamInfo) => void,
    onRemoteStreamRemoved?: (participantId: number) => void,
    onConnectionStateChanged?: (participantId: number, state: RTCPeerConnectionState) => void
  ) {
    this.onRemoteStreamAdded = onRemoteStreamAdded || null;
    this.onRemoteStreamRemoved = onRemoteStreamRemoved || null;
    this.onConnectionStateChanged = onConnectionStateChanged || null;
  }

  async setLocalStream(stream: MediaStream) {
    this.localStream = stream;
  }

  private upsertRemoteStream(
    remoteParticipantId: number,
    displayName: string,
    peerConnection: RTCPeerConnection,
    incomingStream?: MediaStream,
    incomingTrack?: MediaStreamTrack
  ) {
    const existingStreamInfo = this.remoteStreams.get(remoteParticipantId);
    const stream = existingStreamInfo?.stream ?? incomingStream ?? new MediaStream();

    if (incomingTrack && !stream.getTracks().some(track => track.id === incomingTrack.id)) {
      stream.addTrack(incomingTrack);
    }

    const streamInfo: RemoteStreamInfo = {
      participantId: remoteParticipantId,
      displayName,
      stream,
      audioEnabled: stream.getAudioTracks().length > 0,
      videoEnabled: stream.getVideoTracks().length > 0,
      peerConnection,
    };

    this.remoteStreams.set(remoteParticipantId, streamInfo);
    this.onRemoteStreamAdded?.(streamInfo);
  }

  private async flushPendingIceCandidates(remoteParticipantId: number) {
    const peerConnection = this.peerConnections.get(remoteParticipantId);
    const pendingCandidates = this.pendingIceCandidates.get(remoteParticipantId);

    if (!peerConnection || !peerConnection.remoteDescription || !pendingCandidates?.length) {
      return;
    }

    for (const candidate of pendingCandidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Error adding queued ICE candidate:", error);
      }
    }

    this.pendingIceCandidates.delete(remoteParticipantId);
  }

  private async restartIce(
    peerConnection: RTCPeerConnection,
    onOffer?: (offer: RTCSessionDescriptionInit) => void
  ) {
    if (!onOffer || peerConnection.signalingState !== "stable") {
      return;
    }

    try {
      const restartOffer = await peerConnection.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerConnection.setLocalDescription(restartOffer);
      onOffer(restartOffer);
    } catch (error) {
      console.warn("ICE restart failed:", error);
    }
  }

  async createPeerConnection(
    remoteParticipantId: number,
    displayName: string,
    initiator: boolean,
    onOffer?: (offer: RTCSessionDescriptionInit) => void,
    onIceCandidate?: (candidate: RTCIceCandidate) => void
  ): Promise<RTCPeerConnection> {
    const existingPeerConnection = this.peerConnections.get(remoteParticipantId);
    if (existingPeerConnection) {
      return existingPeerConnection;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
    });

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream!);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      // Use existing stream from event, or fall back to a new one containing the track
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);

      // Attach immediately so the video element gets the stream right away
      this.upsertRemoteStream(remoteParticipantId, displayName, peerConnection, remoteStream, event.track);

      event.track.onmute = () => {
        this.upsertRemoteStream(remoteParticipantId, displayName, peerConnection, remoteStream, event.track);
      };
      event.track.onunmute = () => {
        this.upsertRemoteStream(remoteParticipantId, displayName, peerConnection, remoteStream, event.track);
      };
      event.track.onended = () => {
        this.upsertRemoteStream(remoteParticipantId, displayName, peerConnection, remoteStream);
      };
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate?.(event.candidate);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === "failed") {
        void this.restartIce(peerConnection, onOffer);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      this.onConnectionStateChanged?.(remoteParticipantId, state);

      if (state === "failed") {
        void this.restartIce(peerConnection, onOffer);
      }

      if (state === "closed") {
        this.removePeerConnection(remoteParticipantId);
      }
    };

    this.peerConnections.set(remoteParticipantId, peerConnection);

    // Create offer if initiator
    if (initiator) {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerConnection.setLocalDescription(offer);
      onOffer?.(offer);
    }

    return peerConnection;
  }

  async handleOffer(
    remoteParticipantId: number,
    displayName: string,
    offer: RTCSessionDescriptionInit,
    onAnswer?: (answer: RTCSessionDescriptionInit) => void,
    onIceCandidate?: (candidate: RTCIceCandidate) => void,
    onOffer?: (nextOffer: RTCSessionDescriptionInit) => void
  ): Promise<RTCPeerConnection> {
    let peerConnection = this.peerConnections.get(remoteParticipantId);

    if (!peerConnection) {
      peerConnection = await this.createPeerConnection(
        remoteParticipantId,
        displayName,
        false,
        onOffer,
        onIceCandidate
      );
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates(remoteParticipantId);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    onAnswer?.(answer);

    return peerConnection;
  }

  async handleAnswer(
    remoteParticipantId: number,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const peerConnection = this.peerConnections.get(remoteParticipantId);
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await this.flushPendingIceCandidates(remoteParticipantId);
    }
  }

  async addIceCandidate(
    remoteParticipantId: number,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const peerConnection = this.peerConnections.get(remoteParticipantId);

    if (!peerConnection || !peerConnection.remoteDescription) {
      const queuedCandidates = this.pendingIceCandidates.get(remoteParticipantId) ?? [];
      queuedCandidates.push(candidate);
      this.pendingIceCandidates.set(remoteParticipantId, queuedCandidates);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }

  removePeerConnection(remoteParticipantId: number): void {
    const peerConnection = this.peerConnections.get(remoteParticipantId);
    if (peerConnection && peerConnection.connectionState !== "closed") {
      peerConnection.close();
    }

    this.peerConnections.delete(remoteParticipantId);
    this.pendingIceCandidates.delete(remoteParticipantId);
    this.remoteStreams.delete(remoteParticipantId);
    this.onRemoteStreamRemoved?.(remoteParticipantId);
  }

  getRemoteStream(participantId: number): RemoteStreamInfo | undefined {
    return this.remoteStreams.get(participantId);
  }

  getAllRemoteStreams(): RemoteStreamInfo[] {
    return Array.from(this.remoteStreams.values());
  }

  closeAll(): void {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.pendingIceCandidates.clear();
    this.remoteStreams.clear();
  }

  getStats() {
    return {
      peerConnectionCount: this.peerConnections.size,
      remoteStreamCount: this.remoteStreams.size,
    };
  }
}