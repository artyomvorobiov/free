import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useUi } from '@/store/ui';

import { DEMO } from './config';
import { supabase } from './supabase';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';
let currentToken: string | null = null;

/** Как показывать уведомления, когда приложение открыто */
export function setupNotificationHandler() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const data = (n.request.content.data ?? {}) as { chatId?: string; local?: boolean };
      const open = useUi.getState().activeChatId;
      // сообщения показываем внутри приложения сами; системные — только напоминания
      const show = !!data.local && data.chatId !== open;
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: true };
    },
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** Регистрирует устройство для push-уведомлений (нужен реальный iPhone и проект EAS) */
export async function registerForPush() {
  if (DEMO || !supported || !Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Сообщения',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
    });
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Звонки',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'call.wav',
      vibrationPattern: [0, 900, 1100, 900, 1100, 900],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push: нет projectId — выполните `npx eas-cli init`, чтобы включить уведомления');
    return;
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  currentToken = token;
  await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
}

export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

export async function setBadge(n: number) {
  if (!supported) return;
  await Notifications.setBadgeCountAsync(n).catch(() => {});
}

// ---------------------------------------------------------------- напоминания «Ответить позже»

const KEY = 'blizko-snooze-reminders';

async function loadMap(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function scheduleSnoozeReminder(chatId: string, name: string, date: Date) {
  if (!supported) return;
  await cancelSnoozeReminder(chatId);
  if (!(await ensureNotificationPermission())) return;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ Пора ответить',
      body: `Вы хотели вернуться к чату «${name}»`,
      data: { chatId, local: true },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  const map = await loadMap();
  map[chatId] = id;
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

export async function cancelSnoozeReminder(chatId: string) {
  if (!supported) return;
  const map = await loadMap();
  if (map[chatId]) {
    await Notifications.cancelScheduledNotificationAsync(map[chatId]).catch(() => {});
    delete map[chatId];
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  }
}

export type PushData = { chatId?: string; type?: string; callId?: string; local?: boolean };

export function addNotificationTapListener(onTap: (data: PushData) => void) {
  if (!supported) return () => {};
  const last = Notifications.getLastNotificationResponse();
  const lastData = last?.notification.request.content.data as PushData | undefined;
  if (lastData?.chatId) setTimeout(() => onTap(lastData), 300);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const data = r.notification.request.content.data as PushData | undefined;
    if (data?.chatId) onTap(data);
  });
  return () => sub.remove();
}

/** Push пришёл, пока приложение открыто (нужно для входящих звонков) */
export function addNotificationReceivedListener(onData: (data: PushData) => void) {
  if (!supported) return () => {};
  const sub = Notifications.addNotificationReceivedListener((n) => {
    onData((n.request.content.data ?? {}) as PushData);
  });
  return () => sub.remove();
}
