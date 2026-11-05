import { create } from 'zustand';

import type { Chat, Member, Message, ProfileLite } from '@/lib/types';

type ChatsState = {
  byId: Record<string, Chat>;
  loaded: boolean;
  setAll: (chats: Chat[]) => void;
  upsert: (chat: Chat) => void;
  patch: (id: string, patch: Partial<Chat>) => void;
  remove: (id: string) => void;
  onMessage: (msg: Message, me: string | null, isOpen: boolean) => void;
  onMessageUpdated: (msg: Message) => void;
  onMessageDeleted: (id: string, fallback?: (chatId: string) => Message | null) => void;
  patchMember: (userId: string, patch: Partial<Member>) => void;
  patchProfileEverywhere: (p: Partial<ProfileLite> & { id: string }) => void;
};

export const useChats = create<ChatsState>((set, get) => ({
  byId: {},
  loaded: false,
  setAll: (chats) => set({ byId: Object.fromEntries(chats.map((c) => [c.id, c])), loaded: true }),
  upsert: (chat) => set((s) => ({ byId: { ...s.byId, [chat.id]: chat } })),
  patch: (id, patch) =>
    set((s) => (s.byId[id] ? { byId: { ...s.byId, [id]: { ...s.byId[id], ...patch } } } : {})),
  remove: (id) =>
    set((s) => {
      const byId = { ...s.byId };
      delete byId[id];
      return { byId };
    }),
  onMessage: (msg, me, isOpen) => {
    const chat = get().byId[msg.chat_id];
    if (!chat) return;
    const incoming = msg.sender_id !== me && countsAsUnread(msg);
    const newer = !chat.last_message || chat.last_message.created_at <= msg.created_at;
    set((s) => ({
      byId: {
        ...s.byId,
        [chat.id]: {
          ...chat,
          last_message: newer ? msg : chat.last_message,
          last_message_at: newer ? msg.created_at : chat.last_message_at,
          unread: incoming && !isOpen ? chat.unread + 1 : isOpen ? 0 : chat.unread,
          // новое входящее сообщение возвращает чат из «Ответить позже»
          snoozed_until: incoming ? null : chat.snoozed_until,
        },
      },
    }));
  },
  onMessageUpdated: (msg) => {
    const chat = get().byId[msg.chat_id];
    if (chat?.last_message?.id === msg.id) get().patch(chat.id, { last_message: { ...chat.last_message, ...msg } });
  },
  onMessageDeleted: (id, fallback) => {
    const chat = Object.values(get().byId).find((c) => c.last_message?.id === id);
    if (chat) get().patch(chat.id, { last_message: fallback ? fallback(chat.id) : null });
  },
  patchMember: (userId, patch) =>
    set((s) => {
      const byId: Record<string, Chat> = {};
      for (const [id, c] of Object.entries(s.byId)) {
        byId[id] = c.members.some((m) => m.id === userId)
          ? { ...c, members: c.members.map((m) => (m.id === userId ? { ...m, ...patch } : m)) }
          : c;
      }
      return { byId };
    }),
  patchProfileEverywhere: (p) => get().patchMember(p.id, p),
}));

const isFuture = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();

/** Что считается непрочитанным: всё, кроме служебных сообщений и состоявшихся звонков */
export function countsAsUnread(m: Message) {
  if (m.kind === 'system') return false;
  if (m.kind === 'call') return m.meta?.call_status === 'missed' || m.meta?.call_status === 'canceled';
  return true;
}

export function isSnoozed(c: Chat) {
  return isFuture(c.snoozed_until);
}

export function isMuted(c: Chat) {
  return isFuture(c.muted_until);
}

/** Чаты для главного экрана: закреплённые сверху, затем по времени */
export function sortChats(list: Chat[]) {
  return [...list].sort((a, b) => {
    if (a.pinned_at && !b.pinned_at) return -1;
    if (!a.pinned_at && b.pinned_at) return 1;
    if (a.pinned_at && b.pinned_at) return a.pinned_at < b.pinned_at ? 1 : -1;
    return a.last_message_at < b.last_message_at ? 1 : -1;
  });
}

/** «Ждёт ответа»: последнее сообщение от собеседника и висит дольше часа */
export const WAITING_AFTER_MS = 60 * 60 * 1000;
export function waitingSince(c: Chat, me: string | null): number | null {
  const m = c.last_message;
  if (!m || c.kind === 'self' || m.kind === 'system' || m.sender_id === me || !m.sender_id) return null;
  const age = Date.now() - new Date(m.created_at).getTime();
  return age >= WAITING_AFTER_MS ? age : null;
}
