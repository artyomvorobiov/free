import * as Clipboard from 'expo-clipboard';
import { AlarmClock, Camera, Copy, Flag, Forward, Image as ImageIcon, Mail, Pencil, Reply, Trash } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { MomentSheet } from '@/components/ui/MomentSheet';
import { ActionList, Sheet, type SheetAction } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { preview } from '@/lib/chat-utils';
import { haptic, TOUCHES } from '@/lib/haptics';
import { formatMoment } from '@/lib/time';
import type { Chat, Message, TouchKind } from '@/lib/types';
import { toast } from '@/store/ui';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😮', '🥲'];

/** Меню сообщения: реакции + действия */
export function MessageMenu({
  msg,
  chat,
  me,
  onClose,
  onReact,
  onReply,
  onEdit,
  onForward,
  onDelete,
  onReport,
}: {
  msg: Message | null;
  chat: Chat | undefined;
  me: string | null;
  onClose: () => void;
  onReact: (m: Message, emoji: string) => void;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onForward: (m: Message) => void;
  onDelete: (m: Message) => void;
  onReport: (m: Message) => void;
}) {
  const t = useTheme();
  const m = msg;
  const mine = !!m && m.sender_id === me;
  const mineReaction = m?.reactions?.find((r) => r.user_id === me)?.emoji;
  const actions: SheetAction[] = m
    ? [
        { label: 'Ответить', icon: Reply, onPress: () => onReply(m) },
        ...(m.kind === 'text' && m.body
          ? [
              {
                label: 'Скопировать',
                icon: Copy,
                onPress: async () => {
                  await Clipboard.setStringAsync(m.body ?? '');
                  toast('Скопировано', 'success', '📋');
                },
              },
            ]
          : []),
        ...(mine && m.kind === 'text' ? [{ label: 'Изменить', icon: Pencil, onPress: () => onEdit(m) }] : []),
        ...(m.kind !== 'capsule' && !m.view_once ? [{ label: 'Переслать', icon: Forward, onPress: () => onForward(m) }] : []),
        ...(mine
          ? [{ label: 'Удалить у всех', icon: Trash, danger: true, onPress: () => onDelete(m) }]
          : chat?.kind !== 'self'
            ? [{ label: 'Пожаловаться', icon: Flag, danger: true, onPress: () => onReport(m) }]
            : []),
      ]
    : [];

  return (
    <Sheet visible={!!m} onClose={onClose}>
      {m ? (
        <View>
          <View style={[styles.reactRow, { backgroundColor: t.surface2 }]}>
            {QUICK_REACTIONS.map((e) => (
              <Tap
                key={e}
                haptics
                scale={0.85}
                onPress={() => {
                  onReact(m, e);
                  onClose();
                }}
                style={[styles.reactBtn, mineReaction === e && { backgroundColor: t.accentSoft }]}
              >
                <T style={{ fontSize: 28, lineHeight: 34 }}>{e}</T>
              </Tap>
            ))}
          </View>
          <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
            <T v="caption" tone="secondary" numberOfLines={2}>
              {preview(m, chat, me)}
            </T>
          </View>
          <ActionList actions={actions} onDone={onClose} />
        </View>
      ) : null}
    </Sheet>
  );
}

