import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Hourglass, Phone, Video, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayPill } from '@/components/chat/bubbles';
import { Composer } from '@/components/chat/Composer';
import { CircleRecorder } from '@/components/chat/recorders';
import { MessageItem } from '@/components/chat/MessageItem';
import { AttachSheet, MessageMenu, TimedComposer } from '@/components/chat/sheets';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Glass } from '@/components/ui/Glass';
import { Icon } from '@/components/ui/Icon';
import { ActionSheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import {
  deleteMessage,
  editMessage,
  errorText,
  isBlocked,
  loadChats,
  loadMessages,
  loadOlder,
  markRead,
  react,
  report,
  retrySend,
  scheduleMessage,
  sendCapsule,
  sendMessage,
  sendTouch,
  unblockUser,
} from '@/lib/api';
import { startCall } from '@/lib/calls/engine';
import { chatTitle, memberName, peerOf, statusActive } from '@/lib/chat-utils';
import { confirm } from '@/lib/confirm';
import { playTouch, TOUCHES } from '@/lib/haptics';
import { pickImage, takePhoto, type LocalImage } from '@/lib/media';
import { joinChat, type ChatLive } from '@/lib/realtime';
import { formatCountdown, formatDay, formatLastSeen, formatUntil, isOnline, startOfDay } from '@/lib/time';
import type { Message, TouchKind, TypingKind } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { useSettings } from '@/store/settings';
import { toast, useUi } from '@/store/ui';
import { chatThemeById } from '@/theme/tokens';
import { hexToRgba, useTheme } from '@/theme/useTheme';

type Row =
  | { type: 'msg'; key: string; m: Message; joinTop: boolean; joinBottom: boolean }
  | { type: 'day'; key: string; label: string };

const JOIN_MS = 5 * 60_000;
const EMPTY: Message[] = [];

function sameGroup(a: Message | undefined, b: Message | undefined) {
  if (!a || !b) return false;
  if (a.kind === 'system' || b.kind === 'system' || a.kind === 'touch' || b.kind === 'touch') return false;
  if (a.sender_id !== b.sender_id) return false;
  if (startOfDay(new Date(a.created_at)).getTime() !== startOfDay(new Date(b.created_at)).getTime()) return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < JOIN_MS;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = String(id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.userId);
  const chat = useChats((s) => s.byId[chatId]);
  const items = useMessages((s) => s.byChat[chatId]?.items ?? EMPTY);
  const loaded = useMessages((s) => s.byChat[chatId]?.loaded ?? false);
  const loadingMore = useMessages((s) => s.byChat[chatId]?.loadingMore ?? false);
  const typing = useUi((s) => s.typing[chatId]);
  const dismissed = useSettings((s) => s.dismissed);
  const dismiss = useSettings((s) => s.dismiss);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [attach, setAttach] = useState(false);
  const [timed, setTimed] = useState<{ mode: 'capsule' | 'schedule'; text: string } | null>(null);
  const [reportMsg, setReportMsg] = useState<Message | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [headerH, setHeaderH] = useState(100);
  const [circle, setCircle] = useState<{ visible: boolean; locked: boolean; stop: 'send' | 'cancel' | null }>({
    visible: false,
    locked: false,
    stop: null,
  });
  const list = useRef<FlatList<Row>>(null);
  const live = useRef<ChatLive | null>(null);

  const peer = chat ? peerOf(chat, me) : undefined;
  const theme = chatThemeById(chat?.theme);

  // ----- жизненный цикл чата
  useEffect(() => {
    useUi.getState().setActiveChat(chatId);
    if (!useChats.getState().byId[chatId]) loadChats().catch(() => {});
    loadMessages(chatId).catch((e) => toast(errorText(e), 'error'));
    markRead(chatId);
    return () => {
      if (useUi.getState().activeChatId === chatId) useUi.getState().setActiveChat(null);
    };
  }, [chatId]);

  const otherIds = useMemo(() => (chat?.members ?? []).filter((m) => m.id !== me).map((m) => m.id), [chat?.members, me]);
  useEffect(() => {
    if (!me) return;
    live.current = joinChat(chatId, me, otherIds);
    return () => {
      live.current?.sendTyping(null);
      live.current?.close();
      live.current = null;
    };
  }, [chatId, me, otherIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (peer && chat?.kind === 'direct') isBlocked(peer.id).then(setBlockedByMe).catch(() => {});
  }, [peer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // локально убираем исчезнувшие сообщения
  useEffect(() => {
    const exp = items.filter((m) => m.expires_at).map((m) => new Date(m.expires_at!).getTime());
    if (!exp.length) return;
    const next = Math.min(...exp) - Date.now();
    const id = setTimeout(() => {
      const now = Date.now();
      for (const m of useMessages.getState().get(chatId).items) {
        if (m.expires_at && new Date(m.expires_at).getTime() <= now) useMessages.getState().remove(m.id);
      }
    }, Math.max(500, Math.min(next + 200, 2_147_000_000)));
    return () => clearTimeout(id);
  }, [items, chatId]);

  // ----- строки списка (от новых к старым)
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let i = 0; i < items.length; i++) {
      const m = items[i];
      const newer = items[i - 1];
      const older = items[i + 1];
      out.push({ type: 'msg', key: m.id, m, joinTop: sameGroup(m, older), joinBottom: sameGroup(m, newer) });
      const day = startOfDay(new Date(m.created_at)).getTime();
      if (!older || startOfDay(new Date(older.created_at)).getTime() !== day) {
        out.push({ type: 'day', key: 'day-' + day, label: formatDay(m.created_at) });
      }
    }
    return out;
  }, [items]);

  const seenTimes = useMemo(
    () => (chat?.members ?? []).filter((m) => m.id !== me && m.seen_at).map((m) => new Date(m.seen_at!).getTime()),
    [chat?.members, me],
  );
  const maxSeen = seenTimes.length ? Math.max(...seenTimes) : 0;

  const onTyping = useCallback((k: TypingKind | null) => live.current?.sendTyping(k), []);

  const onReact = useCallback((m: Message, emoji: string) => {
    react(m, emoji);
  }, []);

  const onJump = useCallback(
    (targetId: string) => {
      const index = rows.findIndex((r) => r.type === 'msg' && r.m.id === targetId);
      if (index < 0) {
        toast('Сообщение слишком старое — пролистайте вверх', 'info');
        return;
      }
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setHighlight(targetId);
      setTimeout(() => setHighlight(null), 1200);
    },
    [rows],
  );

  const onDelete = async (m: Message) => {
    if (await confirm('Удалить сообщение?', 'Оно исчезнет у всех участников чата.', 'Удалить')) deleteMessage(m);
  };

  const sendImage = async (img: LocalImage | null, viewOnce = false) => {
    if (!img) return;
    await sendMessage(chatId, {
      kind: 'image',
      meta: { w: img.width, h: img.height },
      viewOnce,
      replyTo,
      file: { uri: img.uri, ext: 'jpg', contentType: 'image/jpeg' },
    });
    setReplyTo(null);
  };

  const onTouch = (k: TouchKind) => {
    playTouch(k);
    useUi.getState().showTouch({ chatId, kind: k, from: 'Вы', at: Date.now() });
    sendTouch(chatId, k);
  };

  if (!chat) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.textTertiary} />
      </View>
    );
  }

  // ----- шапка
  const typers = Object.entries(typing ?? {}).filter(([uid]) => uid !== me);
  let subtitle: string;
  let subtitleAccent = false;
  if (typers.length) {
    const [uid, info] = typers[0];
    const verb = info.kind === 'voice' ? 'записывает голосовое' : info.kind === 'circle' ? 'записывает кружок' : 'печатает';
    subtitle = chat.kind === 'group' ? `${memberName(chat, uid, me)} ${verb}…` : `${verb}…`;
    subtitleAccent = true;
  } else if (chat.kind === 'self') {
    subtitle = 'только для вас';
  } else if (chat.kind === 'group') {
    const online = chat.members.filter((m) => m.id !== me && isOnline(m.last_seen_at)).length;
    subtitle = `${chat.members.length} ${chat.members.length % 10 === 1 && chat.members.length % 100 !== 11 ? 'участник' : chat.members.length % 10 >= 2 && chat.members.length % 10 <= 4 && (chat.members.length % 100 < 10 || chat.members.length % 100 >= 20) ? 'участника' : 'участников'}${online ? `, ${online} в сети` : ''}`;
  } else {
    subtitle = peer ? formatLastSeen(peer.last_seen_at) : '';
    subtitleAccent = subtitle === 'в сети';
  }

  const peerStatus = peer && statusActive(peer) ? peer : null;
  const statusKey = peerStatus ? `status-${peerStatus.id}-${peerStatus.status_until ?? ''}-${peerStatus.status_text ?? ''}` : '';
  const showStatus = !!peerStatus && !dismissed[statusKey];

  const header = (
    <View style={styles.headerWrap} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)} pointerEvents="box-none">
      <Glass style={{ paddingTop: insets.top + 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hairline }}>
        <View style={styles.headerRow}>
          <IconButton icon={ChevronLeft} iconSize={27} label="Назад" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Tap
            scale={0.98}
            onPress={() => router.push({ pathname: '/info/[id]', params: { id: chatId } })}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Avatar
              id={peer?.id ?? chat.id}
              name={chatTitle(chat, me)}
              url={peer?.avatar_url}
              emoji={chat.kind === 'group' ? chat.emoji : null}
              self={chat.kind === 'self'}
              size={40}
              online={!!peer && isOnline(peer.last_seen_at)}
            />
            <View style={{ flex: 1 }}>
              <T v="bodySemi" numberOfLines={1}>
                {chatTitle(chat, me)}
              </T>
              <T v="small" tone={subtitleAccent ? 'accent' : 'secondary'} numberOfLines={1}>
                {subtitle}
              </T>
            </View>
          </Tap>
          {chat.disappear_seconds ? (
            <View style={[styles.timerPill, { backgroundColor: t.surface2 }]}>
              <Icon icon={Hourglass} size={13} color={t.textSecondary} />
              <T v="tiny" tone="secondary">
                {formatCountdown(chat.disappear_seconds * 1000)}
              </T>
            </View>
          ) : null}
          {chat.kind === 'direct' && peer && !blockedByMe ? (
            <>
              <IconButton icon={Phone} iconSize={21} label="Аудиозвонок" onPress={() => startCall(chatId, false)} />
              <IconButton icon={Video} iconSize={23} label="Видеозвонок" onPress={() => startCall(chatId, true)} />
            </>
          ) : null}
        </View>
        {showStatus ? (
          <Animated.View entering={FadeIn} style={[styles.status, { backgroundColor: hexToRgba(t.accent, 0.1) }]}>
            <T v="h3">{peerStatus!.status_emoji ?? '💬'}</T>
            <View style={{ flex: 1 }}>
              <T v="caption">
                {peerStatus!.display_name}: {peerStatus!.status_text ?? 'занят(а)'}
                {peerStatus!.status_until ? ` ${formatUntil(peerStatus!.status_until)}` : ''}
              </T>
              <T v="small" tone="secondary">
                {peerStatus!.status_quiet ? 'Уведомления придут без звука — ответит, когда освободится' : 'Может ответить не сразу'}
              </T>
            </View>
            <IconButton icon={X} size={28} iconSize={14} color={t.textSecondary} onPress={() => dismiss(statusKey)} />
          </Animated.View>
        ) : null}
      </Glass>
    </View>
  );

  const empty = loaded && !items.length;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {theme.colors ? (
        <LinearGradient
          colors={[hexToRgba(theme.colors[0], t.scheme === 'dark' ? 0.16 : 0.13), hexToRgba(theme.colors[1], 0.02), 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.7 }}
        />
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {empty ? (
          <View style={[styles.empty, { paddingTop: headerH }]}>
            <T style={{ fontSize: 56, lineHeight: 64 }}>{chat.kind === 'self' ? '🔖' : chat.kind === 'group' ? chat.emoji ?? '👋' : '👋'}</T>
            <T v="h2" center style={{ marginTop: 10 }}>
              {chat.kind === 'self' ? 'Ваши заметки' : 'Начните разговор'}
            </T>
            <T v="callout" tone="secondary" center style={{ marginTop: 6, marginBottom: 18 }}>
              {chat.kind === 'self'
                ? 'Мысли, ссылки, голосовые для себя — всё под рукой'
                : 'Напишите сообщение или отправьте касание — собеседник почувствует его вибрацией'}
            </T>
            {chat.kind !== 'self' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(Object.keys(TOUCHES) as TouchKind[]).map((k) => (
                  <Tap key={k} haptics onPress={() => onTouch(k)} style={[styles.touchChip, { backgroundColor: t.surface }]}>
                    <T style={{ fontSize: 28, lineHeight: 34 }}>{TOUCHES[k].emoji}</T>
                  </Tap>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <FlatList
            ref={list}
            data={rows}
            inverted
            keyExtractor={(r) => r.key}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => loadOlder(chatId)}
            onEndReachedThreshold={0.4}
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
            contentContainerStyle={{ paddingTop: 6 }}
            onScrollToIndexFailed={(info) => {
              list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            }}
            ListFooterComponent={
              <View style={{ paddingTop: headerH + 6 }}>
                {loadingMore ? <ActivityIndicator color={t.textTertiary} style={{ marginBottom: 10 }} /> : null}
                {!loaded ? <ActivityIndicator color={t.textTertiary} style={{ marginTop: 40 }} /> : null}
                {chat.disappear_seconds && loaded ? (
                  <View style={styles.disappearNote}>
                    <Icon icon={Hourglass} size={13} color={t.textTertiary} />
                    <T v="small" tone="tertiary" center>
                      Новые сообщения исчезают через {formatCountdown(chat.disappear_seconds * 1000)}
                    </T>
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item }) => {
              if (item.type === 'day') return <DayPill label={item.label} />;
              const m = item.m;
              const mine = m.sender_id === me;
              const sender = chat.members.find((x) => x.id === m.sender_id);
              return (
                <MessageItem
                  m={m}
                  ctx={{
                    mine,
                    chat,
                    me,
                    theme,
                    read: mine && !m._status && maxSeen >= new Date(m.created_at).getTime(),
                    joinTop: item.joinTop,
                    joinBottom: item.joinBottom,
                    onJump,
                    onRetry: retrySend,
                  }}
                  avatarSlot={chat.kind === 'group'}
                  showAvatar={chat.kind === 'group' && !mine && !item.joinBottom}
                  showName={chat.kind === 'group' && !mine && !item.joinTop}
                  senderName={sender?.display_name ?? (m.sender_id ? null : 'Удалённый аккаунт')}
                  senderAvatar={sender?.avatar_url ?? null}
                  highlighted={highlight === m.id}
                  onReply={setReplyTo}
                  onMenu={setMenuMsg}
                  onReact={onReact}
                />
              );
            }}
          />
        )}

        {blockedByMe ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 10, gap: 8 }}>
            <T v="caption" tone="secondary" center>
              Вы заблокировали этого пользователя
            </T>
            <Button
              title="Разблокировать"
              kind="secondary"
              onPress={async () => {
                if (!peer) return;
                await unblockUser(peer.id).catch((e) => toast(errorText(e), 'error'));
                setBlockedByMe(false);
              }}
            />
          </View>
        ) : (
          <Composer
            chat={chat}
            me={me}
            replyTo={replyTo}
            editing={editing}
            blocked={chat.kind === 'direct' && !peer}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onSendText={(text, opts) => {
              sendMessage(chatId, { kind: 'text', body: text, replyTo, silent: opts.silent });
              setReplyTo(null);
              if (opts.silent) toast('Отправлено без звука', 'info', '🔕');
            }}
            onEdit={(m, text) => editMessage(m, text)}
            onVoice={(r) => {
              const web = Platform.OS === 'web';
              sendMessage(chatId, {
                kind: 'voice',
                meta: { duration: Math.round(r.duration * 10) / 10, waveform: r.waveform },
                replyTo,
                file: { uri: r.uri, ext: web ? 'webm' : 'm4a', contentType: web ? 'audio/webm' : 'audio/mp4' },
              });
              setReplyTo(null);
            }}
            circle={circle}
            onCircleStart={() => setCircle({ visible: true, locked: false, stop: null })}
            onCircleLock={() => setCircle((c) => ({ ...c, locked: true }))}
            onCircleStop={(keep) => setCircle((c) => ({ ...c, stop: keep ? 'send' : 'cancel' }))}
            onAttach={() => setAttach(true)}
            onTimed={(mode, text) => setTimeout(() => setTimed({ mode, text }), 320)}
            onTyping={onTyping}
          />
        )}
      </KeyboardAvoidingView>

      {header}

      <CircleRecorder
        visible={circle.visible}
        locked={circle.locked}
        stopSignal={circle.stop}
        onSend={() => setCircle((c) => ({ ...c, stop: 'send' }))}
        onCancel={() => setCircle((c) => ({ ...c, stop: 'cancel' }))}
        onResult={(r) => {
          setCircle({ visible: false, locked: false, stop: null });
          live.current?.sendTyping(null);
          if (!r) return;
          const ext = (r.uri.split('?')[0].split('.').pop() ?? 'mp4').toLowerCase();
          sendMessage(chatId, {
            kind: 'circle',
            meta: { duration: Math.round(r.duration * 10) / 10 },
            replyTo,
            file: { uri: r.uri, ext: ext === 'mov' ? 'mov' : 'mp4', contentType: ext === 'mov' ? 'video/quicktime' : 'video/mp4' },
          });
          setReplyTo(null);
        }}
      />

      <MessageMenu
        msg={menuMsg}
        chat={chat}
        me={me}
        onClose={() => setMenuMsg(null)}
        onReact={onReact}
        onReply={setReplyTo}
        onEdit={setEditing}
        onForward={(m) => router.push({ pathname: '/forward', params: { id: m.id } })}
        onDelete={onDelete}
        onReport={setReportMsg}
      />

      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        isSelf={chat.kind === 'self'}
        onPhoto={async () => sendImage(await pickImage())}
        onCamera={async () => sendImage(await takePhoto())}
        onOnce={async () => sendImage(await pickImage(), true)}
        onTouch={onTouch}
        onCapsule={() => setTimed({ mode: 'capsule', text: '' })}
        onSchedule={() => setTimed({ mode: 'schedule', text: '' })}
      />

      <TimedComposer
        mode={timed?.mode ?? null}
        visible={!!timed}
        initialText={timed?.text ?? ''}
        onClose={() => setTimed(null)}
        onSubmit={async (text, when) => {
          try {
            if (timed?.mode === 'capsule') await sendCapsule(chatId, text, when);
            else await scheduleMessage(chatId, text, when);
          } catch (e) {
            toast(errorText(e), 'error');
          }
        }}
      />

      <ActionSheet
        visible={!!reportMsg}
        onClose={() => setReportMsg(null)}
        title="Пожаловаться"
        subtitle="Жалобу увидит только администратор сервиса"
        actions={['Спам', 'Оскорбления', 'Мошенничество', 'Неприемлемый контент'].map((reason) => ({
          label: reason,
          onPress: async () => {
            if (!reportMsg) return;
            try {
              await report(reportMsg.sender_id, reportMsg.id, reason);
              toast('Спасибо, жалоба отправлена', 'success');
            } catch (e) {
              toast(errorText(e), 'error');
            }
          },
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 8, gap: 4 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 10, paddingLeft: 12, paddingVertical: 8, borderRadius: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  touchChip: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disappearNote: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 6, paddingHorizontal: 30 },
});
