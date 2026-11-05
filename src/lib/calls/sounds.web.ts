import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const RINGTONE = require('../../../assets/sounds/incallmanager_ringtone.mp3');
const RINGBACK = require('../../../assets/sounds/incallmanager_ringback.mp3');
const BUSY = require('../../../assets/sounds/incallmanager_busytone.mp3');

let player: AudioPlayer | null = null;
function play(src: number, loop: boolean) {
  stop();
  try {
    player = createAudioPlayer(src);
    player.loop = loop;
    player.play();
  } catch {
    player = null;
  }
}
function stop() {
  try {
    player?.pause();
    player?.remove();
  } catch {}
  player = null;
}

export const callAudio = {
  startSession(_video: boolean, ringback: boolean) {
    if (ringback) play(RINGBACK, true);
  },
  stopRingback: stop,
  stopSession(busy: boolean) {
    stop();
    if (busy) play(BUSY, false);
  },
  startRingtone() {
    play(RINGTONE, true);
  },
  stopRingtone: stop,
  setSpeaker(_on: boolean) {},
  hasNativeAudio() {
    return false;
  },
};
