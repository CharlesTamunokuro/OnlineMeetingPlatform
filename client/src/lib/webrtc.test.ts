import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebRTCManager, getIceServers } from "./webrtc";

describe("WebRTCManager", () => {
  let manager: WebRTCManager;
  let mockStream: MediaStream;

  beforeEach(() => {
    manager = new WebRTCManager();
    
    // Mock MediaStream
    mockStream = {
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;
  });

  it("should create a WebRTCManager instance", () => {
    expect(manager).toBeDefined();
  });

  it("should set local stream", async () => {
    await manager.setLocalStream(mockStream);
    expect(manager).toBeDefined();
  });

  it("should return empty stats on initialization", () => {
    const stats = manager.getStats();
    expect(stats.peerConnectionCount).toBe(0);
    expect(stats.remoteStreamCount).toBe(0);
  });

  it("should close all connections", () => {
    manager.closeAll();
    const stats = manager.getStats();
    expect(stats.peerConnectionCount).toBe(0);
    expect(stats.remoteStreamCount).toBe(0);
  });

  it("should handle remote stream callbacks", async () => {
    const onRemoteStreamAdded = vi.fn();
    const onRemoteStreamRemoved = vi.fn();
    
    const managerWithCallbacks = new WebRTCManager(
      onRemoteStreamAdded,
      onRemoteStreamRemoved
    );

    expect(managerWithCallbacks).toBeDefined();
  });

  it("should get all remote streams", () => {
    const streams = manager.getAllRemoteStreams();
    expect(Array.isArray(streams)).toBe(true);
    expect(streams.length).toBe(0);
  });

  it("should build ICE servers from environment config", () => {
    const iceServers = getIceServers({
      VITE_STUN_SERVERS: "stun:one.example.com:3478, stun:two.example.com:3478",
      VITE_TURN_URLS: "turn:turn.example.com:3478",
      VITE_TURN_USERNAME: "demo-user",
      VITE_TURN_CREDENTIAL: "demo-pass",
    });

    expect(iceServers).toEqual([
      {
        urls: ["stun:one.example.com:3478", "stun:two.example.com:3478"],
      },
      {
        urls: ["turn:turn.example.com:3478"],
        username: "demo-user",
        credential: "demo-pass",
      },
    ]);
  });
});
