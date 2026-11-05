import { create } from 'zustand';

import type { Message, Reaction } from '@/lib/types';

export type ChatMessages = {
  items: Message[]; // от новых к старым (для перевёрнутого списка)
  loaded: boolean;
  hasMore: boolean;
  loadingMore: boolean;
};

const EMPTY: ChatMessages = { items: [], loaded: false, hasMore: true, loadingMore: false };

type MessagesState = {
  byChat: Record<string, ChatMessages>;
  get: (chatId: string) => ChatMessages;
  setInitial: (chatId: string, items: Message[], hasMore: boolean) => void;
  appendOlder: (chatId: string, items: Message[], hasMore: boolean) => void;
  setLoadingMore: (chatId: string, v: boolean) => void;
  upsert: (msg: Message, replaceId?: string) => void;
  patch: (chatId: string, id: string, patch: Partial<Message>) => void;
  remove: (id: string) => Message | null;
  setReaction: (chatId: string, messageId: string, r: Reaction | null, userId: string) => void;
  addOpen: (messageId: string, userId: string) => void;
  find: (id: string) => Message | null;
  latest: (chatId: string) => Message | null;
};

function sortDesc(items: Message[]) {
  return items.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

function mergeServer(local: Message, server: Message): Message {
  // серверная версия не содержит вложенных полей из других таблиц — сохраняем локальные
  return {
    ...local,
    ...server,
    reactions: server.reactions ?? local.reactions,
    capsule: server.capsule !== undefined ? server.capsule : local.capsule,
    opens: server.opens ?? local.opens,
    reply: server.reply !== undefined ? server.reply : local.reply,
    _localUri: local._localUri,
    _status: server._status,
  };
}

export const useMessages = create<MessagesState>((set, get) => ({
  byChat: {},
  get: (chatId) => get().byChat[chatId] ?? EMPTY,
  setInitial: (chatId, items, hasMore) =>
    set((s) => {
      // сохраняем ещё не отправленные локальные сообщения
      const pending = (s.byChat[chatId]?.items ?? []).filter((m) => m._status && !items.some((i) => i.id === m.id));
      return {
        byChat: {
          ...s.byChat,
          [chatId]: { items: sortDesc([...pending, ...items]), loaded: true, hasMore, loadingMore: false },
        },
      };
    }),
  appendOlder: (chatId, items, hasMore) =>
    set((s) => {
      const cur = s.byChat[chatId] ?? EMPTY;
      const ids = new Set(cur.items.map((m) => m.id));
      return {
        byChat: {
          ...s.byChat,
          [chatId]: {
            ...cur,
            items: sortDesc([...cur.items, ...items.filter((m) => !ids.has(m.id))]),
            hasMore,
            loadingMore: false,
          },
        },
      };
    }),
  setLoadingMore: (chatId, v) =>
    set((s) => ({ byChat: { ...s.byChat, [chatId]: { ...(s.byChat[chatId] ?? EMPTY), loadingMore: v } } })),
  upsert: (msg, replaceId) =>
    set((s) => {
      const cur = s.byChat[msg.chat_id] ?? { ...EMPTY, loaded: false };
      const idx = cur.items.findIndex((m) => m.id === (replaceId ?? msg.id));
      const items = [...cur.items];
      if (idx >= 0) items[idx] = mergeServer(items[idx], msg);
      else items.push(msg);
      return { byChat: { ...s.byChat, [msg.chat_id]: { ...cur, items: sortDesc(items) } } };
    }),
  patch: (chatId, id, patch) =>
    set((s) => {
      const cur = s.byChat[chatId];
      if (!cur) return {};
      return {
        byChat: { ...s.byChat, [chatId]: { ...cur, items: cur.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) } },
      };
    }),
  remove: (id) => {
    let removed: Message | null = null;
    set((s) => {
      const byChat = { ...s.byChat };
      for (const [chatId, cur] of Object.entries(byChat)) {
        const m = cur.items.find((x) => x.id === id);
        if (m) {
          removed = m;
          byChat[chatId] = {
            ...cur,
            items: cur.items
              .filter((x) => x.id !== id)
              .map((x) => (x.reply_to === id ? { ...x, reply: null } : x)),
          };
        }
      }
      return { byChat };
    });
    return removed;
  },
  setReaction: (chatId, messageId, r, userId) =>
    set((s) => {
      const cur = s.byChat[chatId];
      if (!cur) return {};
      return {
        byChat: {
          ...s.byChat,
          [chatId]: {
            ...cur,
            items: cur.items.map((m) => {
              if (m.id !== messageId) return m;
              const rest = (m.reactions ?? []).filter((x) => x.user_id !== userId);
              return { ...m, reactions: r ? [...rest, r] : rest };
            }),
          },
        },
      };
    }),
  addOpen: (messageId, userId) =>
    set((s) => {
      const byChat = { ...s.byChat };
      for (const [chatId, cur] of Object.entries(byChat)) {
        if (cur.items.some((m) => m.id === messageId)) {
          byChat[chatId] = {
            ...cur,
            items: cur.items.map((m) =>
              m.id === messageId && !(m.opens ?? []).some((o) => o.user_id === userId)
                ? { ...m, opens: [...(m.opens ?? []), { user_id: userId }] }
                : m,
            ),
          };
        }
      }
      return { byChat };
    }),
  find: (id) => {
    for (const cur of Object.values(get().byChat)) {
      const m = cur.items.find((x) => x.id === id);
      if (m) return m;
    }
    return null;
  },
  latest: (chatId) => get().byChat[chatId]?.items.find((m) => !m._status) ?? null,
}));
