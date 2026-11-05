import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TOUCHES } from '@/lib/haptics';
import type { TouchKind } from '@/lib/types';
import { useUi } from '@/store/ui';
import { radius, shadow } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { Glass } from './Glass';
import { T } from './T';
import { Tap } from './Tap';

/** Всплывающие уведомления внутри приложения */
export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const drop = useUi((s) => s.dropToast);
  const insets = useSafeAreaInsets();
  const t = useTheme();
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 6, alignItems: 'center' }]}>
      {toasts.map((x) => (
        <Animated.View
          key={x.id}
          entering={FadeInUp.springify().damping(16)}
          exiting={FadeOutUp.duration(180)}
          layout={LinearTransition}
          style={{ marginBottom: 8, maxWidth: 420, width: '92%' }}
        >
          <Tap onPress={() => drop(x.id)} scale={0.98}>
            <Glass style={[styles.toast, shadow, { borderColor: t.hairline }]}>
              {x.emoji ? <T v="h3">{x.emoji}</T> : null}
              <View
                style={[
                  styles.dot,
                  { backgroundColor: x.kind === 'error' ? t.danger : x.kind === 'success' ? t.success : t.accent },
                  x.emoji ? { display: 'none' } : null,
                ]}
              />
              <T v="callout" numberOfLines={2} style={{ flex: 1 }}>
                {x.text}
              </T>
            </Glass>
          </Tap>
        </Animated.View>
      ))}
    </View>
  );
}

/** Большая анимация входящего «касания» */
export function TouchOverlay() {
  const touch = useUi((s) => s.touch);
  const clear = useUi((s) => s.showTouch);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (!touch) return;
    scale.value = 0.3;
    opacity.value = 0;
    ring.value = 0;
    opacity.value = withSequence(withTiming(1, { duration: 200 }), withDelay(2200, withTiming(0, { duration: 400 })));
    scale.value = withSequence(
      withTiming(1.1, { duration: 260, easing: Easing.out(Easing.back(2)) }),
      withRepeat(withSequence(withTiming(1.22, { duration: 140 }), withTiming(1, { duration: 420 })), 3, false),
    );
    ring.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), 3, false);
    const id = setTimeout(() => clear(null), 2900);
    return () => clearTimeout(id);
  }, [touch?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const emojiStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + ring.value * 1.6 }],
    opacity: (1 - ring.value) * 0.5 * opacity.value,
  }));

  if (!touch) return null;
  const meta = TOUCHES[touch.kind as TouchKind] ?? TOUCHES.heart;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={[styles.center, emojiStyle]}>
        <T style={{ fontSize: 96, lineHeight: 112 }}>{meta.emoji}</T>
        <View style={styles.touchLabel}>
          <T v="bodySemi" color="#fff" center>
            {touch.from} {meta.verb}
          </T>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: '#FF5E7E' },
  touchLabel: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
});
