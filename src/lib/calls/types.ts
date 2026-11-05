export type CallStatus = 'ringing' | 'accepted' | 'ended' | 'declined' | 'missed' | 'canceled' | 'busy' | 'failed';
export const FINAL_STATUSES: CallStatus[] = ['ended', 'declined', 'missed', 'canceled', 'busy', 'failed'];

export type SessionDescription = { type: string; sdp: string };

export type CallRow = {
  id: string;
  chat_id: string;
  caller_id: string;
  callee_id: string;
  video: boolean;
  status: CallStatus;
  offer: SessionDescription | null;
  answer: SessionDescription | null;
  created_at: string;
  answered_at: string | null;
  heartbeat_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
};

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

/*
 * Минимальные «структурные» типы WebRTC: им соответствуют и объекты браузера,
 * и объекты react-native-webrtc на телефоне.
 */
export interface TrackLike {
  readonly kind: string;
  enabled: boolean;
  stop(): void;
  _switchCamera?: () => void;
}

export interface StreamLike {
  getTracks(): TrackLike[];
  getAudioTracks(): TrackLike[];
  getVideoTracks(): TrackLike[];
  toURL?: () => string;
}

export interface PeerLike {
  readonly localDescription: { type: string; sdp: string } | null;
  readonly iceGatheringState: string;
  readonly iceConnectionState: string;
  readonly connectionState: string;
  addEventListener(type: string, listener: (e: any) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  removeEventListener(type: string, listener: (e: any) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  createOffer(options?: object): Promise<SessionDescription>;
  createAnswer(): Promise<SessionDescription>;
  setLocalDescription(description?: SessionDescription): Promise<void>;
  setRemoteDescription(description: SessionDescription): Promise<void>;
  addTrack(track: TrackLike, ...streams: StreamLike[]): unknown;
  close(): void;
}
