import { router, useFocusEffect } from 'expo-router';
import { AlarmClock, BellOff, Bell, ChevronDown, ChevronUp, Pin, PinOff, Plus, Search, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatRow } from '@/components/list/ChatRow';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, Input } from '@/components/ui/Controls';
import { Icon } from '@/components/ui/Icon';
import { MomentSheet } from '@/components/ui/MomentSheet';
import { ActionSheet, type SheetAction } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { errorText, loadChats, markRead, setChatPrefs } from '@/lib/api';
import { chatTitle, preview, statusActive } from '@/lib/chat-utils';
import { DEMO } from '@/lib/config';
import { cancelSnoozeReminder, scheduleSnoozeReminder, setBadge } from '@/lib/notifications';
import { formatMoment, formatUntil } from '@/lib/time';
import type { Chat } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { isMuted, isSnoozed, sortChats, useChats, waitingSince } from '@/store/chats';
import { toast } from '@/store/ui';
import { useTheme } from '@/theme/useTheme';

type Filter = 'all' | 'unread' | 'waiting' | 'groups';

export default function ChatList() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.userId);
  const profile = useAuth((s) => s.profile);
  const byId = useChats((s) => s.byId);
  const loaded = useChats((s) => s.loaded);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [menuFor, setMenuFor] = useState<Chat | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<Chat | null>(null);
  const [, setTick] = useState(0);

  // раз в минуту обновляем «ждёт ответа» и возвращаем отложенные чаты
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setTick((x) => x + 1), 60_000);
      return () => clearInterval(id);
    }, []),
  );

  const all = useMemo(() => sortChats(Object.values(byId).filter((c) => !c.archived)), [byId]);
  const snoozed = all.filter(isSnoozed);
  const active = all.filter((c) => !isSnoozed(c));
  const waitingCount = active.filter((c) => waitingSince(c, me) && !c.unread).length;
  const unreadCount = active.filter((c) => c.unread > 0).length;
  const totalUnread = all.reduce((n, c) => n + (isMuted(c) ? 0 : c.unread), 0);
  useEffect(() => {
    setBadge(totalUnread);
  }, [totalUnread]);

  const q = query.trim().toLowerCase();
  const visible = active.filter((c) => {
    if (q) {
      const hay = (chatTitle(c, me) + ' ' + preview(c.last_message, c, me)).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === 'unread') return c.unread > 0;
    if (filter === 'waiting') return !!waitingSince(c, me) && !c.unread;
    if (filter === 'groups') return c.kind === 'group';
    return true;
  });

  const open = useCallback((c: Chat) => router.push({ pathname: '/chat/[id]', params: { id: c.id } }), []);

  const toggleMute = useCallback(async (c: Chat) => {
    try {
      const muted = isMuted(c);
      await setChatPrefs(c.id, { muted_until: muted ? null : 'infinity' });
      toast(muted ? 'Звук включён' : 'Чат без звука', 'info', muted ? '🔔' : '🔕');
    } catch (e) {
      toast(errorText(e), 'error');
    }
  }, []);

  const togglePin = useCallback(async (c: Chat) => {
    try {
      await setChatPrefs(c.id, { pinned_at: c.pinned_at ? null : new Date().toISOString() });
    } catch (e) {
      toast(errorText(e), 'error');
    }
  }, []);

  const snooze = async (c: Chat, d: Date) => {
    try {
      await setChatPrefs(c.id, { snoozed_until: d.toISOString() });
      markRead(c.id);
      await scheduleSnoozeReminder(c.id, chatTitle(c, me), d);
      toast(`Напомним ${formatMoment(d)}`, 'success', '⏰');
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  const unsnooze = async (c: Chat) => {
    await setChatPrefs(c.id, { snoozed_until: null }).catch(() => {});
    cancelSnoozeReminder(c.id);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChats().catch((e) => toast(errorText(e), 'error'));
    setRefreshing(false);
  };

  const menu: SheetAction[] = menuFor
    ? [
        ...(menuFor.kind !== 'self'
          ? [
              isSnoozed(menuFor)
                ? { label: 'Вернуть сейчас', icon: AlarmClock, onPress: () => unsnooze(menuFor) }
                : { label: 'Ответить позже', icon: AlarmClock, hint: 'Чат исчезнет и вернётся с напоминанием', onPress: () => setSnoozeFor(menuFor) },
            ]
          : []),
        {
          label: menuFor.pinned_at ? 'Открепить' : 'Закрепить',
          icon: menuFor.pinned_at ? PinOff : Pin,
          onPress: () => togglePin(menuFor),
        },
        {
          label: isMuted(menuFor) ? 'Включить звук' : 'Без звука',
          icon: isMuted(menuFor) ? Bell : BellOff,
          onPress: () => toggleMute(menuFor),
        },
        ...(menuFor.unread ? [{ label: 'Отметить прочитанным', emoji: '✓', onPress: () => markRead(menuFor.id) }] : []),
      ]
    : [];

  const myStatus = profile && statusActive(profile) ? profile : null;

  const header = (
    <View>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={{ flex: 1 }}>
          <T v="title">Чаты</T>
          <Tap onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <T v="caption" tone={myStatus ? 'primary' : 'tertiary'}>
              {myStatus
                ? `${myStatus.status_emoji ?? ''} ${myStatus.status_text ?? ''} ${myStatus.status_until ? formatUntil(myStatus.status_until) : ''}`.trim()
                : '＋ поставить статус'}
            </T>
          </Tap>
        </View>
        <IconButton icon={Plus} bg={t.surface} size={42} label="Новый чат" onPress={() => router.push('/new')} />
        <Tap onPress={() => router.push('/settings')} accessibilityLabel="Настройки">
          <Avatar id={me ?? 'me'} name={profile?.display_name} url={profile?.avatar_url} size={42} />
        </Tap>
      </View>

      {DEMO ? (
        <View style={[styles.demo, { backgroundColor: t.accentSoft }]}>
          <T v="caption" tone="accent">
            Демо-режим · данные хранятся только на этом устройстве
          </T>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Input icon={Search} value={query} onChangeText={setQuery} placeholder="Поиск" returnKeyType="search" clearButtonMode="while-editing" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Все" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Непрочитанные" count={unreadCount} active={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label="Ждут ответа" emoji="⏳" count={waitingCount} active={filter === 'waiting'} onPress={() => setFilter('waiting')} />
        <Chip label="Группы" active={filter === 'groups'} onPress={() => setFilter('groups')} />
      </ScrollView>

      {snoozed.length && !q ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
          <Tap
            onPress={() => setShowSnoozed((v) => !v)}
            style={[styles.snoozedBar, { backgroundColor: t.surface }]}
            haptics
          >
            <Icon icon={AlarmClock} size={18} color="#7C6CFF" />
            <T v="bodyMedium" style={{ flex: 1 }}>
              Отложенные
            </T>
            <T v="caption" tone="secondary">
              {snoozed.length}
            </T>
            <Icon icon={showSnoozed ? ChevronUp : ChevronDown} size={18} color={t.textTertiary} />
          </Tap>
          {showSnoozed
            ? snoozed.map((c) => (
                <Animated.View key={c.id} entering={FadeIn}>
                  <ChatRow
                    chat={c}
                    me={me}
                    onOpen={open}
                    onLongPress={setMenuFor}
                    onSnooze={setSnoozeFor}
                    onToggleMute={toggleMute}
                    onTogglePin={togglePin}
                  />
                </Animated.View>
              ))
            : null}
        </View>
      ) : null}

      {q ? (
        <Tap
          onPress={() => router.push({ pathname: '/new', params: { q: query } })}
          style={[styles.findPeople, { borderColor: t.hairline }]}
        >
          <Icon icon={UserPlus} size={18} color={t.accent} />
          <T v="bodyMedium" tone="accent">
            Найти людей: «{query.trim()}»
          </T>
        </Tap>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={DEMO ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textTertiary} />}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            me={me}
            onOpen={open}
            onLongPress={setMenuFor}
            onSnooze={setSnoozeFor}
            onToggleMute={toggleMute}
            onTogglePin={togglePin}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <T style={{ fontSize: 52, lineHeight: 60 }}>{filter === 'waiting' ? '🌿' : filter === 'unread' ? '✨' : '👋'}</T>
              <T v="h2" center style={{ marginTop: 12 }}>
                {filter === 'waiting' ? 'Все ответы отправлены' : filter === 'unread' ? 'Всё прочитано' : q ? 'Ничего не найдено' : 'Пока тихо'}
              </T>
              <T v="callout" tone="secondary" center style={{ marginTop: 6, marginBottom: 20 }}>
                {filter === 'all' && !q ? 'Найдите друга по @username и напишите первым' : 'Можно выдохнуть'}
              </T>
              {filter === 'all' && !q ? <Button title="Найти друзей" icon={UserPlus} size="md" onPress={() => router.push('/new')} /> : null}
            </View>
          ) : undefined
        }
      />

      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? chatTitle(menuFor, me) : ''} actions={menu} />
      <MomentSheet
        visible={!!snoozeFor}
        onClose={() => setSnoozeFor(null)}
        kind="snooze"
        title="Ответить позже"
        subtitle="Чат спрячется и вернётся наверх с напоминанием. Новое сообщение вернёт его сразу."
        onPick={(d) => snoozeFor && snooze(snoozeFor, d)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  demo: { marginHorizontal: 16, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center' },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  snoozedBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16 },
  findPeople: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 },
});
