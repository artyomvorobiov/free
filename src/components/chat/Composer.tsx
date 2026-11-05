import { ArrowUp, BellOff, Check, Mic, Pencil, Plus, Reply, Trash, Video, X, AlarmClock, Mail } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/Button';
import { Glass } from '@/components/ui/Glass';
import { Icon } from '@/components/ui/Icon';
import { ActionSheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { memberName, preview } from '@/lib/chat-utils';
import { haptic } from '@/lib/haptics';
import { formatDuration } from '@/lib/time';
import type { Chat, Message, TypingKind } from '@/lib/types';
import { useDrafts } from '@/store/settings';
import { toast } from '@/store/ui';
import { fonts, webNoOutline } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { LiveWave, LockHint, MAX_VOICE_SEC, RecDot, useCirclePermissions, useVoiceRecorder, type VoiceResult } from './recorders';

type Props = {
  chat: Chat;
  me: string | null;
  replyTo: Message | null;
  editing: Message | null;
  blocked: boolean;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSendText: (text: string, opts: { silent?: boolean }) => void;
  onEdit: (m: Message, text: string) => void;
  onVoice: (r: VoiceResult) => void;
  onAttach: () => void;
  onTimed: (mode: 'capsule' | 'schedule', text: string) => void;
  onTyping: (k: TypingKind | null) => void;
  /** запись кружка показывается на весь экран, поэтому её состоянием управляет экран чата */
  circle: { visible: boolean; locked: boolean };
  onCircleStart: () => void;
  onCircleLock: () => void;
  onCircleStop: (keep: boolean) => void;
};

type RecMode = 'voice' | 'circle';

export function Composer(p: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useDrafts((s) => s.drafts[p.chat.id] ?? '');
  const setDraft = useDrafts((s) => s.setDraft);
  const [text, setText] = useState(draft);
  const [mode, setMode] = useState<RecMode>('voice');
  const [voiceRec, setVoiceRec] = useState(false);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [sendMenu, setSendMenu] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const voice = useVoiceRecorder();
  const circlePerm = useCirclePermissions();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const drag = useRef({ x: 0, y: 0 });
  const recRef = useRef<null | RecMode>(null);
  const lockedRef = useRef(false);
  const dx = useSharedValue(0);

  const rec: RecMode | null = voiceRec ? 'voice' : p.circle.visible ? 'circle' : null;
  const locked = rec === 'voice' ? voiceLocked : rec === 'circle' ? p.circle.locked : false;
  recRef.current = rec;
  lockedRef.current = locked;

  // черновик
  useEffect(() => {
    const id = setTimeout(() => setDraft(p.chat.id, p.editing ? '' : text), 400);
    return () => clearTimeout(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (p.editing) {
      setText(p.editing.body ?? '');
      setTimeout(() => input.current?.focus(), 50);
    }
  }, [p.editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (p.replyTo) setTimeout(() => input.current?.focus(), 50);
  }, [p.replyTo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // авто-стоп длинного голосового
  useEffect(() => {
    if (rec === 'voice' && voice.state.durationMillis / 1000 >= MAX_VOICE_SEC) finishVoice(true);
  }, [voice.state.durationMillis]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasText = text.trim().length > 0;

  const changeText = (v: string) => {
    setText(v);
    p.onTyping(v.trim() ? 'text' : null);
  };

  const send = (opts: { silent?: boolean } = {}) => {
    const value = text.trim();
    if (!value) return;
    if (p.editing) {
      p.onEdit(p.editing, value);
      p.onCancelEdit();
    } else {
      p.onSendText(value, opts);
    }
    setText('');
    setDraft(p.chat.id, '');
    p.onTyping(null);
    haptic.light();
  };

  // ----- запись

  const startRecording = async () => {
    if (mode === 'voice') {
      const ok = await voice.start();
      if (!ok) return;
      if (!holding.current && !lockedRef.current) {
        // палец уже отпустили, пока спрашивали разрешение
        await voice.stop(false);
        return;
      }
      setVoiceRec(true);
      p.onTyping('voice');
    } else {
      if (!circlePerm.granted) {
        await circlePerm.ensure();
        return;
      }
      if (!holding.current) return;
      p.onCircleStart();
      p.onTyping('circle');
    }
  };

  const finishVoice = async (keep: boolean) => {
    const r = await voice.stop(keep);
    setVoiceRec(false);
    setVoiceLocked(false);
    dx.value = withTiming(0);
    p.onTyping(null);
    if (r) p.onVoice(r);
  };

  const finishCircle = (keep: boolean) => {
    p.onCircleStop(keep);
  };

  const finish = (keep: boolean) => {
    if (recRef.current === 'voice') finishVoice(keep);
    else if (recRef.current === 'circle') finishCircle(keep);
  };

  // свежие версии функций для обработчиков жеста (сам жест создаётся один раз)
  const actions = useRef({ startRecording, finish, setVoiceLocked, onCircleLock: p.onCircleLock, mode });
  actions.current = { startRecording, finish, setVoiceLocked, onCircleLock: p.onCircleLock, mode };

  const gestureEnabled = !hasText && !p.editing && !p.blocked;
  const panConfig = useMemo(
    () => ({
      minDistance: 0,
      runOnJS: true,
      enabled: gestureEnabled,
      onBegin: () => {
        holding.current = true;
        drag.current = { x: 0, y: 0 };
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          actions.current.startRecording();
        }, 220);
      },
      onUpdate: (e: { translationX: number; translationY: number }) => {
        drag.current = { x: e.translationX, y: e.translationY };
        if (!recRef.current || lockedRef.current) return;
        dx.value = Math.min(0, e.translationX);
        if (e.translationX < -110) {
          haptic.warning();
          holding.current = false;
          actions.current.finish(false);
        } else if (e.translationY < -80) {
          haptic.success();
          if (recRef.current === 'voice') actions.current.setVoiceLocked(true);
          else actions.current.onCircleLock();
          lockedRef.current = true;
          dx.value = withSpring(0);
        }
      },
      onFinalize: () => {
        holding.current = false;
        if (holdTimer.current) {
          // короткое касание: переключаем голосовое ↔ кружок
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
          const next: RecMode = actions.current.mode === 'voice' ? 'circle' : 'voice';
          setMode(next);
          toast(next === 'circle' ? 'Удерживайте, чтобы записать кружок' : 'Удерживайте, чтобы записать голосовое', 'info', next === 'circle' ? '⭕' : '🎤');
          haptic.tap();
          return;
        }
        if (recRef.current && !lockedRef.current) actions.current.finish(true);
        dx.value = withSpring(0);
      },
    }),
    [gestureEnabled], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pan = usePanGesture(panConfig);

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value * 0.6 }] }));

  const quote = p.editing ?? p.replyTo;
  const recording = rec !== null;

  return (
    <View style={{ paddingHorizontal: 10, paddingBottom: Math.max(insets.bottom, 10), paddingTop: 6 }}>
      {quote ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
          <Glass style={[styles.quote, { borderColor: t.hairline }]}>
            <Icon icon={p.editing ? Pencil : Reply} size={18} color={t.accent} />
            <View style={{ flex: 1 }}>
              <T v="small" tone="accent">
                {p.editing ? 'Редактирование' : `Ответ: ${memberName(p.chat, quote.sender_id, p.me)}`}
              </T>
              <T v="caption" tone="secondary" numberOfLines={1}>
                {preview(quote, p.chat, p.me)}
              </T>
            </View>
            <IconButton
              icon={X}
              size={30}
              iconSize={16}
              onPress={() => {
                if (p.editing) {
                  p.onCancelEdit();
                  setText('');
                } else p.onCancelReply();
              }}
            />
          </Glass>
        </Animated.View>
      ) : null}

      {p.blocked ? (
        <Glass style={[styles.bar, { borderColor: t.hairline, justifyContent: 'center' }]}>
          <T v="callout" tone="secondary">
            Переписка недоступна
          </T>
        </Glass>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <Glass style={[styles.bar, { borderColor: t.hairline, flex: 1 }]} interactive>
            {recording && rec === 'voice' ? (
              <View style={styles.recRow}>
                {locked ? (
                  <IconButton icon={Trash} size={36} iconSize={18} color={t.danger} label="Удалить запись" onPress={() => finishVoice(false)} />
                ) : (
                  <View style={{ width: 8 }} />
                )}
                <RecDot />
                <T v="bodySemi" style={{ fontFamily: fonts.semibold, minWidth: 44 }}>
                  {formatDuration(voice.state.durationMillis / 1000)}
                </T>
                {locked ? (
                  <LiveWave samples={voice.live.current} color={t.accent} />
                ) : (
                  <Animated.View style={[{ flex: 1, alignItems: 'center' }, slideStyle]}>
                    <T v="caption" tone="secondary">
                      ‹ влево — отмена
                    </T>
                  </Animated.View>
                )}
              </View>
            ) : recording && rec === 'circle' ? (
              <View style={styles.recRow}>
                <View style={{ width: 8 }} />
                <RecDot />
                <T v="callout" tone="secondary" style={{ flex: 1 }}>
                  Записываем кружок…
                </T>
              </View>
            ) : (
              <View style={styles.inputRow}>
                <IconButton icon={Plus} size={36} iconSize={22} color={t.textSecondary} label="Вложения" onPress={p.onAttach} />
                <TextInput
                  ref={input}
                  value={text}
                  onChangeText={changeText}
                  placeholder={p.chat.disappear_seconds ? 'Исчезающее сообщение' : 'Сообщение'}
                  placeholderTextColor={t.textTertiary}
                  selectionColor={t.accent}
                  multiline
                  maxLength={4000}
                  style={[styles.input, { color: t.text }, webNoOutline]}
                  onKeyPress={(e) => {
                    // Enter без Shift отправляет на вебе/клавиатуре
                    const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
                    if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                      (e as unknown as { preventDefault: () => void }).preventDefault?.();
                      send();
                    }
                  }}
                />
              </View>
            )}
          </Glass>

          {hasText || p.editing ? (
            <Tap
              haptics
              onPress={() => send()}
              onLongPress={() => !p.editing && setSendMenu(true)}
              delayLongPress={300}
              style={[styles.round, { backgroundColor: t.accent }]}
              accessibilityLabel="Отправить"
            >
              <Icon icon={p.editing ? Check : ArrowUp} size={22} color={t.onAccent} strokeWidth={2.6} />
            </Tap>
          ) : recording && locked && rec === 'voice' ? (
            <Tap haptics onPress={() => finishVoice(true)} style={[styles.round, { backgroundColor: t.accent }]} accessibilityLabel="Отправить голосовое">
              <Icon icon={ArrowUp} size={22} color={t.onAccent} strokeWidth={2.6} />
            </Tap>
          ) : (
            <GestureDetector gesture={pan}>
              <View
                style={[styles.round, { backgroundColor: recording ? t.accent : t.surface, transform: [{ scale: recording ? 1.25 : 1 }] }]}
                accessibilityLabel={mode === 'voice' ? 'Голосовое: удерживайте' : 'Кружок: удерживайте'}
                accessibilityRole="button"
              >
                <Icon icon={mode === 'voice' ? Mic : Video} size={22} color={recording ? t.onAccent : t.text} />
              </View>
            </GestureDetector>
          )}
        </View>
      )}

      <LockHint visible={recording} locked={locked} />

      <ActionSheet
        visible={sendMenu}
        onClose={() => setSendMenu(false)}
        title="Как отправить?"
        actions={[
          { label: 'Без звука', icon: BellOff, hint: 'Придёт тихо, без вибрации и звука', onPress: () => send({ silent: true }) },
          {
            label: 'Отправить позже',
            icon: AlarmClock,
            hint: 'Выберите время — отправим сами',
            onPress: () => {
              p.onTimed('schedule', text);
              setText('');
            },
          },
          {
            label: 'Как капсулу времени',
            icon: Mail,
            hint: 'Откроется в выбранный день',
            onPress: () => {
              p.onTimed('capsule', text);
              setText('');
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, minHeight: 48, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', flex: 1, paddingHorizontal: 4, paddingVertical: 4 },
  recRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10, paddingHorizontal: 6, height: 48 },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 130,
    paddingTop: Platform.OS === 'ios' ? 9 : 7,
    paddingBottom: Platform.OS === 'ios' ? 9 : 7,
    paddingHorizontal: 4,
  },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  quote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
});
