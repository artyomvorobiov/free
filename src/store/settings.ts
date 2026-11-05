import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

type SettingsState = {
  themeMode: ThemeMode;
  accentId: string;
  /** скорость воспроизведения голосовых */
  voiceRate: 1 | 1.5 | 2;
  /** скрытые подсказки/баннеры */
  dismissed: Record<string, boolean>;
  setThemeMode: (m: ThemeMode) => void;
  setAccent: (id: string) => void;
  setVoiceRate: (r: 1 | 1.5 | 2) => void;
  dismiss: (key: string) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      accentId: 'coral',
      voiceRate: 1,
      dismissed: {},
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccent: (accentId) => set({ accentId }),
      setVoiceRate: (voiceRate) => set({ voiceRate }),
      dismiss: (key) => set((s) => ({ dismissed: { ...s.dismissed, [key]: true } })),
    }),
    { name: 'blizko-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

type DraftsState = {
  drafts: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
};

export const useDrafts = create<DraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (chatId, text) =>
        set((s) => {
          const drafts = { ...s.drafts };
          if (text.trim()) drafts[chatId] = text;
          else delete drafts[chatId];
          return { drafts };
        }),
    }),
    { name: 'blizko-drafts', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
