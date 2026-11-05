import { CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff, Volume1, Volume2, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CallVideo, RemoteAudio } from '@/components/call/CallVideo';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import {
  acceptCall,
  acceptDemo,
  declineCall,
  flipCamera,
  hangup,
  setCallScreenOpen,
  toggleCamera,
  toggleMute,
  toggleSpeaker,
} from '@/lib/calls/engine';
import { haptic } from '@/lib/haptics';
import { formatDuration } from '@/lib/time';
import { useCall, type CallEndReason } from '@/store/call';
import { fonts, gradientFor } from '@/theme/tokens';
import { hexToRgba } from '@/theme/useTheme';

const END_TEXT: Record<CallEndReason, string> = {
  ended: 'Звонок завершён',
  declined: 'Звонок отклонён',
  missed: 'Нет ответа',
  canceled: 'Звонок отменён',
  busy: 'Абонент занят',
  failed: 'Не удалось соединиться',
  unavailable: 'Звонки недоступны',
};

function Ring({ progress, offset, active }: { progress: SharedValue<number>; offset: number; active: boolean }) {
  const style = useAnimatedStyle(() => {
    const v = (progress.value + offset) % 1;
    return { transform: [{ scale: 1 + v * 0.9 }], opacity: active ? (1 - v) * 0.35 : 0 };
  });
  return <Animated.View style={[styles.ring, style]} pointerEvents="none" />;
}

