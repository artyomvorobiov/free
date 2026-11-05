import { create } from 'zustand';

import type { TypingKind } from '@/lib/types';

export type Toast = { id: number; text: string; kind: 'info' | 'error' | 'success'; emoji?: string };

type UiState = {
  activeChatId: string | null;
  typing: Record<string, Record<string, { kind: TypingKind; at: number }>>;
  toasts: Toast[];
  /** userId → момент последнего сигнала «в сети» (presence) */
  online: Record<string, number>;
  /** входящее «касание», которое нужно показать на экране */
  touch: { chatId: string; kind: string; from: string; at: number } | null;
  setActiveChat: (id: string | null) => void;
  setTyping: (chatId: string, userId: string, kind: TypingKind | null) => void;
  toast: (text: string, kind?: Toast['kind'], emoji?: string) => void;
  dropToast: (id: number) => void;
  setOnline: (ids: string[]) => void;
  showTouch: (t: UiState['touch']) => void;
};

let toastId = 1;

export const useUi = create<UiState>((set) => ({
  activeChatId: null,
  typing: {},
  toasts: [],
  online: {},
  touch: null,
  setActiveChat: (activeChatId) => set({ activeChatId }),
  setTyping: (chatId, userId, kind) =>
    set((s) => {
      const chat = { ...(s.typing[chatId] ?? {}) };
      if (kind) chat[userId] = { kind, at: Date.now() };
      else delete chat[userId];
      return { typing: { ...s.typing, [chatId]: chat } };
    }),
  toast: (text, kind = 'info', emoji) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind, emoji }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setOnline: (ids) => {
    const now = Date.now();
    set({ online: Object.fromEntries(ids.map((id) => [id, now])) });
  },
  showTouch: (touch) => set({ touch }),
}));

export const toast = (text: string, kind?: Toast['kind'], emoji?: string) => useUi.getState().toast(text, kind, emoji);
