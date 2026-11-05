import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AlarmClock, Ban, Bell, BellOff, Flag, LogOut, Pencil, Phone, UserMinus, UserPlus, Video } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header, Row, Section, Segmented } from '@/components/ui/Controls';
import { ActionSheet, Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import {
  blockUser,
  cancelScheduled,
  errorText,
  isBlocked,
  leaveChat,
  listScheduled,
  removeMember,
  report,
  setChatPrefs,
  unblockUser,
  updateChat,
} from '@/lib/api';
import { startCall } from '@/lib/calls/engine';
import { chatTitle, peerOf, statusActive } from '@/lib/chat-utils';
import { confirm } from '@/lib/confirm';
import { DISAPPEAR_OPTIONS, formatLastSeen, formatMoment, formatUntil, isOnline } from '@/lib/time';
import type { Member, ScheduledMessage } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { isMuted, useChats } from '@/store/chats';
import { toast } from '@/store/ui';
import { chatThemes, fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { LinearGradient } from 'expo-linear-gradient';

const GROUP_EMOJI = ['💬', '🏔', '🎉', '🏠', '💼', '🎮', '📚', '⚽️', '🎵', '❤️', '🍕', '✈️'];

export default function ChatInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = String(id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.userId);
  const chat = useChats((s) => s.byId[chatId]);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [memberMenu, setMemberMenu] = useState<Member | null>(null);
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState(chat?.title ?? '');
  const [reportOpen, setReportOpen] = useState(false);

  const peer = chat ? peerOf(chat, me) : undefined;

  useFocusEffect(
    useCallback(() => {
      listScheduled(chatId).then(setScheduled).catch(() => {});
      if (peer) isBlocked(peer.id).then(setBlocked).catch(() => {});
    }, [chatId, peer?.id]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!chat) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const isOwner = chat.members.find((m) => m.id === me)?.role === 'owner';
  const muted = isMuted(chat);

  const safe = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={chat.kind === 'group' ? 'Группа' : chat.kind === 'self' ? 'Заметки' : 'Профиль'} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <Avatar
            id={peer?.id ?? chat.id}
            name={chatTitle(chat, me)}
            url={peer?.avatar_url}
            emoji={chat.kind === 'group' ? chat.emoji : null}
            self={chat.kind === 'self'}
            size={104}
            online={!!peer && isOnline(peer.last_seen_at)}
          />
          <Tap disabled={chat.kind !== 'group'} onPress={() => setRename(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <T v="h2" center>
              {chatTitle(chat, me)}
            </T>
            {chat.kind === 'group' ? <Pencil size={16} color={t.textTertiary} /> : null}
          </Tap>
          {peer ? (
            <T v="callout" tone="secondary" style={{ marginTop: 4 }}>
              {peer.username ? '@' + peer.username + ' · ' : ''}
              {formatLastSeen(peer.last_seen_at)}
            </T>
          ) : null}
          {peer && statusActive(peer) ? (
            <View style={[styles.status, { backgroundColor: t.surface }]}>
              <T v="callout">
                {peer.status_emoji} {peer.status_text} {peer.status_until ? formatUntil(peer.status_until) : ''}
              </T>
            </View>
          ) : null}
          {peer?.bio ? (
            <T v="callout" center style={{ marginTop: 10, paddingHorizontal: 40 }}>
              {peer.bio}
            </T>
          ) : null}
          {chat.kind === 'direct' && peer && !blocked ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Button title="Позвонить" icon={Phone} size="md" kind="secondary" onPress={() => startCall(chatId, false)} />
              <Button title="Видео" icon={Video} size="md" kind="secondary" onPress={() => startCall(chatId, true)} />
            </View>
          ) : null}
        </View>

        <Section title="Тема чата" footer={chat.kind === 'self' ? undefined : 'Тема общая: собеседник увидит её тоже'}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 14 }}>
            {chatThemes.map((th) => {
              const active = chat.theme === th.id;
              return (
                <Tap key={th.id} haptics onPress={() => safe(() => updateChat(chatId, { theme: th.id }))} style={{ alignItems: 'center', gap: 6 }}>
                  <LinearGradient
                    colors={th.colors ?? [t.accent, t.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.swatch, active && { borderWidth: 3, borderColor: t.text }]}
                  >
                    <T style={{ fontSize: 20 }}>{th.emoji}</T>
                  </LinearGradient>
                  <T v="tiny" tone={active ? 'primary' : 'secondary'}>
                    {th.name}
                  </T>
                </Tap>
              );
            })}
          </ScrollView>
        </Section>

        {chat.kind !== 'self' ? (
          <Section title="Исчезающие сообщения" footer="Новые сообщения будут удаляться у всех через выбранное время после отправки.">
            <View style={{ padding: 10 }}>
              <Segmented
                options={DISAPPEAR_OPTIONS.map((o) => ({ label: o.short, value: o.seconds }))}
                value={chat.disappear_seconds}
                onChange={(v) => safe(() => updateChat(chatId, { disappear_seconds: v }))}
              />
            </View>
          </Section>
        ) : null}

        <Section>
          {chat.kind !== 'self' ? (
            <Row
              icon={muted ? Bell : BellOff}
              label={muted ? 'Включить уведомления' : 'Без звука'}
              onSwitch={(v) => safe(() => setChatPrefs(chatId, { muted_until: v ? 'infinity' : null }))}
              switchValue={muted}
              hint={muted ? 'Уведомления не приходят' : undefined}
            />
          ) : null}
          <Row icon={AlarmClock} label="Отложенные сообщения" value={scheduled.length ? String(scheduled.length) : 'нет'} last />
          {scheduled.map((s) => (
            <View key={s.id} style={[styles.scheduled, { borderTopColor: t.hairline }]}>
              <View style={{ flex: 1 }}>
                <T v="callout" numberOfLines={2}>
                  {s.body}
                </T>
                <T v="small" tone="secondary">
                  {formatMoment(s.send_at)}
                </T>
              </View>
              <Button
                title="Отменить"
                kind="danger"
                size="sm"
                onPress={() =>
                  safe(async () => {
                    await cancelScheduled(s.id);
                    setScheduled((x) => x.filter((y) => y.id !== s.id));
                  })
                }
              />
            </View>
          ))}
        </Section>

        {chat.kind === 'group' ? (
          <Section title={`Участники · ${chat.members.length}`}>
            <Row icon={UserPlus} label="Добавить участников" onPress={() => router.push({ pathname: '/new-group', params: { add: chatId } })} />
            {chat.members.map((m, i) => (
              <Tap
                key={m.id}
                scale={0.99}
                onPress={() => (m.id === me ? null : setMemberMenu(m))}
                style={[styles.member, i < chat.members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hairline }]}
              >
                <Avatar id={m.id} name={m.display_name} url={m.avatar_url} size={40} online={isOnline(m.last_seen_at)} />
                <View style={{ flex: 1 }}>
                  <T v="bodyMedium">{m.id === me ? 'Вы' : m.display_name}</T>
                  <T v="small" tone="secondary">
                    {m.username ? '@' + m.username : ''}
                  </T>
                </View>
                {m.role === 'owner' ? (
                  <T v="small" tone="accent">
                    создатель
                  </T>
                ) : null}
              </Tap>
            ))}
          </Section>
        ) : null}

        {chat.kind === 'direct' && peer ? (
          <Section>
            <Row
              icon={Ban}
              label={blocked ? 'Разблокировать' : 'Заблокировать'}
              danger={!blocked}
              onPress={() =>
                safe(async () => {
                  if (blocked) {
                    await unblockUser(peer.id);
                    setBlocked(false);
                    toast('Пользователь разблокирован', 'success');
                  } else if (await confirm('Заблокировать?', `${peer.display_name} не сможет писать вам, а вы — ему.`, 'Заблокировать')) {
                    await blockUser(peer.id);
                    setBlocked(true);
                    toast('Пользователь заблокирован', 'success');
                  }
                })
              }
            />
            <Row icon={Flag} label="Пожаловаться" danger onPress={() => setReportOpen(true)} last />
          </Section>
        ) : null}

        {chat.kind === 'group' ? (
          <Section>
            <Row
              icon={LogOut}
              label="Покинуть группу"
              danger
              last
              onPress={() =>
                safe(async () => {
                  if (await confirm('Покинуть группу?', 'Вы перестанете получать сообщения из этой группы.', 'Покинуть')) {
                    await leaveChat(chatId);
                    router.dismissAll();
                  }
                })
              }
            />
          </Section>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={!!memberMenu}
        onClose={() => setMemberMenu(null)}
        title={memberMenu?.display_name}
        actions={
          memberMenu
            ? [
                { label: 'Профиль', emoji: '👤', onPress: () => router.push({ pathname: '/user/[id]', params: { id: memberMenu.id } }) },
                ...(isOwner
                  ? [{ label: 'Исключить из группы', icon: UserMinus, danger: true, onPress: () => safe(() => removeMember(chatId, memberMenu.id)) }]
                  : []),
              ]
            : []
        }
      />

      <ActionSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Пожаловаться"
        subtitle="Жалобу увидит только администратор сервиса"
        actions={['Спам', 'Оскорбления', 'Мошенничество', 'Выдаёт себя за другого'].map((reason) => ({
          label: reason,
          onPress: () =>
            safe(async () => {
              await report(peer?.id ?? null, null, reason);
              toast('Спасибо, жалоба отправлена', 'success');
            }),
        }))}
      />

      <Sheet visible={rename} onClose={() => setRename(false)} title="Название группы">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            maxLength={64}
            placeholderTextColor={t.textTertiary}
            style={[styles.input, { backgroundColor: t.surface2, color: t.text }]}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GROUP_EMOJI.map((e) => (
              <Tap
                key={e}
                haptics
                onPress={() => safe(() => updateChat(chatId, { emoji: e }))}
                style={[styles.emoji, { backgroundColor: chat.emoji === e ? t.accentSoft : t.surface2 }]}
              >
                <T style={{ fontSize: 22 }}>{e}</T>
              </Tap>
            ))}
          </View>
          <Button
            title="Сохранить"
            disabled={!title.trim()}
            onPress={() =>
              safe(async () => {
                await updateChat(chatId, { title: title.trim() });
                setRename(false);
              })
            }
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  swatch: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scheduled: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  input: { borderRadius: 16, padding: 14, fontFamily: fonts.regular, fontSize: 16 },
  emoji: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
