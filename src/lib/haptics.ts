import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { TouchKind } from './types';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function safe(fn: () => Promise<unknown>) {
  if (!enabled) return;
  fn().catch(() => {});
}

export const haptic = {
  tap: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

/** Тактильные «касания»: собеседник чувствует их вибрацией */
export const TOUCHES: Record<TouchKind, { emoji: string; label: string; verb: string }> = {
  heart: { emoji: '💗', label: 'Сердцебиение', verb: 'отправил(а) вам сердцебиение' },
  hug: { emoji: '🫂', label: 'Обнимашка', verb: 'обнимает вас' },
  wave: { emoji: '👋', label: 'Привет', verb: 'машет вам' },
  spark: { emoji: '✨', label: 'Искра', verb: 'думает о вас' },
};

export async function playTouch(kind: TouchKind) {
  if (!enabled) return;
  const imp = (s: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(s).catch(() => {});
  const { Light, Medium, Heavy, Soft, Rigid } = Haptics.ImpactFeedbackStyle;
  switch (kind) {
    case 'heart':
      for (let i = 0; i < 3; i++) {
        await imp(Heavy);
        await wait(130);
        await imp(Medium);
        await wait(620);
      }
      break;
    case 'hug':
      for (const s of [Soft, Light, Medium, Heavy, Heavy, Medium, Light, Soft]) {
        await imp(s);
        await wait(90);
      }
      break;
    case 'wave':
      for (let i = 0; i < 3; i++) {
        await imp(Light);
        await wait(160);
      }
      break;
    case 'spark':
      await imp(Rigid);
      await wait(80);
      await imp(Light);
      await wait(80);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      break;
  }
}
