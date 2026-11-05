import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';

import { loadChats } from './api';
import { checkIncomingCalls } from './calls/engine';
import { DEMO } from './config';
import { DEMO_ME } from './demo';
import { registerForPush, unregisterPush } from './notifications';
import { startRealtime, stopRealtime } from './realtime';
import { supabase } from './supabase';
import type { Profile } from './types';

let started = false;

const needsSetup = (p: Profile | null) => !p || !p.username || !p.display_name.trim();

async function enterApp(userId: string, email: string | null) {
  const { data, error } = await supabase.rpc('bootstrap');
  if (error) throw error;
  const profile = data as Profile;
  useAuth.getState().set({ userId, email, profile, status: needsSetup(profile) ? 'needsSetup' : 'ready' });
  if (!needsSetup(profile)) await afterReady();
}

/** Запускается после того, как профиль заполнен */
export async function afterReady() {
  const { userId } = useAuth.getState();
  if (!userId) return;
  if (DEMO) {
    await loadChats();
    return;
  }
  startRealtime(userId);
  await loadChats().catch((e) => console.warn('loadChats', e));
  checkIncomingCalls().catch(() => {});
  registerForPush().catch((e) => console.warn('push', e));
}

export async function initAuth() {
  if (started) return;
  started = true;
  if (DEMO) {
    useAuth.getState().set({ status: 'signedOut' });
    return;
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    if (event === 'SIGNED_OUT') resetLocalState();
  });
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      useAuth.getState().set({ status: 'signedOut' });
      return;
    }
    await enterApp(session.user.id, session.user.email ?? null);
  } catch (e) {
    console.warn('initAuth', e);
    // нет сети: пускаем с кэшированной сессией, данные подтянутся позже
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      useAuth.getState().set({ userId: data.session.user.id, email: data.session.user.email ?? null, status: 'ready' });
    } else {
      useAuth.getState().set({ status: 'signedOut' });
    }
  }
}

export async function enterDemo() {
  useAuth.getState().set({ userId: 'me', email: 'demo@blizko.app', profile: { ...DEMO_ME }, status: 'ready' });
  await afterReady();
}

export async function requestCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string) {
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' });
  if (error) throw error;
  if (!data.user) throw new Error('Не удалось войти');
  await enterApp(data.user.id, data.user.email ?? null);
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  await enterApp(data.user.id, data.user.email ?? null);
}

function resetLocalState() {
  stopRealtime();
  useChats.setState({ byId: {}, loaded: false });
  useMessages.setState({ byChat: {} });
  useAuth.getState().set({ userId: null, email: null, profile: null, status: 'signedOut' });
}

export async function signOut() {
  if (DEMO) {
    resetLocalState();
    return;
  }
  await unregisterPush().catch(() => {});
  await supabase.auth.signOut().catch(() => {});
  resetLocalState();
}

export async function deleteAccount() {
  if (DEMO) {
    resetLocalState();
    return;
  }
  await unregisterPush().catch(() => {});
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  resetLocalState();
}