function Rings({ active }: { active: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (active) p.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    else p.value = withTiming(0, { duration: 300 });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Ring progress={p} offset={0} active={active} />
      <Ring progress={p} offset={0.33} active={active} />
      <Ring progress={p} offset={0.66} active={active} />
    </>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  active,
  danger,
  success,
  size = 64,
}: {
  icon: LucideIcon;
  label?: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  success?: boolean;
  size?: number;
}) {
  const bg = danger ? '#FF3B30' : success ? '#34C759' : active ? '#FFFFFF' : 'rgba(255,255,255,0.16)';
  const fg = active && !danger && !success ? '#111111' : '#FFFFFF';
  return (
    <View style={{ alignItems: 'center', gap: 8, width: Math.max(size, 74) }}>
      <Tap haptics scale={0.9} onPress={onPress} accessibilityLabel={label} accessibilityRole="button" style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        <Icon icon={icon} size={size * 0.4} color={fg} />
      </Tap>
      {label ? (
        <T v="small" color="rgba(255,255,255,0.85)" center numberOfLines={1}>
          {label}
        </T>
      ) : null}
    </View>
  );
}

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const s = useCall();
  const [, setTick] = useState(0);

  useEffect(() => {
    setCallScreenOpen(true);
    return () => setCallScreenOpen(false);
  }, []);

  // экран закрывается сам, когда звонок полностью завершился
  useEffect(() => {
    if (s.phase === 'idle') {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, [s.phase]);

  useEffect(() => {
    if (s.phase !== 'active') return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [s.phase]);

  // Android: кнопка «Назад» не должна обрывать звонок
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => s.phase !== 'idle' && s.phase !== 'ended');
    return () => sub.remove();
  }, [s.phase]);

  const accept = useSharedValue(0);
  useEffect(() => {
    if (s.phase === 'incoming') {
      accept.value = withRepeat(withSequence(withTiming(-8, { duration: 380 }), withTiming(0, { duration: 380 })), -1, false);
    } else accept.value = withTiming(0);
  }, [s.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const acceptStyle = useAnimatedStyle(() => ({ transform: [{ translateY: accept.value }] }));

  if (s.phase === 'idle' || !s.peer) return <View style={styles.root} />;

  const elapsed = s.startedAt ? ((s.endedAt ?? Date.now()) - s.startedAt) / 1000 : 0;
  const ringing = s.phase === 'outgoing' || s.phase === 'incoming';
  const showRemoteVideo = s.video && !!s.remoteStream && !s.remoteCameraOff && s.phase === 'active';
  // пока собеседник не ответил на видеозвонок — во весь экран своя камера, как в FaceTime
  const showSelfFull = s.video && !s.cameraOff && (s.phase === 'outgoing' || s.phase === 'connecting') && (!!s.localStream || s.demo);
  const status =
    s.phase === 'outgoing'
      ? 'Вызов…'
      : s.phase === 'incoming'
        ? s.video
          ? 'Входящий видеозвонок'
          : 'Входящий звонок'
        : s.phase === 'connecting'
          ? 'Соединение…'
          : s.phase === 'active'
            ? `${formatDuration(elapsed)}${s.reconnecting ? ' · переподключение…' : ''}`
            : s.direction === 'in' && s.endReason === 'missed'
              ? 'Пропущенный звонок'
              : `${END_TEXT[s.endReason ?? 'ended']}${s.endReason === 'ended' && elapsed > 0 ? ' · ' + formatDuration(elapsed) : ''}`;
  const colors = gradientFor(s.peer.id);
  const avatarSize = s.video && s.phase === 'active' ? 96 : 148;

  return (
    <View style={styles.root} testID="call-screen">
      {showRemoteVideo ? (
        <CallVideo stream={s.remoteStream} version={s.remoteVersion} style={StyleSheet.absoluteFill} fit="cover" zOrder={0} />
      ) : showSelfFull ? (
        s.demo ? (
          Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1c1c1e' }]} />
          ) : (
            <CameraView style={StyleSheet.absoluteFill} facing={s.facing === 'user' ? 'front' : 'back'} mirror />
          )
        ) : (
          <CallVideo stream={s.localStream} mirror={s.facing === 'user'} muted style={StyleSheet.absoluteFill} fit="cover" zOrder={0} />
        )
      ) : (
        <LinearGradient
          colors={[hexToRgba(colors[0], 0.55), hexToRgba(colors[1], 0.25), '#0B0B0C']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {!s.video || !showRemoteVideo ? <RemoteAudio stream={s.remoteStream} /> : <RemoteAudio stream={null} />}
      {showRemoteVideo || showSelfFull ? (
        <>
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={styles.topShade} pointerEvents="none" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} style={styles.bottomShade} pointerEvents="none" />
        </>
      ) : null}

      <View style={{ paddingTop: insets.top + (showRemoteVideo ? 12 : 36), alignItems: 'center', paddingHorizontal: 24 }}>
        {!showRemoteVideo && !showSelfFull ? (
          <View style={{ width: avatarSize, height: avatarSize, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
            <Rings active={ringing} />
            <Avatar id={s.peer.id} name={s.peer.name} url={s.peer.avatar} size={avatarSize} />
          </View>
        ) : null}
        <T style={styles.name} numberOfLines={1}>
          {s.peer.name}
        </T>
        <T v="callout" color="rgba(255,255,255,0.78)" style={{ marginTop: 6 }} testID="call-status">
          {status}
        </T>
        {s.remoteMuted && s.phase === 'active' ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.pill}>
            <Icon icon={MicOff} size={14} color="#fff" />
            <T v="small" color="#fff">
              {s.peer.name} без микрофона
            </T>
          </Animated.View>
        ) : null}
      </View>

      {s.video && s.phase !== 'ended' && s.phase !== 'incoming' && !showSelfFull ? (
        <Animated.View entering={FadeIn} style={[styles.selfView, { top: insets.top + 12 }]}>
          {s.cameraOff ? (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#1c1c1e' }]}>
              <Icon icon={VideoOff} size={22} color="rgba(255,255,255,0.6)" />
            </View>
          ) : s.demo ? (
            Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2a2a2c' }]} />
            ) : (
              <CameraView style={StyleSheet.absoluteFill} facing={s.facing === 'user' ? 'front' : 'back'} mirror />
            )
          ) : (
            <CallVideo stream={s.localStream} mirror={s.facing === 'user'} muted style={StyleSheet.absoluteFill} zOrder={1} />
          )}
        </Animated.View>
      ) : null}

      <View style={{ flex: 1 }} />

      {s.phase === 'incoming' ? (
        <Animated.View entering={FadeInDown.duration(350)} style={[styles.incoming, { paddingBottom: insets.bottom + 40 }]}>
          <RoundButton
            icon={PhoneOff}
            label="Отклонить"
            danger
            size={76}
            onPress={() => {
              haptic.medium();
              declineCall();
            }}
          />
          <Animated.View style={acceptStyle}>
            <RoundButton
              icon={s.video ? Video : Phone}
              label="Принять"
              success
              size={76}
              onPress={() => {
                haptic.success();
                if (s.demo) acceptDemo();
                else acceptCall();
              }}
            />
          </Animated.View>
        </Animated.View>
      ) : s.phase === 'ended' ? (
        <View style={{ height: insets.bottom + 180 }} />
      ) : (
        <Animated.View entering={FadeInDown.duration(350)} style={{ paddingBottom: insets.bottom + 28, gap: 26 }}>
          <View style={styles.controls}>
            <RoundButton icon={s.muted ? MicOff : Mic} label={s.muted ? 'Без звука' : 'Микрофон'} active={s.muted} onPress={toggleMute} />
            <RoundButton icon={s.speaker ? Volume2 : Volume1} label="Динамик" active={s.speaker} onPress={toggleSpeaker} />
            {s.video ? (
              <>
                <RoundButton icon={s.cameraOff ? VideoOff : Video} label="Камера" active={s.cameraOff} onPress={toggleCamera} />
                <RoundButton icon={SwitchCamera} label="Повернуть" onPress={flipCamera} />
              </>
            ) : null}
          </View>
          <View style={{ alignItems: 'center' }}>
            <RoundButton icon={PhoneOff} label="Завершить" danger size={72} onPress={() => hangup()} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0C' },
  center: { alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: '#fff', letterSpacing: -0.6, textAlign: 'center' },
  ring: { position: 'absolute', width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#FFFFFF' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  selfView: {
    position: 'absolute',
    right: 16,
    width: 104,
    height: 150,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  incoming: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 30 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 260 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  round: { alignItems: 'center', justifyContent: 'center' },
});
