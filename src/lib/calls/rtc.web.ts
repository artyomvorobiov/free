/** WebRTC в браузере (веб-версия используется для проверки и демо). */
import type { IceServer, PeerLike, StreamLike, TrackLike } from './types';

export function webrtcLib() {
  return null;
}

export function rtcAvailable() {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function' && !!navigator.mediaDevices?.getUserMedia;
}

export async function getLocalStream(video: boolean, facing: 'user' | 'environment' = 'user'): Promise<StreamLike> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } : false,
  });
  return stream as unknown as StreamLike;
}

export function createPeer(iceServers: IceServer[]): PeerLike {
  return new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' }) as unknown as PeerLike;
}

export function switchCamera(_track: TrackLike | undefined) {
  // в браузере обычно одна камера
}
