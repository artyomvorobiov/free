import { create } from 'zustand';

import type { StreamLike } from '@/lib/calls/types';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';
export type CallEndReason = 'ended' | 'declined' | 'missed' | 'canceled' | 'busy' | 'failed' | 'unavailable';

export type CallPeer = { id: string; name: string; avatar: string | null };

type CallState = {
  phase: CallPhase;
  callId: string | null;
  chatId: string | null;
  peer: CallPeer | null;
  direction: 'out' | 'in';
  video: boolean;
  demo: boolean;
  muted: boolean;
  speaker: boolean;
  cameraOff: boolean;
  facing: 'user' | 'environment';
  remoteMuted: boolean;
  remoteCameraOff: boolean;
  localStream: StreamLike | null;
  remoteStream: StreamLike | null;
  /** растёт при каждом новом треке — чтобы видео перерисовалось */
  remoteVersion: number;
  startedAt: number | null;
  endedAt: number | null;
  reconnecting: boolean;
  endReason: CallEndReason | null;
  set: (patch: Partial<Omit<CallState, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const initial = {
  phase: 'idle' as CallPhase,
  callId: null,
  chatId: null,
  peer: null,
  direction: 'out' as const,
  video: false,
  demo: false,
  muted: false,
  speaker: false,
  cameraOff: false,
  facing: 'user' as const,
  remoteMuted: false,
  remoteCameraOff: false,
  localStream: null,
  remoteStream: null,
  remoteVersion: 0,
  startedAt: null,
  endedAt: null,
  reconnecting: false,
  endReason: null,
};

export const useCall = create<CallState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set({ ...initial }),
}));
