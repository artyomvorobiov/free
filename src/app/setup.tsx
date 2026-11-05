import { AtSign, Camera } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Controls';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText, isUsernameAvailable, updateProfile } from '@/lib/api';
import { afterReady, signOut } from '@/lib/auth';
import { pickAvatar, uploadAvatar } from '@/lib/media';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/useTheme';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function SetupScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, profile, email } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? (email ? email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') : ''));
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url ?? null);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvailable(null);
    if (!USERNAME_RE.test(username)) return;
    const id = setTimeout(() => {
      isUsernameAvailable(username).then(setAvailable).catch(() => setAvailable(null));
    }, 350);
    return () => clearTimeout(id);
  }, [username]);

  const valid = name.trim().length >= 1 && USERNAME_RE.test(username) && available !== false;

  const submit = async () => {
    if (!userId || !valid) return;
    setBusy(true);
    setError(null);
    try {
      let avatar_url = avatar;
      if (localAvatar) avatar_url = await uploadAvatar(userId, localAvatar);
      await updateProfile({ display_name: name.trim(), username, avatar_url });
      useAuth.getState().set({ status: 'ready' });
      await afterReady();
    } catch (e) {
      const msg = errorText(e);
      setError(/duplicate|23505|unique/i.test(msg) ? 'Этот @username уже занят' : msg);
    } finally {
      setBusy(false);
    }
  };

  const hint = !username
    ? 'Латиница, цифры и _ — от 3 символов'
    : !USERNAME_RE.test(username)
      ? 'Только a–z, 0–9 и _, от 3 до 24 символов'
      : available === null
        ? 'Проверяем…'
        : available
          ? 'Свободно ✓'
          : 'Уже занято';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <T v="title">Давайте знакомиться</T>
        <T v="body" tone="secondary" style={{ marginTop: 8 }}>
          Друзья найдут вас по @username — номер телефона не нужен.
        </T>

        <Tap
          onPress={async () => {
            const img = await pickAvatar();
            if (img) setLocalAvatar(img.uri);
          }}
          style={{ alignSelf: 'center', marginVertical: 32 }}
        >
          <Avatar id={userId ?? 'me'} name={name || '?'} url={localAvatar ?? avatar} size={112} />
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: t.accent,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 3,
              borderColor: t.bg,
            }}
          >
            <Icon icon={Camera} size={18} color={t.onAccent} />
          </View>
        </Tap>

        <T v="tiny" tone="secondary" style={{ marginBottom: 6, marginLeft: 4, textTransform: 'uppercase' }}>
          Имя
        </T>
        <Input value={name} onChangeText={setName} placeholder="Как вас называть" maxLength={64} autoFocus />
        <T v="tiny" tone="secondary" style={{ marginBottom: 6, marginLeft: 4, marginTop: 18, textTransform: 'uppercase' }}>
          Username
        </T>
        <Input
          icon={AtSign}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={24}
        />
        <T
          v="caption"
          tone={available === false || (username && !USERNAME_RE.test(username)) ? 'danger' : available ? 'accent' : 'secondary'}
          style={{ marginTop: 8, marginLeft: 4 }}
        >
          {hint}
        </T>
        {error ? (
          <T v="caption" tone="danger" style={{ marginTop: 12 }}>
            {error}
          </T>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <Button title="Готово" onPress={submit} loading={busy} disabled={!valid} />
        <Tap onPress={() => signOut()} style={{ alignSelf: 'center', padding: 6 }}>
          <T v="caption" tone="secondary">
            Выйти
          </T>
        </Tap>
      </View>
    </KeyboardAvoidingView>
  );
}
