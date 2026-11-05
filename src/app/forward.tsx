import { router, useLocalSearchParams } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Header, Input } from '@/components/ui/Controls';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText, forwardMessage } from '@/lib/api';
import { chatTitle, memberName, peerOf } from '@/lib/chat-utils';
import { useAuth } from '@/store/auth';
import { sortChats, useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { toast } from '@/store/ui';
import { useTheme } from '@/theme/useTheme';

export default function Forward() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.userId);
  const byId = useChats((s) => s.byId);
  const msg = useMessages((s) => s.find(String(id)));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const chats = useMemo(() => sortChats(Object.values(byId)), [byId]);
  const visible = chats.filter((c) => chatTitle(c, me).toLowerCase().includes(q.trim().toLowerCase()));

  const send = async (chatId: string) => {
    if (!msg || busy) return;
    setBusy(true);
    try {
      const from = memberName(byId[msg.chat_id], msg.sender_id, me);
      await forwardMessage(msg, chatId, from === 'Вы' ? useAuth.getState().profile?.display_name ?? 'Вы' : from);
      toast('Переслано', 'success', '↪');
      router.back();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Переслать в…" />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Input icon={Search} value={q} onChangeText={setQ} placeholder="Поиск чата" />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        renderItem={({ item }) => {
          const peer = peerOf(item, me);
          return (
            <Tap scale={0.99} disabled={busy} onPress={() => send(item.id)} style={styles.row}>
              <Avatar
                id={peer?.id ?? item.id}
                name={chatTitle(item, me)}
                url={peer?.avatar_url}
                emoji={item.kind === 'group' ? item.emoji : null}
                self={item.kind === 'self'}
                size={46}
              />
              <T v="bodySemi" style={{ flex: 1 }}>
                {chatTitle(item, me)}
              </T>
            </Tap>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 9 },
});
