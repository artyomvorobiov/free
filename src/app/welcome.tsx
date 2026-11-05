import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { T } from '@/components/ui/T';
import { enterDemo } from '@/lib/auth';
import { DEMO } from '@/lib/config';
import { radius } from '@/theme/tokens';
import { hexToRgba, useTheme } from '@/theme/useTheme';

const FEATURES = [
  { emoji: '💌', title: 'Капсулы времени', text: 'Послание, которое откроется в нужный день' },
  { emoji: '⏰', title: 'Ответить позже', text: 'Отложите чат — он вернётся с напоминанием' },
  { emoji: '💗', title: 'Касания', text: 'Скажите «я рядом» без слов — вибрацией' },
];

function Orb({ color, size, x, y, delay }: { color: string; size: number; x: number; y: number; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => {
      p.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, delay);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x + p.value * 24 }, { translateY: y - p.value * 30 }, { scale: 1 + p.value * 0.08 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, style]}>
      <LinearGradient
        colors={[hexToRgba(color, 0.55), hexToRgba(color, 0)]}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
        style={{ flex: 1, borderRadius: size / 2 }}
      />
    </Animated.View>
  );
}

export default function Welcome() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Orb color={t.accent} size={360} x={-120} y={-60} delay={0} />
      <Orb color="#FF4D8D" size={280} x={180} y={140} delay={600} />
      <Orb color="#6F5BFF" size={240} x={-40} y={380} delay={1200} />

      <View style={{ flex: 1, paddingTop: insets.top + 56, paddingHorizontal: 24 }}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <T v="hero" style={{ fontSize: 58, lineHeight: 62 }}>
            близко
          </T>
          <T v="h3" tone="secondary" style={{ marginTop: 10, fontSize: 19, lineHeight: 26 }}>
            Мессенджер, который не торопит.{'\n'}Только люди, которые важны.
          </T>
        </Animated.View>

        <View style={{ marginTop: 40, gap: 10 }}>
          {FEATURES.map((f, i) => (
            <Animated.View key={f.title} entering={FadeInDown.delay(200 + i * 120).duration(500)}>
              <View style={[styles.card, { backgroundColor: hexToRgba(t.surface, t.scheme === 'dark' ? 0.75 : 0.82), borderColor: t.hairline }]}>
                <T style={{ fontSize: 28, lineHeight: 34 }}>{f.emoji}</T>
                <View style={{ flex: 1 }}>
                  <T v="bodySemi">{f.title}</T>
                  <T v="caption" tone="secondary" style={{ marginTop: 2 }}>
                    {f.text}
                  </T>
                </View>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>

      <Animated.View
        entering={FadeInDown.delay(650).duration(500)}
        style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20, gap: 12 }}
      >
        {DEMO ? (
          <>
            <Button
              title="Открыть демо"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                await enterDemo();
              }}
            />
            <T v="caption" tone="secondary" center>
              Сервер ещё не подключён — вы увидите приложение с тестовыми чатами.{'\n'}Как подключить свой сервер, написано в README.
            </T>
          </>
        ) : (
          <>
            <Button title="Войти по email" onPress={() => router.push('/email')} />
            <T v="caption" tone="secondary" center>
              Без номера телефона и паролей — только код из письма
            </T>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
