import { Reply } from 'lucide-react-native';
import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { haptic } from '@/lib/haptics';
import type { Message } from '@/lib/types';
import { hexToRgba, useTheme } from '@/theme/useTheme';

import {
  CallBubble,
  CapsuleBubble,
  CircleBubble,
  ImageBubble,
  SystemRow,
  TextBubble,
  TouchBubble,
  VoiceBubble,
  type BubbleCtx,
} from './bubbles';

type Props = {
  m: Message;
  ctx: Omit<BubbleCtx, 'onLongPress'>;
  showAvatar: boolean;
  showName: boolean;
  avatarSlot: boolean;
  senderName: string | null;
  senderAvatar: string | null;
  highlighted: boolean;
  onReply: (m: Message) => void;
  onMenu: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
};

const THRESHOLD = 64;

function Reactions({ m, me, mine, onReact }: { m: Message; me: string | null; mine: boolean; onReact: (e: string) => void }) {
  const t = useTheme();
  const groups = new Map<string, { count: number; mine: boolean }>();
  for (const r of m.reactions ?? []) {
    const g = groups.get(r.emoji) ?? { count: 0, mine: false };
    g.count += 1;
    if (r.user_id === me) g.mine = true;
    groups.set(r.emoji, g);
  }
  if (!groups.size) return null;
  return (
    <View style={[styles.reactions, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      {[...groups.entries()].map(([emoji, g]) => (
        <Tap
          key={emoji}
          haptics
          onPress={() => onReact(emoji)}
          style={[styles.reaction, { backgroundColor: g.mine ? t.accentSoft : t.surface, borderColor: g.mine ? t.accent : t.hairline }]}
        >
          <T v="caption">{emoji}</T>
          {g.count > 1 ? (
            <T v="tiny" tone={g.mine ? 'accent' : 'secondary'}>
              {g.count}
            </T>
          ) : null}
        </Tap>
      ))}
    </View>
  );
}

export const MessageItem = memo(function MessageItem({
  m,
  ctx,
  showAvatar,
  showName,
  avatarSlot,
  senderName,
  senderAvatar,
  highlighted,
  onReply,
  onMenu,
  onReact,
}: Props) {
  const t = useTheme();
  const x = useSharedValue(0);
  const passed = useSharedValue(false);
  const flash = useSharedValue(0);
  const lastTap = useRef(0);

  useEffect(() => {
    if (highlighted) flash.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 900 }));
  }, [highlighted]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = usePanGesture({
    activeOffsetX: [-14, 9999],
    failOffsetY: [-12, 12],
    enabled: m.kind !== 'system' && !m._status,
    onUpdate: (e) => {
      'worklet';
      const dx = Math.min(0, e.translationX);
      x.value = dx > -THRESHOLD ? dx : -THRESHOLD + (dx + THRESHOLD) * 0.25;
      if (!passed.value && dx <= -THRESHOLD) {
        passed.value = true;
        scheduleOnRN(haptic.light);
      } else if (passed.value && dx > -THRESHOLD) {
        passed.value = false;
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationX <= -THRESHOLD) scheduleOnRN(onReply, m);
    },
    onFinalize: () => {
      'worklet';
      passed.value = false;
      x.value = withSpring(0, { damping: 18, stiffness: 220 });
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-x.value, [10, THRESHOLD], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(-x.value, [10, THRESHOLD], [0.5, 1], 'clamp') }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ backgroundColor: hexToRgba(t.accent, flash.value * 0.16) }));

  if (m.kind === 'system') return <SystemRow m={m} chat={ctx.chat} me={ctx.me} />;

  const full: BubbleCtx = { ...ctx, onLongPress: () => onMenu(m) };
  let bubble;
  switch (m.kind) {
    case 'image':
      bubble = <ImageBubble m={m} ctx={full} />;
      break;
    case 'voice':
      bubble = <VoiceBubble m={m} ctx={full} />;
      break;
    case 'circle':
      bubble = <CircleBubble m={m} ctx={full} />;
      break;
    case 'capsule':
      bubble = <CapsuleBubble m={m} ctx={full} />;
      break;
    case 'touch':
      bubble = <TouchBubble m={m} ctx={full} />;
      break;
    case 'call':
      bubble = <CallBubble m={m} ctx={full} />;
      break;
    default:
      bubble = <TextBubble m={m} ctx={full} senderName={showName ? senderName : null} />;
  }

  const centered = m.kind === 'touch';

  return (
    <Animated.View style={[flashStyle, { paddingTop: ctx.joinTop ? 2 : 8 }]}>
      <GestureDetector gesture={pan}>
        <View style={[styles.row, { justifyContent: centered ? 'center' : ctx.mine ? 'flex-end' : 'flex-start' }]}>
          {avatarSlot && !ctx.mine && !centered ? (
            <View style={styles.avatarSlot}>
              {showAvatar ? <Avatar id={m.sender_id ?? 'x'} name={senderName} url={senderAvatar} size={30} /> : null}
            </View>
          ) : null}
          <Animated.View style={[rowStyle, { maxWidth: '100%' }]}>
            <Pressable
              onLongPress={() => {
                haptic.medium();
                onMenu(m);
              }}
              delayLongPress={320}
              onPress={() => {
                const now = Date.now();
                if (now - lastTap.current < 300) {
                  lastTap.current = 0;
                  haptic.light();
                  onReact(m, '❤️');
                } else lastTap.current = now;
              }}
            >
              {showName && m.kind !== 'text' && senderName ? (
                <T v="small" tone="accent" style={{ marginLeft: 6, marginBottom: 2 }}>
                  {senderName}
                </T>
              ) : null}
              {bubble}
            </Pressable>
            <Reactions m={m} me={ctx.me} mine={ctx.mine} onReact={(e) => onReact(m, e)} />
          </Animated.View>
          <Animated.View style={[styles.replyIcon, iconStyle]} pointerEvents="none">
            <View style={[styles.replyCircle, { backgroundColor: t.surface2 }]}>
              <Icon icon={Reply} size={16} color={t.text} />
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10 },
  avatarSlot: { width: 36, alignItems: 'flex-start', justifyContent: 'flex-end' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, paddingHorizontal: 6 },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  replyIcon: { position: 'absolute', right: 14, bottom: 6 },
  replyCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
