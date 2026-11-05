import { AlarmClock, BellOff, Bell, Pin, PinOff, Timer } from 'lucide-react-native';
import { memo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { chatTitle, peerOf, preview, statusActive } from '@/lib/chat-utils';
import { formatAge, formatChatTime, formatMoment, isOnline } from '@/lib/time';
import type { Chat } from '@/lib/types';
import { isMuted, isSnoozed, waitingSince } from '@/store/chats';
import { useDrafts } from '@/store/settings';
import { useUi } from '@/store/ui';
import { useTheme } from '@/theme/useTheme';

type Props = {
  chat: Chat;
  me: string | null;
  onOpen: (chat: Chat) => void;
  onLongPress: (chat: Chat) => void;
  onSnooze: (chat: Chat) => void;
  onToggleMute: (chat: Chat) => void;
  onTogglePin: (chat: Chat) => void;
};

function Action({ color, icon, label, onPress }: { color: string; icon: typeof Pin; label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} haptics style={[styles.action, { backgroundColor: color }]}>
      <Icon icon={icon} size={22} color="#fff" />
      <T v="tiny" color="#fff" style={{ marginTop: 4 }}>
        {label}
      </T>
    </Tap>
  );
}

export const ChatRow = memo(function ChatRow({ chat, me, onOpen, onLongPress, onSnooze, onToggleMute, onTogglePin }: Props) {
  const t = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const draft = useDrafts((s) => s.drafts[chat.id]);
  const typing = useUi((s) => s.typing[chat.id]);
  const peer = peerOf(chat, me);
  const title = chatTitle(chat, me);
  const last = chat.last_message;
  const typers = Object.keys(typing ?? {}).filter((id) => id !== me);
  const waiting = waitingSince(chat, me);
  const muted = isMuted(chat);
  const snoozed = isSnoozed(chat);
  const online = !!peer && isOnline(peer.last_seen_at);
  const status = peer && statusActive(peer) ? `${peer.status_emoji ?? ''} ${peer.status_text ?? ''}`.trim() : null;

  let line: { text: string; tone: 'secondary' | 'accent' | 'danger'; prefix?: string };
  if (typers.length) {
    const k = typing?.[typers[0]]?.kind;
    line = { text: k === 'voice' ? 'записывает голосовое…' : k === 'circle' ? 'записывает кружок…' : 'печатает…', tone: 'accent' };
  } else if (draft) {
    line = { text: draft, tone: 'danger', prefix: 'Черновик: ' };
  } else if (last) {
    const mine = last.sender_id === me && last.kind !== 'system';
    const who =
      chat.kind === 'group' && !mine && last.kind !== 'system'
        ? (chat.members.find((m) => m.id === last.sender_id)?.display_name ?? '') + ': '
        : mine && chat.kind !== 'self'
          ? 'Вы: '
          : '';
    line = { text: who + preview(last, chat, me), tone: 'secondary' };
  } else {
    line = { text: chat.kind === 'self' ? 'Сохраняйте сюда мысли, ссылки и файлы' : 'Напишите первым 👋', tone: 'secondary' };
  }

  const close = () => ref.current?.close();

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      overshootRight={false}
      overshootLeft={false}
      rightThreshold={36}
      leftThreshold={36}
      renderRightActions={() => (
        <View style={styles.actions}>
          {chat.kind !== 'self' ? (
            <Action
              color="#7C6CFF"
              icon={AlarmClock}
              label="Позже"
              onPress={() => {
                close();
                onSnooze(chat);
              }}
            />
          ) : null}
          <Action
            color={t.textSecondary}
            icon={muted ? Bell : BellOff}
            label={muted ? 'Звук' : 'Тихо'}
            onPress={() => {
              close();
              onToggleMute(chat);
            }}
          />
        </View>
      )}
      renderLeftActions={() => (
        <View style={styles.actions}>
          <Action
            color={t.accent}
            icon={chat.pinned_at ? PinOff : Pin}
            label={chat.pinned_at ? 'Открепить' : 'Закрепить'}
            onPress={() => {
              close();
              onTogglePin(chat);
            }}
          />
        </View>
      )}
    >
      <Tap
        scale={0.985}
        onPress={() => onOpen(chat)}
        onLongPress={() => onLongPress(chat)}
        delayLongPress={320}
        style={[styles.row, { backgroundColor: t.bg }]}
      >
        <Avatar
          id={chat.kind === 'direct' && peer ? peer.id : chat.id}
          name={title}
          url={chat.kind === 'direct' ? peer?.avatar_url : null}
          emoji={chat.kind === 'group' ? chat.emoji : null}
          self={chat.kind === 'self'}
          online={online}
          size={56}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.top}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <T v="bodySemi" numberOfLines={1} style={{ flexShrink: 1 }}>
                {title}
              </T>
              {muted ? <Icon icon={BellOff} size={14} color={t.textTertiary} /> : null}
              {chat.disappear_seconds ? <Icon icon={Timer} size={14} color={t.textTertiary} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {chat.pinned_at ? <Icon icon={Pin} size={13} color={t.textTertiary} /> : null}
              <T v="small" tone={chat.unread ? 'accent' : 'tertiary'}>
                {last ? formatChatTime(last.created_at) : ''}
              </T>
            </View>
          </View>
          <View style={styles.top}>
            <T v="callout" numberOfLines={1} tone={line.tone === 'danger' ? 'secondary' : line.tone} style={{ flex: 1 }}>
              {line.prefix ? (
                <T v="callout" tone="danger">
                  {line.prefix}
                </T>
              ) : null}
              {line.text}
            </T>
            {chat.unread ? (
              <View style={[styles.badge, { backgroundColor: muted ? t.textTertiary : t.accent }]}>
                <T v="tiny" color={muted ? t.bg : t.onAccent}>
                  {chat.unread > 99 ? '99+' : chat.unread}
                </T>
              </View>
            ) : null}
          </View>
          {snoozed ? (
            <T v="small" tone="tertiary">
              ⏰ вернётся {formatMoment(chat.snoozed_until!)}
            </T>
          ) : waiting && !chat.unread ? (
            <View style={[styles.waiting, { backgroundColor: t.accentSoft }]}>
              <T v="tiny" tone="accent">
                ждёт ответа · {formatAge(waiting)}
              </T>
            </View>
          ) : status ? (
            <T v="small" tone="tertiary" numberOfLines={1}>
              {status}
            </T>
          ) : null}
        </View>
      </Tap>
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row' },
  action: { width: 78, alignItems: 'center', justifyContent: 'center' },
  waiting: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
