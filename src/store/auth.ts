import { create } from 'zustand';

import type { Profile } from '@/lib/types';

export type AuthStatus = 'loading' | 'signedOut' | 'needsSetup' | 'ready';

type AuthState = {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  set: (patch: Partial<Omit<AuthState, 'set' | 'patchProfile'>>) => void;
  patchProfile: (patch: Partial<Profile>) => void;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  userId: null,
  email: null,
  profile: null,
  set: (patch) => set(patch),
  patchProfile: (patch) => set((s) => (s.profile ? { profile: { ...s.profile, ...patch } } : {})),
}));

export const myId = () => useAuth.getState().userId;
