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

export function addNotificationTapListener(onChat: (chatId: string) => void) {
  if (!supported) return () => {};
  const last = Notifications.getLastNotificationResponse();
  const lastChat = (last?.notification.request.content.data as { chatId?: string } | undefined)?.chatId;
  if (lastChat) setTimeout(() => onChat(lastChat), 300);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const chatId = (r.notification.request.content.data as { chatId?: string } | undefined)?.chatId;
    if (chatId) onChat(chatId);
  });
  return () => sub.remove();
}
