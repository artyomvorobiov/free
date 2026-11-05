/**
 * Звук во время звонка: рингтон, гудки, громкая связь, датчик приближения.
 * На телефоне — react-native-incall-manager (правильная аудиосессия «как у звонка»),
 * в Expo Go и демо — обычный плеер.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { NativeModules, Vibration } from 'react-native';

type ICM = typeof import('react-native-incall-manager').default;
let icm: ICM | null | undefined;
function incall(): ICM | null {
  if (icm === undefined) {
    try {
      icm = NativeModules.InCallManager ? (require('react-native-incall-manager').default as ICM) : null;
    } catch {
      icm = null;
    }
  }
  return icm;
}

const RINGTONE = require('../../../assets/sounds/incallmanager_ringtone.mp3');
const RINGBACK = require('../../../assets/sounds/incallmanager_ringback.mp3');
const BUSY = require('../../../assets/sounds/incallmanager_busytone.mp3');

let fallback: AudioPlayer | null = null;
function playFallback(src: number, loop: boolean) {
  stopFallback();
  try {
    fallback = createAudioPlayer(src);
    fallback.loop = loop;
    fallback.play();
  } catch {
    fallback = null;
  }
}
function stopFallback() {
  try {
    fallback?.pause();
    fallback?.remove();
  } catch {}
  fallback = null;
}

const safe = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.warn('callAudio', e);
  }
};

export const callAudio = {
  /** Аудиосессия звонка; для исходящего — сразу «длинные гудки» */
  startSession(video: boolean, ringback: boolean) {
    const m = incall();
    if (m) safe(() => m.start({ media: video ? 'video' : 'audio', auto: true, ringback: ringback ? '_BUNDLE_' : '' }));
    else if (ringback) playFallback(RINGBACK, true);
  },
  stopRingback() {
    const m = incall();
    if (m) safe(() => m.stopRingback());
    stopFallback();
  },
  /** Конец звонка; «занято» — короткие гудки */
  stopSession(busy: boolean) {
    const m = incall();
    stopFallback();
    if (m) safe(() => m.stop({ busytone: busy ? '_BUNDLE_' : '' }));
    else if (busy) playFallback(BUSY, false);
  },
  startRingtone() {
    const m = incall();
    if (m) safe(() => m.startRingtone('_BUNDLE_', [0, 900, 1100], 'default', 45));
    else {
      playFallback(RINGTONE, true);
      safe(() => Vibration.vibrate([0, 900, 1100], true));
    }
  },
  stopRingtone() {
    const m = incall();
    if (m) safe(() => m.stopRingtone());
    stopFallback();
    safe(() => Vibration.cancel());
  },
  setSpeaker(on: boolean) {
    const m = incall();
    if (m) safe(() => m.setForceSpeakerphoneOn(on));
  },
  hasNativeAudio() {
    return !!incall();
  },
};
