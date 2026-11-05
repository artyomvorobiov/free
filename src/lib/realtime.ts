import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { useUi } from '@/store/ui';

import { fetchMessage, loadChats, loadMessages, markRead, touchPresence } from './api';
import { DEMO } from './config';
import { playTouch } from './haptics';
import { supabase } from './supabase';
import type { Chat, Message, ProfileLite, TouchKind, TypingKind } from './types';

let channel: RealtimeChannel | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let lastState: AppStateStatus = (AppState.currentState ?? 'active') as AppStateStatus;

function senderName(chat: Chat | undefined, senderId: string | null) {
  return chat?.members.find((m) => m.id === senderId)?.display_name || 'Кто-то';
}

async function onInsert(row: Message) {
  const me = useAuth.getState().userId;
  const chats = useChats.getState();
  let chat = chats.byId[row.chat_id];
  if (!chat) {
    await loadChats().catch(() => {});
    chat = useChats.getState().byId[row.chat_id];
    if (!chat) return;
  }
  const active = useUi.getState().activeChatId === row.chat_id;
  // строка из Realtime не содержит вложенных данных — дозагружаем ответ/капсулу
  let msg: Message = { ...row, reactions: [] };
  if (row.reply_to || row.kind === 'capsule') msg = (await fetchMessage(row.id)) ?? msg;

  if (useMessages.getState().get(row.chat_id).loaded) useMessages.getState().upsert(msg);
  useChats.getState().onMessage(msg, me, active && AppState.currentState === 'active');

  if (row.sender_id === me) return;
  if (active) markRead(row.chat_id);

  if (row.kind === 'touch') {
    const kind = (row.meta?.touch ?? 'heart') as TouchKind;
    playTouch(kind);
    useUi.getState().showTouch({ chatId: row.chat_id, kind, from: senderName(chat, row.sender_id), at: Date.now() });
  } else if (!active && AppState.currentState === 'active' && !(chat.muted_until && new Date(chat.muted_until) > new Date())) {
    const name = chat.kind === 'group' ? chat.title ?? 'Группа' : senderName(chat, row.sender_id);
    const preview =
      row.kind === 'text' ? row.body ?? '' : row.kind === 'voice' ? '🎤 Голосовое' : row.kind === 'circle' ? '⭕ Кружок' : row.kind === 'image' ? '📷 Фото' : row.kind === 'capsule' ? '💌 Капсула времени' : '';
    if (preview) useUi.getState().toast(`${name}: ${preview}`, 'info');
  }
}

function onUpdate(row: Message) {
  const existing = useMessages.getState().find(row.id);
  if (existing) useMessages.getState().upsert({ ...existing, ...row });
  useChats.getState().onMessageUpdated(row);
}

function onDelete(id: string) {
  useMessages.getState().remove(id);
  useChats.getState().onMessageDeleted(id, (chatId) => useMessages.getState().latest(chatId));
}

