import { create } from 'zustand';

/** Одновременно играет только одно голосовое/кружок */
export const useNowPlaying = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({
  id: null,
  set: (id) => set({ id }),
}));
