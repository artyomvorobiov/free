/**
 * WebRTC на телефоне (react-native-webrtc).
 * Модуль подключается лениво: в Expo Go нативной части нет — там звонки недоступны,
 * а всё остальное приложение продолжает работать.
 */
import { NativeModules } from 'react-native';

import type { IceServer, PeerLike, StreamLike, TrackLike } from './types';

type Lib = typeof import('react-native-webrtc');
let lib: Lib | null | undefined;

export function webrtcLib(): Lib | null {
  if (lib === undefined) {
    try {
      lib = NativeModules.WebRTCModule ? (require('react-native-webrtc') as Lib) : null;
    } catch {
      lib = null;
    }
  }
  return lib;
}

export function rtcAvailable() {
  return !!NativeModules.WebRTCModule;
}

export async function getLocalStream(video: boolean, facing: 'user' | 'environment' = 'user'): Promise<StreamLike> {
  const l = webrtcLib();
  if (!l) throw new Error('webrtc-unavailable');
  const stream = await l.mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: facing, width: 640, height: 480, frameRate: 30 } : false,
  });
  return stream as unknown as StreamLike;
}

export function createPeer(iceServers: IceServer[]): PeerLike {
  const l = webrtcLib();
  if (!l) throw new Error('webrtc-unavailable');
  return new l.RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' }) as unknown as PeerLike;
}

export function switchCamera(track: TrackLike | undefined) {
  track?._switchCamera?.();
}
