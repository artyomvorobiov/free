import { router, useLocalSearchParams } from 'expo-router';
import { Check, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header, Input } from '@/components/ui/Controls';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { addMembers, createGroup, errorText, searchUsers } from '@/lib/api';
import { DEMO } from '@/lib/config';
import { DEMO_PEOPLE } from '@/lib/demo';
import type { ProfileLite } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { toast } from '@/store/ui';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const EMOJI = ['💬', '🏔', '🎉', '🏠', '💼', '🎮', '📚', '⚽️', '🎵', '❤️', '🍕', '✈️'];

export default function NewGroup() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.userId);
  const chats = useChats((s) => s.byId);
  const existing = add ? chats[add] : undefined;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [picked, setPicked] = useState<ProfileLite[]>([]);
  const [step, setStep] = useState<'members' | 'details'>('members');
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('💬');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().replace(/^@/, '').length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => searchUsers(q).then(setResults).catch(() => {}), 300);
    return () => clearTimeout(id);
  }, [q]);

  const recent: ProfileLite[] = [];
  const seen = new Set<string>();
  for (const c of Object.values(chats).sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))) {
    for (const m of c.members) {
      if (m.id !== me && !seen.has(m.id)) {
        seen.add(m.id);
        recent.push(m);
      }
    }
  }
  const base = q.trim().length >= 2 ? results : recent.length ? recent : DEMO ? DEMO_PEOPLE : [];
  const list = base.filter((p) => !existing?.members.some((m) => m.id === p.id));

  const toggle = (p: ProfileLite) =>
    setPicked((x) => (x.some((y) => y.id === p.id) ? x.filter((y) => y.id !== p.id) : [...x, p]));

  const submit = async () => {
    setBusy(true);
    try {
      if (existing) {
        await addMembers(existing.id, picked.map((p) => p.id));
        toast('Участники добавлены', 'success');
        router.back();
      } else {
        const id = await createGroup(title.trim(), emoji, picked.map((p) => p.id));
        router.replace({ pathname: '/chat/[id]', params: { id } });
      }
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'details' && !existing) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header title="Новая группа" onBack={() => setStep('members')} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center' }}>
            <Avatar id={title || 'group'} name={title} emoji={emoji} size={96} />
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Название группы"
            placeholderTextColor={t.textTertiary}
            autoFocus
            maxLength={64}
            style={[styles.title, { color: t.text, backgroundColor: t.surface2 }]}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {EMOJI.map((e) => (
              <Tap key={e} haptics onPress={() => setEmoji(e)} style={[styles.emoji, { backgroundColor: emoji === e ? t.accentSoft : t.surface }]}>
                <T style={{ fontSize: 24 }}>{e}</T>
              </Tap>
            ))}
          </View>
          <T v="caption" tone="secondary" center>
            Участники: {picked.map((p) => p.display_name).join(', ') || 'только вы'}
          </T>
        </ScrollView>
        <View style={{ padding: 20, paddingBottom: insets.bottom + 16 }}>
          <Button title="Создать группу" onPress={submit} loading={busy} disabled={!title.trim()} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={existing ? 'Добавить участников' : 'Новая группа'} subtitle={picked.length ? `выбрано: ${picked.length}` : 'выберите участников'} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
        <Input icon={Search} value={q} onChangeText={setQ} placeholder="Имя или @username" autoCapitalize="none" />
      </View>
      {picked.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }} style={{ flexGrow: 0 }}>
          {picked.map((p) => (
            <Tap key={p.id} onPress={() => toggle(p)} style={[styles.pill, { backgroundColor: t.surface }]}>
              <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={24} />
              <T v="caption">{p.display_name}</T>
              <Icon icon={X} size={14} color={t.textSecondary} />
            </Tap>
          ))}
        </ScrollView>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const on = picked.some((p) => p.id === item.id);
          return (
            <Tap scale={0.99} onPress={() => toggle(item)} style={styles.row}>
              <Avatar id={item.id} name={item.display_name} url={item.avatar_url} size={46} />
              <View style={{ flex: 1 }}>
                <T v="bodySemi">{item.display_name}</T>
                <T v="caption" tone="secondary">
                  @{item.username}
                </T>
              </View>
              <View style={[styles.check, { borderColor: on ? t.accent : t.surface3, backgroundColor: on ? t.accent : 'transparent' }]}>
                {on ? <Icon icon={Check} size={16} color={t.onAccent} strokeWidth={3} /> : null}
              </View>
            </Tap>
          );
        }}
        ListEmptyComponent={
          <T v="callout" tone="secondary" center style={{ padding: 30 }}>
            Найдите людей по @username
          </T>
        }
      />
      <View style={{ padding: 16, paddingBottom: insets.bottom + 12 }}>
        <Button
          title={existing ? 'Добавить' : 'Далее'}
          disabled={existing ? !picked.length : false}
          loading={busy}
          onPress={() => (existing ? submit() : setStep('details'))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 8 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 999 },
  title: { borderRadius: 18, padding: 16, fontFamily: fonts.semibold, fontSize: 18, textAlign: 'center' },
  emoji: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
