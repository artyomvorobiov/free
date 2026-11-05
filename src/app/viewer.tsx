import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { IconButton } from '@/components/ui/Button';
import { T } from '@/components/ui/T';
import { markViewOnceOpened } from '@/lib/api';
import { DEMO } from '@/lib/config';
import { signedUrl } from '@/lib/media';
import { formatTime } from '@/lib/time';
import { useAuth } from '@/store/auth';
import { useMessages } from '@/store/messages';

/** Полноэкранный просмотр фото и одноразовых медиа */
export default function Viewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.userId);
  const msg = useMessages((s) => s.find(String(id)));
  const [url, setUrl] = useState<string | null>(msg?._localUri ?? null);
  const [failed, setFailed] = useState(false);
  const opened = useRef(false);
  const y = useSharedValue(0);
  const once = !!msg?.view_once && msg.sender_id !== me;

  useEffect(() => {
    if (!msg || url) return;
    if (DEMO || !msg.media_path) {
      setFailed(true);
      return;
    }
    signedUrl(msg.media_path, { short: once }).then((u) => (u ? setUrl(u) : setFailed(true)));
  }, [msg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // одноразовое: отмечаем просмотр, как только файл получен
    if (once && url && msg && !opened.current) {
      opened.current = true;
      markViewOnceOpened(msg);
    }
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const player = useVideoPlayer(msg?.kind === 'circle' && url ? { uri: url } : null, (p) => {
    p.loop = !once;
    p.play();
  });

  const close = () => router.back();

  const pan = usePanGesture({
    activeOffsetY: [-9999, 12],
    onUpdate: (e) => {
      'worklet';
      y.value = Math.max(0, e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120) scheduleOnRN(close);
      else y.value = withTiming(0);
    },
  });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 1 - Math.min(0.6, y.value / 500) }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, style]}>
          {url ? (
            msg?.kind === 'circle' ? (
              <View style={styles.circle}>
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
              </View>
            ) : (
              <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="contain" />
            )
          ) : failed ? (
            <T v="body" color="#fff" center style={{ paddingHorizontal: 40 }}>
              {once ? 'Это одноразовое медиа уже просмотрено' : 'Не удалось загрузить файл'}
            </T>
          ) : (
            <ActivityIndicator color="#fff" />
          )}
        </Animated.View>
      </GestureDetector>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton icon={X} color="#fff" bg="rgba(255,255,255,0.14)" label="Закрыть" onPress={close} />
        {msg ? (
          <T v="caption" color="rgba(255,255,255,0.8)">
            {once ? 'Одноразовое · закроется навсегда' : formatTime(msg.created_at)}
          </T>
        ) : null}
        <View style={{ width: 40 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  circle: { width: 320, height: 320, borderRadius: 160, overflow: 'hidden' },
});