export function startRealtime(me: string) {
  if (DEMO) return;
  stopRealtime();
  channel = supabase
    .channel(`user:${me}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      onInsert(p.new as Message).catch((e) => console.warn('rt insert', e));
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => onUpdate(p.new as Message))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
      const id = (p.old as { id?: string }).id;
      if (id) onDelete(id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (p) => {
      if (p.eventType === 'DELETE') {
        const old = p.old as { message_id?: string; user_id?: string };
        const m = old.message_id ? useMessages.getState().find(old.message_id) : null;
        if (m && old.user_id) useMessages.getState().setReaction(m.chat_id, m.id, null, old.user_id);
      } else {
        const r = p.new as { message_id: string; chat_id: string; user_id: string; emoji: string };
        useMessages.getState().setReaction(r.chat_id, r.message_id, { user_id: r.user_id, emoji: r.emoji }, r.user_id);
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, (p) => {
      const c = p.new as Partial<Chat> & { id: string };
      useChats.getState().patch(c.id, {
        title: c.title ?? null,
        emoji: c.emoji ?? null,
        theme: c.theme ?? 'default',
        disappear_seconds: c.disappear_seconds ?? null,
      });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_members' }, () => {
      loadChats().catch(() => {});
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members' }, (p) => {
      const r = p.new as { chat_id: string; user_id: string; seen_at: string | null; role: 'owner' | 'member' };
      const chat = useChats.getState().byId[r.chat_id];
      if (chat) {
        useChats.getState().patch(r.chat_id, {
          members: chat.members.map((m) => (m.id === r.user_id ? { ...m, seen_at: r.seen_at, role: r.role } : m)),
        });
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_members' }, (p) => {
      const r = p.old as { chat_id?: string; user_id?: string };
      if (!r.chat_id) return;
      if (r.user_id === me) useChats.getState().remove(r.chat_id);
      else {
        const chat = useChats.getState().byId[r.chat_id];
        if (chat) useChats.getState().patch(r.chat_id, { members: chat.members.filter((m) => m.id !== r.user_id) });
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'view_once_opens' }, (p) => {
      const r = p.new as { message_id: string; user_id: string };
      useMessages.getState().addOpen(r.message_id, r.user_id);
    })
    .subscribe();

  // «в сети»: отмечаемся раз в минуту, пока приложение открыто
  touchPresence().catch(() => {});
  heartbeat = setInterval(() => {
    if (AppState.currentState === 'active') touchPresence().catch(() => {});
  }, 60_000);

  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && lastState !== 'active') {
      // догоняем пропущенное, пока приложение было свёрнуто
      loadChats().catch(() => {});
      const active = useUi.getState().activeChatId;
      if (active) {
        loadMessages(active).catch(() => {});
        markRead(active);
      }
      touchPresence().catch(() => {});
    } else if (state !== 'active' && lastState === 'active') {
      touchPresence().catch(() => {});
    }
    lastState = state;
  });
}

export function stopRealtime() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  appStateSub?.remove();
  appStateSub = null;
}

// ---------------------------------------------------------------- «печатает…» и присутствие в чате

export type ChatLive = {
  sendTyping: (kind: TypingKind | null) => void;
  close: () => void;
};

export function joinChat(chatId: string, me: string, otherIds: string[]): ChatLive {
  if (DEMO) return { sendTyping: () => {}, close: () => {} };
  const ch = supabase.channel(`chat:${chatId}`, { config: { broadcast: { self: false } } });
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
    const p = payload as { user_id: string; kind: TypingKind | null };
    if (!p?.user_id || p.user_id === me) return;
    useUi.getState().setTyping(chatId, p.user_id, p.kind);
    clearTimeout(timers[p.user_id]);
    if (p.kind) timers[p.user_id] = setTimeout(() => useUi.getState().setTyping(chatId, p.user_id, null), 6000);
  });
  // обновления профилей собеседников (статус, «был(а) в сети»)
  for (const id of otherIds.slice(0, 20)) {
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${id}` }, (p) => {
      const n = p.new as ProfileLite;
      useChats.getState().patchProfileEverywhere({
        id: n.id,
        display_name: n.display_name,
        username: n.username,
        avatar_url: n.avatar_url,
        status_emoji: n.status_emoji,
        status_text: n.status_text,
        status_until: n.status_until,
        status_quiet: n.status_quiet,
        last_seen_at: n.last_seen_at,
        bio: n.bio,
      });
    });
  }
  ch.subscribe();
  let last = 0;
  let lastKind: TypingKind | null = null;
  return {
    sendTyping: (kind) => {
      const now = Date.now();
      if (kind && kind === lastKind && now - last < 2500) return;
      if (!kind && !lastKind) return;
      last = now;
      lastKind = kind;
      ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: me, kind } }).catch(() => {});
    },
    close: () => {
      Object.values(timers).forEach(clearTimeout);
      supabase.removeChannel(ch);
    },
  };
}
