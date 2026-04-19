import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mic, MicOff, Video, VideoOff, Phone, Users, Copy, Check, Loader2, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { WebRTCManager, RemoteStreamInfo } from "@/lib/webrtc";
import Whiteboard from "@/components/Whiteboard";
import { getMeetingDisplayName, getStoredUserDisplayName } from "@/lib/meetingSession";

type ParticipantConnectionState = RTCPeerConnectionState | "connecting";

interface ParticipantInfo {
  id: number;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  connectionState: ParticipantConnectionState;
}

interface MediaStatus {
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
  audioTrackEnabled: boolean;
  videoTrackEnabled: boolean;
  audioLevel: number;
  videoTrackMuted: boolean;
  videoTrackReadyState: string;
  audioTrackLabel: string;
  videoTrackLabel: string;
}

interface SignalingParticipant {
  id: number;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

interface SignalingMessage {
  type: string;
  meetingId?: string;
  participantId?: number;
  participantCount?: number;
  participants?: SignalingParticipant[];
  targetParticipantId?: number;
  displayName?: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  data?: unknown;
}

function getConnectionLabel(connectionState: ParticipantConnectionState) {
  switch (connectionState) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "disconnected":
      return "Reconnecting";
    case "failed":
      return "Connection issue";
    case "closed":
      return "Disconnected";
    case "new":
      return "Connecting";
    default:
      return "Checking media";
  }
}

function getFallbackDisplayName(meetingId: string) {
  return (
    getMeetingDisplayName(meetingId) ||
    getStoredUserDisplayName() ||
    `Guest-${Math.random().toString(36).slice(2, 8)}`
  );
}

