import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Lock, SwitchCamera, Trash, ArrowUp, ChevronLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { haptic } from '@/lib/haptics';
import { formatDuration } from '@/lib/time';
import { toast } from '@/store/ui';
import { useTheme } from '@/theme/useTheme';

export const MAX_VOICE_SEC = 300;
export const MAX_CIRCLE_SEC = 60;

export type VoiceResult = { uri: string; duration: number; waveform: number[] };

const norm = (db: number | undefined) => {
  if (db === undefined || Number.isNaN(db)) return 0.15;
  return Math.max(0.08, Math.min(1, (db + 55) / 55));
};

function downsample(src: number[], n: number) {
  if (!src.length) return Array.from({ length: n }, () => 0.2);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i / n) * src.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / n) * src.length));
    const slice = src.slice(from, to);
    out.push(Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100);
  }
  return out;
}

/** Запись голосового: громкость микрофона превращается в «волну» */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 80);
  const samples = useRef<number[]>([]);
  const active = useRef(false);

  useEffect(() => {
    if (state.isRecording) samples.current.push(norm(state.metering));
  }, [state.durationMillis]); // eslint-disable-line react-hooks/exhaustive-deps

  /** true — запись началась; false — пришлось спросить разрешение */
  const start = async (): Promise<boolean> => {
    const perm = await getRecordingPermissionsAsync();
    if (!perm.granted) {
      const res = await requestRecordingPermissionsAsync();
      if (res.granted) toast('Готово! Теперь удерживайте кнопку, чтобы записать', 'info', '🎤');
      else toast('Разрешите доступ к микрофону в Настройках iPhone', 'error');
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    samples.current = [];
    await recorder.prepareToRecordAsync();
    recorder.record();
    active.current = true;
    haptic.medium();
    return true;
  };

  const stop = async (keep: boolean): Promise<VoiceResult | null> => {
    if (!active.current) return null;
    active.current = false;
    const duration = recorder.getStatus().durationMillis / 1000;
    try {
      await recorder.stop();
    } catch {}
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!keep || !uri) return null;
    if (duration < 0.8) {
      toast('Удерживайте кнопку, чтобы записать голосовое', 'info', '🎤');
      return null;
    }
    return { uri, duration, waveform: downsample(samples.current, 48) };
  };

  return { state, start, stop, live: samples };
}

