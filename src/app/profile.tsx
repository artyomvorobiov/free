import { AtSign, Camera } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header, Input } from '@/components/ui/Controls';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText, isUsernameAvailable, updateProfile } from '@/lib/api';
import { DEMO } from '@/lib/config';
import { pickAvatar, uploadAvatar } from '@/lib/media';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const RE = /^[a-z0-9_]{3,24}$/;

export default function EditProfile() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useAuth((s) => s.profile)!;
  const [name, setName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [local, setLocal] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (username === profile.username) {
      setAvailable(true);
      return;
    }
    setAvailable(null);
    if (!RE.test(username)) return;
    const id = setTimeout(() => isUsernameAvailable(username).then(setAvailable), 350);
    return () => clearTimeout(id);
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      let avatar_url = profile.avatar_url;
      if (local) avatar_url = DEMO ? local : await uploadAvatar(profile.id, local);
      await updateProfile({ display_name: name.trim(), username, bio: bio.trim(), avatar_url });
      toast('Профиль сохранён', 'success');
      router.back();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const valid = name.trim().length > 0 && RE.test(username) && available !== false;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Профиль" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }} keyboardShouldPersistTaps="handled">
        <Tap
          onPress={async () => {
            const img = await pickAvatar();
            if (img) setLocal(img.uri);
          }}
          style={{ alignSelf: 'center', marginBottom: 18 }}
        >
          <Avatar id={profile.id} name={name} url={local ?? profile.avatar_url} size={110} />
          <View style={[styles.cam, { backgroundColor: t.accent, borderColor: t.bg }]}>
            <Icon icon={Camera} size={17} color={t.onAccent} />
          </View>
        </Tap>
        <T v="tiny" tone="secondary" style={styles.label}>
          Имя
        </T>
        <Input value={name} onChangeText={setName} maxLength={64} />
        <T v="tiny" tone="secondary" style={styles.label}>
          Username
        </T>
        <Input icon={AtSign} value={username} onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} autoCapitalize="none" maxLength={24} />
        {available === false ? (
          <T v="caption" tone="danger">
            Уже занято
          </T>
        ) : null}
        <T v="tiny" tone="secondary" style={styles.label}>
          О себе
        </T>
        <TextInput
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={300}
          placeholder="Пара слов о себе"
          placeholderTextColor={t.textTertiary}
          style={[styles.bio, { backgroundColor: t.surface2, color: t.text }]}
        />
      </ScrollView>
      <View style={{ padding: 20, paddingBottom: insets.bottom + 12 }}>
        <Button title="Сохранить" onPress={save} loading={busy} disabled={!valid} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cam: { position: 'absolute', right: -4, bottom: -4, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  label: { textTransform: 'uppercase', marginLeft: 4, marginTop: 12 },
  bio: { minHeight: 90, borderRadius: 16, padding: 14, fontFamily: fonts.regular, fontSize: 16, textAlignVertical: 'top' },
});
