import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '@/components/ui/Controls';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText } from '@/lib/api';
import { requestCode, verifyCode } from '@/lib/auth';
import { OTP_LENGTH } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { fonts, radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function CodeScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const input = useRef<TextInputInstance>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(60);
  const shake = useSharedValue(0);

  useEffect(() => {
    const id = setInterval(() => setLeft((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const submit = async (value: string) => {
    if (busy || value.length !== OTP_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(String(email), value);
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(/expired|invalid/i.test(String((e as Error).message)) ? 'Неверный или устаревший код' : errorText(e));
      shake.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12 }}>
        <T v="title">Код из письма</T>
        <T v="body" tone="secondary" style={{ marginTop: 8, marginBottom: 32 }}>
          Отправили на {email}. Проверьте «Спам», если письма нет.
        </T>
        <Pressable onPress={() => input.current?.focus()}>
          <Animated.View style={[styles.boxes, shakeStyle]}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => {
              const ch = code[i];
              const focused = i === code.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.box,
                    { backgroundColor: t.surface, borderColor: focused ? t.accent : ch ? t.surface3 : t.hairline },
                  ]}
                >
                  <T style={{ fontFamily: fonts.displaySemi, fontSize: 26, lineHeight: 32 }}>{ch ?? ''}</T>
                </View>
              );
            })}
          </Animated.View>
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, OTP_LENGTH);
            setCode(digits);
            if (digits.length === OTP_LENGTH) submit(digits);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          maxLength={OTP_LENGTH}
          style={styles.hidden}
        />
        {error ? (
          <T v="caption" tone="danger" style={{ marginTop: 14 }}>
            {error}
          </T>
        ) : null}
        {busy ? (
          <T v="caption" tone="secondary" style={{ marginTop: 14 }}>
            Проверяем…
          </T>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Tap onPress={() => router.back()} style={{ padding: 6 }}>
          <T v="caption" tone="secondary">
            Изменить email
          </T>
        </Tap>
        <Tap
          disabled={left > 0}
          onPress={async () => {
            try {
              await requestCode(String(email));
              setLeft(60);
            } catch (e) {
              setError(errorText(e));
            }
          }}
          style={{ padding: 6 }}
        >
          <T v="caption" tone={left > 0 ? 'tertiary' : 'accent'}>
            {left > 0 ? `Отправить ещё раз через ${left} с` : 'Отправить код ещё раз'}
          </T>
        </Tap>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  box: { flex: 1, aspectRatio: 0.82, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', maxWidth: 58 },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