export default function MeetingRoom() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const [, setLocation] = useLocation();

  // Local state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamInfo[]>([]);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [copiedMeetingId, setCopiedMeetingId] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>({
    hasAudioTrack: false,
    hasVideoTrack: false,
    audioTrackEnabled: false,
    videoTrackEnabled: false,
    audioLevel: 0,
    videoTrackMuted: false,
    videoTrackReadyState: "missing",
    audioTrackLabel: "",
    videoTrackLabel: "",
  });

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const participantsRef = useRef<ParticipantInfo[]>([]);
  const participantCountRef = useRef(1);
  const initializationStartedRef = useRef(false);
  const audioMeterCleanupRef = useRef<(() => void) | null>(null);
  // tRPC queries and mutations
  const joinMeetingMutation = trpc.meetings.join.useMutation();
  const leaveMeetingMutation = trpc.meetings.leave.useMutation();
  const updateAudioMutation = trpc.meetings.updateAudio.useMutation();
  const updateVideoMutation = trpc.meetings.updateVideo.useMutation();
  const joinMeetingMutationRef = useRef(joinMeetingMutation);

  const attachLocalPreview = useCallback(async (stream: MediaStream | null) => {
    const videoElement = localVideoRef.current;
    if (!videoElement || !stream) {
      return;
    }

    videoElement.srcObject = null;
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.defaultMuted = true;
    videoElement.volume = 0;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.setAttribute("playsinline", "true");

    try {
      await videoElement.play();
    } catch (error) {
      console.warn("Local preview autoplay was blocked:", error);
    }
  }, []);

  const startAudioMeter = useCallback(async (stream: MediaStream | null) => {
    audioMeterCleanupRef.current?.();
    audioMeterCleanupRef.current = null;

    if (!stream || stream.getAudioTracks().length === 0) {
      setMediaStatus(prev => ({ ...prev, audioLevel: 0 }));
      return;
    }

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn("Unable to resume audio context:", error);
      }
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;

    const updateLevel = () => {
      analyser.getByteTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const normalized = (data[i] - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(100, Math.round(rms * 280));
      setMediaStatus(prev => ({ ...prev, audioLevel: level }));
      rafId = window.requestAnimationFrame(updateLevel);
    };

    updateLevel();

    audioMeterCleanupRef.current = () => {
      window.cancelAnimationFrame(rafId);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
    };
  }, []);

  const upsertParticipant = useCallback((nextParticipant: ParticipantInfo) => {
    setParticipants(prev => {
      const existingParticipant = prev.find(participant => participant.id === nextParticipant.id);

      if (!existingParticipant) {
        return [...prev, nextParticipant];
      }

      return prev.map(participant => (
        participant.id === nextParticipant.id
          ? { ...participant, ...nextParticipant }
          : participant
      ));
    });
  }, []);

  const updateParticipantMediaState = useCallback((targetParticipantId: number, audioState: boolean, videoState: boolean) => {
    setParticipants(prev => prev.map(participant => (
      participant.id === targetParticipantId
        ? {
            ...participant,
            audioEnabled: audioState,
            videoEnabled: videoState,
          }
        : participant
    )));
  }, []);

  const sendSignal = useCallback((message: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const broadcastMediaState = useCallback((nextAudioEnabled: boolean, nextVideoEnabled: boolean) => {
    sendSignal({
      type: "participant-media-state",
      audioEnabled: nextAudioEnabled,
      videoEnabled: nextVideoEnabled,
    });
  }, [sendSignal]);

  // Initialize WebRTC manager callbacks
  const handleRemoteStreamAdded = useCallback((stream: RemoteStreamInfo) => {
    console.log("Remote stream added:", stream.participantId);
    setRemoteStreams(prev => {
      const existingRemoteStream = prev.find(remote => remote.participantId === stream.participantId);

      if (!existingRemoteStream) {
        return [...prev, stream];
      }

      return prev.map(remote => (
        remote.participantId === stream.participantId ? stream : remote
      ));
    });

    setParticipants(prev => prev.map(participant => (
      participant.id === stream.participantId
        ? { ...participant, displayName: stream.displayName, connectionState: "connected" }
        : participant
    )));
  }, []);

  const handleRemoteStreamRemoved = useCallback((targetParticipantId: number) => {
    console.log("Remote stream removed:", targetParticipantId);
    setRemoteStreams(prev => prev.filter(remote => remote.participantId !== targetParticipantId));
    setParticipants(prev => prev.map(participant => (
      participant.id === targetParticipantId
        ? { ...participant, connectionState: "disconnected" }
        : participant
    )));
  }, []);

  const handleConnectionStateChanged = useCallback((targetParticipantId: number, state: RTCPeerConnectionState) => {
    console.log(`Connection state changed for ${targetParticipantId}:`, state);
    setParticipants(prev => prev.map(participant => (
      participant.id === targetParticipantId
        ? { ...participant, connectionState: state }
        : participant
    )));
  }, []);

  useEffect(() => {
    joinMeetingMutationRef.current = joinMeetingMutation;
  }, [joinMeetingMutation]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    participantCountRef.current = participantCount;
  }, [participantCount]);

  useEffect(() => {
    localStreamRef.current = localStream;
    void attachLocalPreview(localStream);
  }, [attachLocalPreview, localStream]);

  // Initialize WebSocket signaling
  const initializeSignaling = useCallback((
    pId: number,
    participantDisplayName: string,
    currentAudioEnabled: boolean,
    currentVideoEnabled: boolean
  ) => {
    wsRef.current?.close();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "join",
        meetingId,
        participantId: pId,
        displayName: participantDisplayName,
        audioEnabled: currentAudioEnabled,
        videoEnabled: currentVideoEnabled,
      } satisfies SignalingMessage));
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data) as SignalingMessage;
      await handleSignalingMessage(message, pId);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
    };

    wsRef.current = ws;
  }, [meetingId]);

  // Handle signaling messages
  const handleSignalingMessage = useCallback(async (message: SignalingMessage, pId: number) => {
    try {
      if (message.type === "participant-joined" && message.participantId) {
        // New participant joined, create peer connection as initiator
        const remoteParticipantId = message.participantId;
        const remoteDisplayName = message.displayName || `Participant ${remoteParticipantId}`;
        console.log("Participant joined:", remoteParticipantId);

        await webrtcManagerRef.current?.createPeerConnection(
          remoteParticipantId,
          remoteDisplayName,
          true,
          (offer) => {
            sendSignal({
              type: "offer",
              targetParticipantId: remoteParticipantId,
              offer,
            });
          },
          (candidate) => {
            sendSignal({
              type: "ice-candidate",
              targetParticipantId: remoteParticipantId,
              candidate,
            });
          }
        );

        upsertParticipant({
          id: remoteParticipantId,
          displayName: remoteDisplayName,
          audioEnabled: message.audioEnabled ?? true,
          videoEnabled: message.videoEnabled ?? true,
          connectionState: "connecting",
        });
        setParticipantCount(message.participantCount ?? Math.max(1, participantCountRef.current + 1));
      } else if (message.type === "offer" && message.participantId && message.offer) {
        // Received offer from peer
        const remoteParticipantId = message.participantId;
        const remoteDisplayName = message.displayName || `Participant ${remoteParticipantId}`;
        console.log("Received offer from:", remoteParticipantId);

        upsertParticipant({
          id: remoteParticipantId,
          displayName: remoteDisplayName,
          audioEnabled: message.audioEnabled ?? true,
          videoEnabled: message.videoEnabled ?? true,
          connectionState: "connecting",
        });

        await webrtcManagerRef.current?.handleOffer(
          remoteParticipantId,
          remoteDisplayName,
          message.offer,
          (answer) => {
            sendSignal({
              type: "answer",
              targetParticipantId: remoteParticipantId,
              answer,
            });
          },
          (candidate) => {
            sendSignal({
              type: "ice-candidate",
              targetParticipantId: remoteParticipantId,
              candidate,
            });
          },
          (offer) => {
            sendSignal({
              type: "offer",
              targetParticipantId: remoteParticipantId,
              offer,
            });
          }
        );
      } else if (message.type === "answer" && message.participantId && message.answer) {
        // Received answer from peer
        const remoteParticipantId = message.participantId;
        console.log("Received answer from:", remoteParticipantId);

        await webrtcManagerRef.current?.handleAnswer(remoteParticipantId, message.answer);
      } else if (message.type === "ice-candidate" && message.participantId && message.candidate) {
        // Received ICE candidate
        await webrtcManagerRef.current?.addIceCandidate(message.participantId, message.candidate);
      } else if (message.type === "participant-list") {
        // Update participant list
        const nextParticipants = (message.participants ?? [])
          .filter(participant => participant.id !== pId)
          .map(participant => ({
            ...participant,
            connectionState: participantsRef.current.find(existing => existing.id === participant.id)?.connectionState ?? "connecting",
          } satisfies ParticipantInfo));

        setParticipants(nextParticipants);
        setParticipantCount(message.participantCount ?? nextParticipants.length + 1);
      } else if (message.type === "participant-media-state" && message.participantId) {
        updateParticipantMediaState(
          message.participantId,
          message.audioEnabled ?? true,
          message.videoEnabled ?? true
        );
      } else if (message.type === "participant-left" && message.participantId) {
        // Participant left
        webrtcManagerRef.current?.removePeerConnection(message.participantId);
        setParticipants(prev => prev.filter(participant => participant.id !== message.participantId));
        setParticipantCount(message.participantCount ?? Math.max(1, participantCountRef.current - 1));
      }
    } catch (error) {
      console.error("Error handling signaling message:", error);
    }
  }, [sendSignal, updateParticipantMediaState, upsertParticipant]);

  // Initialize meeting
  useEffect(() => {
    if (!meetingId || participantId !== null || initializationStartedRef.current) {
      return;
    }

    let cancelled = false;

    const initializeMeeting = async () => {
      try {
        setIsLoading(true);

        const preferredDisplayName = getFallbackDisplayName(meetingId);
        setDisplayName(preferredDisplayName);

        // Request user media
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: "user",
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        const hasVideoTrack = videoTracks.length > 0;
        const hasAudioTrack = audioTracks.length > 0;
        const localVideoEnabled = hasVideoTrack && videoTracks.some(track => track.enabled);
        const localAudioEnabled = hasAudioTrack && audioTracks.some(track => track.enabled);
        const primaryVideoTrack = videoTracks[0] ?? null;

        setMediaStatus({
          hasAudioTrack,
          hasVideoTrack,
          audioTrackEnabled: localAudioEnabled,
          videoTrackEnabled: localVideoEnabled,
          audioLevel: 0,
          videoTrackMuted: primaryVideoTrack?.muted ?? false,
          videoTrackReadyState: primaryVideoTrack?.readyState ?? "missing",
          audioTrackLabel: audioTracks[0]?.label ?? "",
          videoTrackLabel: primaryVideoTrack?.label ?? "",
        });
        setVideoEnabled(localVideoEnabled);
        setAudioEnabled(localAudioEnabled);
        localStreamRef.current = stream;
        setLocalStream(stream);
        await attachLocalPreview(stream);
        await startAudioMeter(stream);

        if (primaryVideoTrack) {
          primaryVideoTrack.onmute = () => {
            setMediaStatus(prev => ({ ...prev, videoTrackMuted: true, videoTrackReadyState: primaryVideoTrack.readyState }));
          };
          primaryVideoTrack.onunmute = () => {
            setMediaStatus(prev => ({ ...prev, videoTrackMuted: false, videoTrackReadyState: primaryVideoTrack.readyState }));
          };
          primaryVideoTrack.onended = () => {
            setMediaStatus(prev => ({ ...prev, videoTrackReadyState: primaryVideoTrack.readyState }));
          };
        }

        // Initialize WebRTC manager
        webrtcManagerRef.current = new WebRTCManager(
          handleRemoteStreamAdded,
          handleRemoteStreamRemoved,
          handleConnectionStateChanged
        );
        await webrtcManagerRef.current.setLocalStream(stream);

        // Join meeting once per page load
        const result = await joinMeetingMutationRef.current.mutateAsync({
          meetingId,
          displayName: preferredDisplayName,
        });

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        if (!result.participantId) {
          throw new Error("Meeting join returned an invalid participant ID");
        }

        setParticipantId(result.participantId);
        setParticipantCount(1);

        // Initialize WebSocket for signaling
        initializeSignaling(result.participantId, preferredDisplayName, localAudioEnabled, localVideoEnabled);

        setIsLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error("Failed to initialize meeting:", error);
        toast.error("Failed to join meeting. Please try again.");
        setIsLoading(false);
        setLocation("/");
      } finally {
        initializationStartedRef.current = false;
      }
    };

    initializationStartedRef.current = true;
    void initializeMeeting();

    return () => {
      cancelled = true;
    };
  }, [
    meetingId,
    participantId,
    setLocation,
    attachLocalPreview,
    startAudioMeter,
    initializeSignaling,
    handleRemoteStreamAdded,
    handleRemoteStreamRemoved,
    handleConnectionStateChanged,
  ]);

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      webrtcManagerRef.current?.closeAll();
      wsRef.current?.close();
      audioMeterCleanupRef.current?.();
      audioMeterCleanupRef.current = null;
    };
  }, []);

  // Toggle audio
  const toggleAudio = async () => {
    if (localStream) {
      const newState = !audioEnabled;
      localStream.getAudioTracks().forEach(track => {
        track.enabled = newState;
      });
      setAudioEnabled(newState);
      setMediaStatus(prev => ({
        ...prev,
        audioTrackEnabled: localStream.getAudioTracks().some(track => track.enabled),
      }));
      broadcastMediaState(newState, videoEnabled);

      if (participantId) {
        try {
          await updateAudioMutation.mutateAsync({
            participantId,
            enabled: newState,
          });
        } catch (error) {
          console.error("Failed to update audio state:", error);
          toast.error("We couldn't sync your microphone state.");
        }
      }
    }
  };

  // Toggle video
  const toggleVideo = async () => {
    if (localStream) {
      const newState = !videoEnabled;
      localStream.getVideoTracks().forEach(track => {
        track.enabled = newState;
      });
      setVideoEnabled(newState);
      setMediaStatus(prev => ({
        ...prev,
        videoTrackEnabled: localStream.getVideoTracks().some(track => track.enabled),
        videoTrackMuted: localStream.getVideoTracks()[0]?.muted ?? prev.videoTrackMuted,
        videoTrackReadyState: localStream.getVideoTracks()[0]?.readyState ?? prev.videoTrackReadyState,
      }));
      void attachLocalPreview(localStream);
      broadcastMediaState(audioEnabled, newState);

      if (participantId) {
        try {
          await updateVideoMutation.mutateAsync({
            participantId,
            enabled: newState,
          });
        } catch (error) {
          console.error("Failed to update video state:", error);
          toast.error("We couldn't sync your camera state.");
        }
      }
    }
  };

  // Leave meeting
  const handleLeaveMeeting = async () => {
    try {
      if (participantId) {
        await leaveMeetingMutation.mutateAsync({
          participantId,
        });
      }

      setShowLeaveDialog(false);

      // Close all peer connections
      webrtcManagerRef.current?.closeAll();

      // Close WebSocket
      wsRef.current?.close();

      // Stop all tracks
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      setLocation("/");
    } catch (error) {
      console.error("Error leaving meeting:", error);
      setLocation("/");
    }
  };

  // Copy meeting ID
  const copyMeetingId = () => {
    navigator.clipboard.writeText(meetingId!);
    setCopiedMeetingId(true);
    toast.success("Meeting ID copied");
    setTimeout(() => setCopiedMeetingId(false), 2000);
  };

  if (!meetingId || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 mb-4">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
          <p className="text-white font-medium">Setting up your meeting...</p>
          <p className="text-slate-400 text-sm mt-2">Initializing camera and microphone</p>
        </div>
      </div>
    );
  }

  const totalParticipants = Math.max(participantCount, participants.length + 1);
  const remoteStreamsByParticipantId = new Map(remoteStreams.map(remote => [remote.participantId, remote]));

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm px-4 py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <h1 className="text-white font-semibold">Meeting Room</h1>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">
              {totalParticipants} {totalParticipants === 1 ? "participant" : "participants"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-400">
              ID: <code className="text-slate-200 font-mono text-xs">{meetingId}</code>
            </div>
            <button
              onClick={copyMeetingId}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Copy meeting ID"
            >
              {copiedMeetingId ? (
                <Check className="w-5 h-5 text-green-400" />
              ) : (
                <Copy className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 flex flex-col">
          {showWhiteboard && (
            <div className="h-[60%] flex flex-col bg-white m-4 rounded-xl overflow-hidden shadow-2xl z-10 border border-slate-700">
              <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-slate-50">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-600" />
                  Collaborative Whiteboard
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowWhiteboard(false)}
                  className="text-slate-500 hover:text-slate-900"
                >
                  Close
                </Button>
              </div>
              <div className="flex-1 min-h-0">
                <Whiteboard
                  participantId={participantId || 0}
                  socket={wsRef.current}
                />
              </div>
            </div>
          )}
          <div className={`${showWhiteboard ? "h-[40%]" : "flex-1"} overflow-auto p-4 bg-slate-950 transition-all duration-300`}>
            <div className={`grid ${showWhiteboard ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"} gap-4 auto-rows-max`}>
              {/* Local Video */}
              <Card className="border border-slate-700 bg-slate-800 overflow-hidden relative group aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={() => {
                    void localVideoRef.current?.play?.();
                  }}
                  className="w-full h-full object-cover bg-slate-900"
                  style={{ transform: "scaleX(-1)" }}
                />
                {!mediaStatus.hasVideoTrack && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-300 text-sm">
                    Camera not available
                  </div>
                )}
                {mediaStatus.hasVideoTrack && !mediaStatus.videoTrackEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-slate-300 text-sm">
                    Camera is off
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-sm font-medium">{displayName}</p>
                  <p className="text-slate-300 text-xs">You</p>
                  <p className="text-slate-400 text-[11px] mt-1">
                    Cam: {mediaStatus.hasVideoTrack ? (mediaStatus.videoTrackEnabled ? "on" : "off") : "missing"} | Mic: {mediaStatus.hasAudioTrack ? (mediaStatus.audioTrackEnabled ? "on" : "off") : "missing"}
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Video track: {mediaStatus.videoTrackReadyState}{mediaStatus.videoTrackMuted ? " / muted" : ""}
                  </p>
                  {mediaStatus.videoTrackLabel && (
                    <p className="text-slate-400 text-[11px] truncate">
                      Camera device: {mediaStatus.videoTrackLabel}
                    </p>
                  )}
                  {mediaStatus.audioTrackLabel && (
                    <p className="text-slate-400 text-[11px] truncate">
                      Mic device: {mediaStatus.audioTrackLabel}
                    </p>
                  )}
                  <div className="mt-2">
                    <div className="h-1.5 w-24 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 transition-all"
                        style={{ width: `${mediaStatus.audioTrackEnabled ? mediaStatus.audioLevel : 0}%` }}
                      />
                    </div>
                    <p className="text-slate-400 text-[11px] mt-1">Mic activity</p>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {!audioEnabled && (
                      <span className="text-xs bg-red-500/80 text-white px-2 py-1 rounded flex items-center gap-1">
                        <MicOff className="w-3 h-3" /> Muted
                      </span>
                    )}
                    {!videoEnabled && (
                      <span className="text-xs bg-red-500/80 text-white px-2 py-1 rounded flex items-center gap-1">
                        <VideoOff className="w-3 h-3" /> Camera Off
                      </span>
                    )}
                  </div>
                </div>
              </Card>

              {/* Remote Videos */}
              {participants.map(participant => {
                const remoteStream = remoteStreamsByParticipantId.get(participant.id);
                const shouldShowRemoteVideo = participant.videoEnabled && Boolean(remoteStream);

                return (
                  <Card
                    key={participant.id}
                    className="border border-slate-700 bg-slate-800 overflow-hidden relative group aspect-video"
                  >
                    <video
                      autoPlay
                      playsInline
                      className={`w-full h-full object-cover bg-slate-900 ${shouldShowRemoteVideo ? "opacity-100" : "opacity-0"}`}
                      onLoadedMetadata={(event) => {
                        void event.currentTarget.play().catch(error => {
                          console.warn("Remote video autoplay was blocked:", error);
                        });
                      }}
                      ref={element => {
                        if (!element) {
                          return;
                        }

                        const nextStream = remoteStream?.stream ?? null;
                        if (element.srcObject !== nextStream) {
                          element.srcObject = nextStream;
                        }
                      }}
                    />
                    {!remoteStream && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-300 text-sm">
                        {getConnectionLabel(participant.connectionState)}
                      </div>
                    )}
                    {remoteStream && !participant.videoEnabled && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-slate-300 text-sm">
                        Camera is off
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white text-sm font-medium">{participant.displayName}</p>
                      <p className="text-slate-300 text-xs">{getConnectionLabel(participant.connectionState)}</p>
                      <div className="flex gap-2 mt-2">
                        {!participant.audioEnabled && (
                          <span className="text-xs bg-red-500/80 text-white px-2 py-1 rounded flex items-center gap-1">
                            <MicOff className="w-3 h-3" /> Muted
                          </span>
                        )}
                        {!participant.videoEnabled && (
                          <span className="text-xs bg-red-500/80 text-white px-2 py-1 rounded flex items-center gap-1">
                            <VideoOff className="w-3 h-3" /> Camera Off
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Control Bar */}
          <div className="border-t border-slate-700 bg-slate-800/50 backdrop-blur-sm px-4 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-4">
              <Button
                onClick={toggleAudio}
                variant={audioEnabled ? "default" : "destructive"}
                size="lg"
                className="rounded-full w-14 h-14 p-0 flex items-center justify-center"
                title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                {audioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </Button>

              <Button
                onClick={toggleVideo}
                variant={videoEnabled ? "default" : "destructive"}
                size="lg"
                className="rounded-full w-14 h-14 p-0 flex items-center justify-center"
                title={videoEnabled ? "Turn off camera" : "Turn on camera"}
              >
                {videoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
              </Button>

              <Button
                onClick={() => setShowWhiteboard(!showWhiteboard)}
                variant={showWhiteboard ? "default" : "outline"}
                size="lg"
                className={`rounded-full w-14 h-14 p-0 flex items-center justify-center ${showWhiteboard ? "bg-blue-600 hover:bg-blue-700 border-blue-600" : "bg-white/10 hover:bg-white/20 border-white/20"}`}
                title="Whiteboard"
              >
                <Edit3 className="w-6 h-6 text-white" />
              </Button>

              <Button
                onClick={() => setShowLeaveDialog(true)}
                variant="destructive"
                size="lg"
                className="rounded-full w-14 h-14 p-0 flex items-center justify-center"
                title="Leave meeting"
              >
                <Phone className="w-6 h-6" />
              </Button>
            </div>
          </div>
        </div>

        {/* Participants Sidebar */}
        <div className="w-72 border-l border-slate-700 bg-slate-800/50 flex flex-col hidden lg:flex">
          <div className="border-b border-slate-700 px-4 py-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h2 className="text-white font-semibold">Participants</h2>
            <span className="ml-auto text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">
              {totalParticipants}
            </span>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {/* Local participant */}
            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3 hover:bg-slate-700/70 transition-colors">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-slate-400 text-xs">You</p>
              <div className="flex gap-2 mt-2">
                {audioEnabled ? (
                  <Mic className="w-4 h-4 text-green-400" />
                ) : (
                  <MicOff className="w-4 h-4 text-red-400" />
                )}
                {videoEnabled ? (
                  <Video className="w-4 h-4 text-green-400" />
                ) : (
                  <VideoOff className="w-4 h-4 text-red-400" />
                )}
              </div>
            </div>

            {/* Remote participants */}
            {participants.map(participant => (
              <div key={participant.id} className="bg-slate-700/50 border border-slate-600 rounded-lg p-3 hover:bg-slate-700/70 transition-colors">
                <p className="text-white text-sm font-medium truncate">{participant.displayName}</p>
                <p className="text-slate-400 text-xs mt-1">{getConnectionLabel(participant.connectionState)}</p>
                <div className="flex gap-2 mt-2">
                  {participant.audioEnabled ? (
                    <Mic className="w-4 h-4 text-green-400" />
                  ) : (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                  {participant.videoEnabled ? (
                    <Video className="w-4 h-4 text-green-400" />
                  ) : (
                    <VideoOff className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Leave Meeting Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Meeting?</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave this meeting? You can rejoin later with the meeting ID.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowLeaveDialog(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeaveMeeting}
              className="flex-1"
            >
              Leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