/** «Плюс» в поле ввода: фото, касания, капсула, отложенное */
export function AttachSheet({
  visible,
  onClose,
  onPhoto,
  onCamera,
  onOnce,
  onTouch,
  onCapsule,
  onSchedule,
  isSelf,
}: {
  visible: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onCamera: () => void;
  onOnce: () => void;
  onTouch: (k: TouchKind) => void;
  onCapsule: () => void;
  onSchedule: () => void;
  isSelf: boolean;
}) {
  const t = useTheme();
  const actions: SheetAction[] = [
    { label: 'Фото из галереи', icon: ImageIcon, onPress: onPhoto },
    { label: 'Снять фото', icon: Camera, onPress: onCamera },
    ...(!isSelf ? [{ label: 'Одноразовое фото', emoji: '1️⃣', hint: 'Исчезнет после первого просмотра', onPress: onOnce }] : []),
    { label: 'Капсула времени', icon: Mail, hint: 'Послание откроется в выбранный день', onPress: onCapsule },
    { label: 'Отправить позже', icon: AlarmClock, hint: 'Сообщение уйдёт само в нужное время', onPress: onSchedule },
  ];
  return (
    <Sheet visible={visible} onClose={onClose}>
      {!isSelf ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <T v="tiny" tone="secondary" style={{ textTransform: 'uppercase', marginLeft: 6, marginBottom: 8 }}>
            Касание — почувствуют вибрацией
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(Object.keys(TOUCHES) as TouchKind[]).map((k) => (
              <Tap
                key={k}
                haptics
                scale={0.9}
                onPress={() => {
                  haptic.medium();
                  onClose();
                  setTimeout(() => onTouch(k), 200);
                }}
                style={[styles.touchBtn, { backgroundColor: t.surface2 }]}
              >
                <T style={{ fontSize: 30, lineHeight: 36 }}>{TOUCHES[k].emoji}</T>
                <T v="tiny" tone="secondary">
                  {TOUCHES[k].label}
                </T>
              </Tap>
            ))}
          </View>
        </View>
      ) : null}
      <ActionList actions={actions} onDone={onClose} />
    </Sheet>
  );
}

/** Текст + время: для капсулы и отложенной отправки */
export function TimedComposer({
  mode,
  visible,
  initialText,
  onClose,
  onSubmit,
}: {
  mode: 'capsule' | 'schedule' | null;
  visible: boolean;
  initialText: string;
  onClose: () => void;
  onSubmit: (text: string, when: Date) => void;
}) {
  const t = useTheme();
  const [text, setText] = useState(initialText);
  const [step, setStep] = useState<'text' | 'switching' | 'time'>('text');

  useEffect(() => {
    if (visible) {
      setText(initialText);
      setStep(initialText.trim() ? 'time' : 'text');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const capsule = mode === 'capsule';
  return (
    <>
      <Sheet
        visible={visible && step === 'text'}
        onClose={onClose}
        title={capsule ? '💌 Капсула времени' : '⏰ Отправить позже'}
        subtitle={
          capsule
            ? 'Собеседник увидит запечатанный конверт с обратным отсчётом, а прочитать сможет только в выбранный момент.'
            : 'Сообщение уйдёт само — даже если телефон будет выключен.'
        }
      >
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={capsule ? 'Напишите послание в будущее…' : 'Текст сообщения'}
            placeholderTextColor={t.textTertiary}
            multiline
            autoFocus
            maxLength={4000}
            style={[styles.area, { backgroundColor: t.surface2, color: t.text }]}
          />
          <Button
            title="Выбрать время"
            disabled={!text.trim()}
            onPress={() => {
              setStep('switching');
              setTimeout(() => setStep('time'), 320);
            }}
          />
        </View>
      </Sheet>
      <MomentSheet
        visible={visible && step === 'time'}
        onClose={onClose}
        kind={capsule ? 'capsule' : 'schedule'}
        title={capsule ? 'Когда открыть капсулу?' : 'Когда отправить?'}
        subtitle={text.trim().length > 60 ? text.trim().slice(0, 60) + '…' : text.trim()}
        confirmLabel={capsule ? 'Запечатать' : 'Запланировать'}
        onPick={(d) => {
          if (d.getTime() < Date.now() + 60_000) {
            toast('Выберите время хотя бы на минуту позже', 'error');
            return;
          }
          onSubmit(text.trim(), d);
          toast(capsule ? `Капсула откроется ${formatMoment(d)}` : `Отправим ${formatMoment(d)}`, 'success', capsule ? '💌' : '⏰');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  reactRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12, padding: 6, borderRadius: 22 },
  reactBtn: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  touchBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 18, gap: 2 },
  area: { minHeight: 110, maxHeight: 220, borderRadius: 18, padding: 14, fontFamily: fonts.regular, fontSize: 16, textAlignVertical: 'top' },
});
