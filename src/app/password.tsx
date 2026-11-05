import { KeyRound, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Header, Input } from '@/components/ui/Controls';
import { T } from '@/components/ui/T';
import { errorText } from '@/lib/api';
import { signInWithPassword } from '@/lib/auth';
import { useTheme } from '@/theme/useTheme';

/**
 * Вход по паролю. Обычным пользователям он не нужен — пригодится
 * для тестового аккаунта, который вы дадите проверяющим App Store.
 */
export default function PasswordScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch (e) {
      setError(/invalid/i.test(String((e as Error).message)) ? 'Неверный email или пароль' : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12, gap: 12 }}>
        <T v="title">Вход с паролем</T>
        <T v="body" tone="secondary" style={{ marginBottom: 16 }}>
          Для аккаунтов, созданных администратором (например, для проверки в App Store).
        </T>
        <Input
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Input icon={KeyRound} value={password} onChangeText={setPassword} placeholder="Пароль" secureTextEntry />
        {error ? (
          <T v="caption" tone="danger">
            {error}
          </T>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16 }}>
        <Button title="Войти" onPress={submit} loading={busy} disabled={!email || password.length < 6} />
      </View>
    </KeyboardAvoidingView>
  );
}
