import { router, useLocalSearchParams } from 'expo-router';
import { Bookmark, Search, Share2, Users } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Header, Input } from '@/components/ui/Controls';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText, openDirect, searchUsers } from '@/lib/api';
import { statusActive } from '@/lib/chat-utils';
import { DEMO } from '@/lib/config';
import { DEMO_PEOPLE } from '@/lib/demo';
import { formatLastSeen } from '@/lib/time';
import type { ProfileLite } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { toast } from '@/store/ui';
import { useTheme } from '@/theme/useTheme';

function PersonRow({ p, onPress, right }: { p: ProfileLite; onPress: () => void; right?: ReactNode }) {
  return (
    <Tap scale={0.99} onPress={onPress} style={styles.person}>
      <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={48} />
      <View style={{ flex: 1 }}>
        <T v="bodySemi">{p.display_name || '@' + p.username}</T>
        <T v="caption" tone="secondary" numberOfLines={1}>
          @{p.username}
          {statusActive(p) ? `  ·  ${p.status_emoji ?? ''} ${p.status_text ?? ''}` : `  ·  ${formatLastSeen(p.last_seen_at)}`}
        </T>
      </View>
      {right}
    </Tap>
  );
}

export default function NewChat() {
  const params = useLocalSearchParams<{ q?: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.userId);
  const profile = useAuth((s) => s.profile);
  const chats = useChats((s) => s.byId);
  const [q, setQ] = useState(params.q ?? '');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.replace(/^@/, '').length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => {
      searchUsers(query)
        .then(setResults)
        .catch((e) => toast(errorText(e), 'error'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  // недавние собеседники — когда поиск пуст
  const recent: ProfileLite[] = Object.values(chats)
    .filter((c) => c.kind === 'direct')
    .sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))
    .map((c) => c.members.find((m) => m.id !== me))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 12);

  const open = async (p: ProfileLite) => {
    try {
      const id = await openDirect(p.id);
      router.replace({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  const selfChat = Object.values(chats).find((c) => c.kind === 'self');
  const showing = q.trim().length >= 2 ? results : DEMO && !recent.length ? DEMO_PEOPLE : recent;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Новый чат" />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Input icon={Search} value={q} onChangeText={setQ} placeholder="Имя или @username" autoFocus autoCapitalize="none" autoCorrect={false} />
      </View>
      <FlatList
        data={showing}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListHeaderComponent={
          q.trim().length < 2 ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
              <Tap onPress={() => router.replace('/new-group')} style={styles.action}>
                <View style={[styles.actionIcon, { backgroundColor: t.accent }]}>
                  <Icon icon={Users} size={20} color={t.onAccent} />
                </View>
                <T v="bodySemi">Новая группа</T>
              </Tap>
              {selfChat ? (
                <Tap onPress={() => router.replace({ pathname: '/chat/[id]', params: { id: selfChat.id } })} style={styles.action}>
                  <View style={[styles.actionIcon, { backgroundColor: t.surface2 }]}>
                    <Icon icon={Bookmark} size={20} color={t.text} />
                  </View>
                  <T v="bodySemi">Заметки</T>
                </Tap>
              ) : null}
              <Tap
                onPress={() =>
                  Share.share({
                    message: `Я в «Близко» — найди меня по @${profile?.username ?? ''}. Мессенджер, который не торопит 💌`,
                  }).catch(() => {})
                }
                style={styles.action}
              >
                <View style={[styles.actionIcon, { backgroundColor: t.surface2 }]}>
                  <Icon icon={Share2} size={20} color={t.text} />
                </View>
                <View>
                  <T v="bodySemi">Пригласить друзей</T>
                  <T v="caption" tone="secondary">
                    Ваш @{profile?.username}
                  </T>
                </View>
              </Tap>
              {showing.length ? (
                <T v="tiny" tone="secondary" style={{ textTransform: 'uppercase', margin: 8, marginTop: 18 }}>
                  {DEMO && !recent.length ? 'Люди' : 'Недавние'}
                </T>
              ) : null}
            </View>
          ) : loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={t.textTertiary} />
          ) : undefined
        }
        ListEmptyComponent={
          q.trim().length >= 2 && !loading ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <T style={{ fontSize: 44 }}>🔍</T>
              <T v="bodySemi" center style={{ marginTop: 10 }}>
                Никого не нашли
              </T>
              <T v="callout" tone="secondary" center style={{ marginTop: 4 }}>
                Проверьте @username или пригласите друга
              </T>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => <PersonRow p={item} onPress={() => open(item)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 9 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 9 },
  actionIcon: { width: 46, height: 46, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
