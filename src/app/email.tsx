import { router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Header, Input } from '@/components/ui/Controls';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText } from '@/lib/api';
import { requestCode } from '@/lib/auth';
import { useTheme } from '@/theme/useTheme';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export default function EmailScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isEmail(email)) return;
    setBusy(true);
    setError(null);
    try {
      await requestCode(email);
      router.push({ pathname: '/code', params: { email: email.trim().toLowerCase() } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12 }}>
        <T v="title">Ваш email</T>
        <T v="body" tone="secondary" style={{ marginTop: 8, marginBottom: 28 }}>
          Пришлём 6-значный код. Пароль не нужен.
        </T>
        <Input
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={submit}
        />
        {error ? (
          <T v="caption" tone="danger" style={{ marginTop: 10 }}>
            {error}
          </T>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, gap: 14 }}>
        <Button title="Получить код" onPress={submit} loading={busy} disabled={!isEmail(email)} />
        <Tap onPress={() => router.push('/password')} style={{ alignSelf: 'center', padding: 6 }}>
          <T v="caption" tone="secondary">
            Войти с паролем
          </T>
        </Tap>
      </View>
    </KeyboardAvoidingView>
  );
}