/** Живая «волна» во время записи */
export function LiveWave({ samples, color }: { samples: number[]; color: string }) {
  const last = samples.slice(-28);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 26, flex: 1, overflow: 'hidden', justifyContent: 'flex-end' }}>
      {last.map((v, i) => (
        <View key={i} style={{ width: 3, height: 3 + v * 22, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function RecDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.25, { duration: 600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' }, style]} />;
}

const ACircle = Animated.createAnimatedComponent(Circle);

type CircleProps = {
  visible: boolean;
  locked: boolean;
  /** вызывается, когда запись готова (или null при отмене) */
  onResult: (r: { uri: string; duration: number } | null) => void;
  /** сигнал остановки: 'send' | 'cancel' */
  stopSignal: 'send' | 'cancel' | null;
  onSend: () => void;
  onCancel: () => void;
};

/** Запись «кружочка» с фронтальной камеры */
export function CircleRecorder({ visible, locked, onResult, stopSignal, onSend, onCancel }: CircleProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.8, 340);
  const cam = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const finished = useRef(false);
  const decision = useRef<'send' | 'cancel' | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      setRecording(false);
      setElapsed(0);
      progress.value = 0;
      finished.current = false;
      decision.current = null;
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!stopSignal) return;
    decision.current = stopSignal;
    if (recording) cam.current?.stopRecording();
    else if (!finished.current) {
      // камера ещё не успела начать запись
      finished.current = true;
      onResult(null);
    }
  }, [stopSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 200);
    return () => clearInterval(id);
  }, [recording]);

  const begin = async () => {
    if (!cam.current || recording || decision.current) return;
    setRecording(true);
    startedAt.current = Date.now();
    progress.value = 0;
    progress.value = withTiming(1, { duration: MAX_CIRCLE_SEC * 1000, easing: Easing.linear });
    haptic.medium();
    try {
      const res = await cam.current.recordAsync({ maxDuration: MAX_CIRCLE_SEC });
      const duration = (Date.now() - startedAt.current) / 1000;
      if (finished.current) return;
      finished.current = true;
      const keep = decision.current !== 'cancel';
      if (res?.uri && keep && duration >= 1) onResult({ uri: res.uri, duration });
      else {
        if (keep && duration < 1) toast('Удерживайте кнопку, чтобы записать кружок', 'info', '⭕');
        onResult(null);
      }
    } catch (e) {
      if (!finished.current) {
        finished.current = true;
        toast('Не удалось записать видео', 'error');
        onResult(null);
      }
    } finally {
      setRecording(false);
    }
  };

  const r = size / 2 + 8;
  const circ = 2 * Math.PI * r;
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - progress.value) }));

  if (!visible) return null;
  return (
    <Animated.View entering={FadeIn.duration(160)} style={[styles.overlay, { bottom: locked ? 0 : insets.bottom + 64 }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.84)' }]} />
      <View style={[styles.circleWrap, { paddingTop: insets.top + 40 }]}>
        <Animated.View entering={FadeIn.duration(200)} style={{ width: size + 24, height: size + 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#111' }}>
            <CameraView
              ref={cam}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode="video"
              videoQuality="480p"
              mirror={facing === 'front'}
              onCameraReady={() => {
                setTimeout(begin, Platform.OS === 'ios' ? 150 : 300);
              }}
              onMountError={() => {
                toast('Камера недоступна', 'error');
                onResult(null);
              }}
            />
          </View>
          <Svg width={size + 24} height={size + 24} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Circle cx={size / 2 + 12} cy={size / 2 + 12} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth={4} fill="none" />
            <ACircle
              cx={size / 2 + 12}
              cy={size / 2 + 12}
              r={r}
              stroke={t.accent}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ} ${circ}`}
              animatedProps={ringProps}
              transform={`rotate(-90 ${size / 2 + 12} ${size / 2 + 12})`}
            />
          </Svg>
        </Animated.View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 }}>
          {recording ? <RecDot /> : null}
          <T v="h3" color="#fff">
            {recording ? formatDuration(elapsed) : 'Готовим камеру…'}
          </T>
        </View>
        {!locked ? (
          <View style={{ alignItems: 'center', marginTop: 18, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon icon={ArrowUp} size={16} color="rgba(255,255,255,0.7)" />
              <T v="caption" color="rgba(255,255,255,0.7)">
                вверх — запись без рук
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon icon={ChevronLeft} size={16} color="rgba(255,255,255,0.7)" />
              <T v="caption" color="rgba(255,255,255,0.7)">
                влево — отмена · отпустите, чтобы отправить
              </T>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 28, marginTop: 28, alignItems: 'center' }}>
            <IconButton icon={Trash} size={56} bg="rgba(255,255,255,0.14)" color="#fff" label="Отмена" onPress={onCancel} />
            <IconButton icon={SwitchCamera} size={56} bg="rgba(255,255,255,0.14)" color="#fff" label="Сменить камеру" onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} />
            <IconButton icon={ArrowUp} size={64} bg={t.accent} color={t.onAccent} iconSize={26} label="Отправить" onPress={onSend} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export function useCirclePermissions() {
  const [cam, requestCam] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const ensure = async (): Promise<boolean> => {
    if (cam?.granted && mic?.granted) return true;
    const c = cam?.granted ? cam : await requestCam();
    const m = mic?.granted ? mic : await requestMic();
    if (c.granted && m.granted) {
      toast('Готово! Удерживайте кнопку, чтобы записать кружок', 'info', '⭕');
    } else {
      toast('Разрешите доступ к камере и микрофону в Настройках', 'error');
    }
    return false;
  };
  return { granted: !!cam?.granted && !!mic?.granted, ensure };
}

export function LockHint({ visible, locked }: { visible: boolean; locked: boolean }) {
  const t = useTheme();
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  if (!visible || locked) return null;
  return (
    <Animated.View style={[styles.lock, { backgroundColor: t.surface }, style]}>
      <Icon icon={Lock} size={16} color={t.textSecondary} />
      <Icon icon={ArrowUp} size={14} color={t.textTertiary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, elevation: 50 },
  circleWrap: { flex: 1, alignItems: 'center' },
  lock: {
    position: 'absolute',
    right: 14,
    bottom: 78,
    width: 40,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
