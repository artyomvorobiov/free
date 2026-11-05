import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Check, CheckCheck, Clock, Eye, Hourglass, Lock, Pause, Play, RotateCcw, Timer } from 'lucide-react-native';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui/Icon';
import { T } from '@/components/ui/T';
import { Tap } from '@/components/ui/Tap';
import { fetchCapsule } from '@/lib/api';
import { memberName, preview, systemText } from '@/lib/chat-utils';
import { haptic, playTouch, TOUCHES } from '@/lib/haptics';
import { useMediaUrl } from '@/lib/media';
import { formatCountdown, formatDuration, formatMoment, formatTime, fullDate } from '@/lib/time';
import type { Chat, Message, TouchKind } from '@/lib/types';
import { useNowPlaying } from '@/store/player';
import { useSettings } from '@/store/settings';
import { toast, useUi } from '@/store/ui';
import { fonts, type ChatTheme } from '@/theme/tokens';
import { hexToRgba, useTheme, type Theme } from '@/theme/useTheme';

export type BubbleCtx = {
  mine: boolean;
  chat: Chat | undefined;
  me: string | null;
  theme: ChatTheme;
  read: boolean;
  /** соседние сообщения того же автора: скругления углов */
  joinTop: boolean;
  joinBottom: boolean;
  onJump?: (id: string) => void;
  onRetry?: (m: Message) => void;
  onLongPress?: () => void;
};

export function bubbleColors(ctx: BubbleCtx, t: Theme) {
  if (!ctx.mine) return { bg: [t.incoming, t.incoming] as [string, string], fg: t.incomingText, sub: t.textSecondary };
  if (ctx.theme.colors) return { bg: ctx.theme.colors, fg: ctx.theme.on, sub: hexToRgba(ctx.theme.on === '#FFFFFF' ? '#FFFFFF' : '#2A1A14', 0.7) };
  return { bg: [t.accent, t.accent] as [string, string], fg: t.onAccent, sub: hexToRgba(t.onAccent, 0.68) };
}

function corners(ctx: BubbleCtx) {
  const big = 20;
  const small = 6;
  return ctx.mine
    ? { borderTopLeftRadius: big, borderBottomLeftRadius: big, borderTopRightRadius: ctx.joinTop ? small : big, borderBottomRightRadius: ctx.joinBottom ? small : big }
    : { borderTopRightRadius: big, borderBottomRightRadius: big, borderTopLeftRadius: ctx.joinTop ? small : big, borderBottomLeftRadius: ctx.joinBottom ? small : big };
}

/** Оболочка пузыря: градиент темы для своих, светлая карточка для входящих */
export function Shell({ ctx, children, padded = true, maxWidth }: { ctx: BubbleCtx; children: ReactNode; padded?: boolean; maxWidth?: number }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const c = bubbleColors(ctx, t);
  return (
    <LinearGradient
      colors={c.bg}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        corners(ctx),
        { maxWidth: maxWidth ?? Math.min(width * 0.78, 460), overflow: 'hidden' },
        padded && { paddingHorizontal: 13, paddingTop: 8, paddingBottom: 7 },
        !ctx.mine && t.scheme === 'light' && styles.incomingShadow,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

/** Время, «изм.», исчезающее и галочки */
export function MetaRow({ m, ctx, color, overlay }: { m: Message; ctx: BubbleCtx; color: string; overlay?: boolean }) {
  const t = useTheme();
  const tick =
    !ctx.mine ? null : m._status === 'sending' ? (
      <Icon icon={Clock} size={12} color={color} />
    ) : m._status === 'failed' ? null : ctx.read ? (
      <Icon icon={CheckCheck} size={14} color={color} strokeWidth={2.4} />
    ) : (
      <Icon icon={Check} size={14} color={color} strokeWidth={2.4} />
    );
  return (
    <View style={[styles.meta, overlay && styles.metaOverlay]}>
      {m.expires_at ? <Icon icon={Timer} size={11} color={color} /> : null}
      {m.silent ? <T v="tiny" color={color}>🔕</T> : null}
      {m.edited_at ? (
        <T v="tiny" color={color}>
          изм.
        </T>
      ) : null}
      <T v="tiny" color={color} style={{ fontFamily: fonts.medium }}>
        {formatTime(m.created_at)}
      </T>
      {tick}
      {m._status === 'failed' ? (
        <Tap onPress={() => ctx.onRetry?.(m)} hitSlop={10}>
          <View style={[styles.failed, { backgroundColor: t.danger }]}>
            <Icon icon={RotateCcw} size={11} color="#fff" />
          </View>
        </Tap>
      ) : null}
    </View>
  );
}

// Пробел в конце текста, чтобы время не налезало на последнюю строку
const META_SPACER = '       ';

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const IS_URL = /^(https?:\/\/|www\.)/i;

function Linkified({ text, color }: { text: string; color: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        IS_URL.test(p) ? (
          <Text
            key={i}
            style={{ color, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(p.startsWith('http') ? p : `https://${p}`).catch(() => {})}
          >
            {p}
          </Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </>
  );
}

export function ReplyQuote({ m, ctx }: { m: Message; ctx: BubbleCtx }) {
  const t = useTheme();
  const c = bubbleColors(ctx, t);
  if (!m.reply_to) return null;
  const r = m.reply;
  const name = r ? memberName(ctx.chat, r.sender_id, ctx.me) : '';
  return (
    <Pressable onPress={() => r && ctx.onJump?.(r.id)} style={[styles.quote, { backgroundColor: ctx.mine ? 'rgba(255,255,255,0.18)' : t.surface2 }]}>
      <View style={[styles.quoteBar, { backgroundColor: ctx.mine ? c.fg : t.accent }]} />
      <View style={{ flex: 1 }}>
        <T v="small" color={ctx.mine ? c.fg : t.accent} numberOfLines={1}>
          {r ? name : 'Сообщение удалено'}
        </T>
        {r ? (
          <T v="caption" color={ctx.mine ? c.sub : t.textSecondary} numberOfLines={1}>
            {preview(r as Message, ctx.chat, ctx.me) || 'Медиа'}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

function Forwarded({ m, color }: { m: Message; color: string }) {
  if (!m.meta?.forwarded_from) return null;
  return (
    <T v="small" color={color} style={{ marginBottom: 3 }}>
      ↪ Переслано от {m.meta.forwarded_from}
    </T>
  );
}

export const TextBubble = memo(function TextBubble({ m, ctx, senderName }: { m: Message; ctx: BubbleCtx; senderName?: string | null }) {
  const t = useTheme();
  const c = bubbleColors(ctx, t);
  const big = !m.reply_to && !m.meta?.forwarded_from && /^\p{Extended_Pictographic}{1,3}$/u.test((m.body ?? '').replace(/\s|️|‍/g, ''));
  if (big) {
    return (
      <View style={{ alignItems: ctx.mine ? 'flex-end' : 'flex-start' }}>
        <Text style={{ fontSize: 52, lineHeight: 62 }}>{m.body}</Text>
        <View style={[styles.bigMeta, { backgroundColor: t.surface2 }]}>
          <MetaRow m={m} ctx={ctx} color={t.textSecondary} />
        </View>
      </View>
    );
  }
  return (
    <Shell ctx={ctx}>
      {senderName ? (
        <T v="small" color={t.accent} style={{ marginBottom: 2 }}>
          {senderName}
        </T>
      ) : null}
      <Forwarded m={m} color={c.sub} />
      <ReplyQuote m={m} ctx={ctx} />
      <Text style={{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 21.5, color: c.fg }}>
        <Linkified text={m.body ?? ''} color={c.fg} />
        <Text style={{ color: 'transparent' }}>{META_SPACER}{m.edited_at ? '   ' : ''}{m.expires_at ? ' ' : ''}</Text>
      </Text>
      <View style={styles.metaAbs}>
        <MetaRow m={m} ctx={ctx} color={c.sub} />
      </View>
    </Shell>
  );
});

export const ImageBubble = memo(function ImageBubble({ m, ctx }: { m: Message; ctx: BubbleCtx }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const opened = (m.opens ?? []).some((o) => o.user_id === ctx.me);
  const anyOpened = (m.opens ?? []).length > 0;
  const { url } = useMediaUrl(m.media_path, m._localUri, !m.view_once || ctx.mine);
  const w = m.meta?.w ?? 3;
  const h = m.meta?.h ?? 4;
  const maxW = Math.min(width * 0.68, 320);
  const ratio = Math.min(Math.max(h / w, 0.55), 1.4);

  if (m.view_once) {
    const c = bubbleColors(ctx, t);
    const label = ctx.mine ? (anyOpened ? 'Одноразовое фото · открыто' : 'Одноразовое фото · не открыто') : opened ? 'Фото просмотрено' : 'Фото · откроется один раз';
    return (
      <Tap
        disabled={ctx.mine || opened}
        onPress={() => router.push({ pathname: '/viewer', params: { id: m.id } })}
        onLongPress={ctx.onLongPress}
        delayLongPress={320}
      >
        <Shell ctx={ctx}>
          <View style={styles.once}>
            <View style={[styles.onceIcon, { borderColor: c.fg }]}>
              <T v="tiny" color={c.fg}>
                1
              </T>
            </View>
            <T v="bodyMedium" color={c.fg} style={{ flexShrink: 1 }}>
              {label}
            </T>
          </View>
          <MetaRow m={m} ctx={ctx} color={c.sub} />
        </Shell>
      </Tap>
    );
  }

  return (
    <Tap
      scale={0.98}
      onPress={() => router.push({ pathname: '/viewer', params: { id: m.id } })}
      onLongPress={ctx.onLongPress}
      delayLongPress={320}
    >
      <Shell ctx={ctx} padded={false}>
        <View style={{ width: maxW, height: maxW * ratio, backgroundColor: t.surface2 }}>
          {url ? (
            <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <ActivityIndicator color={t.textTertiary} />
            </View>
          )}
          {m._status === 'sending' ? (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
        {m.body ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            <T v="body" color={bubbleColors(ctx, t).fg}>
              {m.body}
            </T>
          </View>
        ) : null}
        <View style={[styles.metaOnMedia]}>
          <MetaRow m={m} ctx={ctx} color="#fff" />
        </View>
      </Shell>
    </Tap>
  );
});

const BARS = 36;

function resample(src: number[] | undefined, n: number) {
  if (!src?.length) return Array.from({ length: n }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 0.7)));
  return Array.from({ length: n }, (_, i) => src[Math.floor((i / n) * src.length)] ?? 0.2);
}

export const VoiceBubble = memo(function VoiceBubble({ m, ctx }: { m: Message; ctx: BubbleCtx }) {
  const t = useTheme();
  const c = bubbleColors(ctx, t);
  const { url } = useMediaUrl(m.media_path, m._localUri);
  const playable = !!url && !m.media_path?.startsWith('demo/');
  const player = useAudioPlayer(playable ? { uri: url! } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const rate = useSettings((s) => s.voiceRate);
  const setRate = useSettings((s) => s.setVoiceRate);
  const nowPlaying = useNowPlaying((s) => s.id);
  const setNowPlaying = useNowPlaying((s) => s.set);
  const bars = useMemo(() => resample(m.meta?.waveform, BARS), [m.meta?.waveform]);
  const duration = status.duration || m.meta?.duration || 0;
  const progress = duration ? Math.min(1, status.currentTime / duration) : 0;

  useEffect(() => {
    if (nowPlaying !== m.id && status.playing) player.pause();
  }, [nowPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0).catch(() => {});
      if (nowPlaying === m.id) setNowPlaying(null);
    }
  }, [status.didJustFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      player.setPlaybackRate(rate);
    } catch {}
  }, [rate, player]);

  const toggle = () => {
    if (!playable) {
      toast('В демо-режиме это голосовое не воспроизводится — запишите своё 🎤');
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      setNowPlaying(m.id);
      player.setPlaybackRate(rate);
      player.play();
    }
  };

  return (
    <Shell ctx={ctx}>
      <Forwarded m={m} color={c.sub} />
      <ReplyQuote m={m} ctx={ctx} />
      <View style={styles.voice}>
        <Tap onPress={toggle} haptics style={[styles.play, { backgroundColor: ctx.mine ? hexToRgba(c.fg === '#FFFFFF' ? '#FFFFFF' : '#000000', 0.22) : t.accent }]}>
          <Icon icon={status.playing ? Pause : Play} size={20} color={ctx.mine ? c.fg : t.onAccent} fill={ctx.mine ? c.fg : t.onAccent} />
        </Tap>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.wave}>
            {bars.map((b, i) => (
              <View
                key={i}
                style={{
                  width: 3,
                  borderRadius: 2,
                  height: 4 + b * 22,
                  backgroundColor: i / BARS <= progress && (status.playing || status.currentTime > 0) ? c.fg : hexToRgba(ctx.mine ? (c.fg === '#FFFFFF' ? '#FFFFFF' : '#000000') : t.text, 0.28),
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T v="small" color={c.sub}>
                {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : duration)}
              </T>
              {status.playing ? (
                <Tap onPress={() => setRate(rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1)} hitSlop={8}>
                  <View style={[styles.rate, { backgroundColor: ctx.mine ? 'rgba(255,255,255,0.22)' : t.surface2 }]}>
                    <T v="tiny" color={ctx.mine ? c.fg : t.text}>
                      {rate}×
                    </T>
                  </View>
                </Tap>
              ) : null}
            </View>
            <MetaRow m={m} ctx={ctx} color={c.sub} />
          </View>
        </View>
      </View>
    </Shell>
  );
});

export const CircleBubble = memo(function CircleBubble({ m, ctx }: { m: Message; ctx: BubbleCtx }) {
  const t = useTheme();
  const size = 210;
  const opened = (m.opens ?? []).some((o) => o.user_id === ctx.me);
  const { url } = useMediaUrl(m.media_path, m._localUri, !m.view_once || ctx.mine);
  const player = useVideoPlayer(url ? { uri: url } : null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const nowPlaying = useNowPlaying((s) => s.id);
  const setNowPlaying = useNowPlaying((s) => s.set);
  const duration = player.duration || m.meta?.duration || 1;
  const progress = Math.min(1, (time?.currentTime ?? 0) / duration);

  useEffect(() => {
    if (nowPlaying !== m.id && isPlaying) player.pause();
  }, [nowPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      player.currentTime = 0;
      if (useNowPlaying.getState().id === m.id) setNowPlaying(null);
    });
    return () => sub.remove();
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

  if (m.view_once && !ctx.mine) {
    return (
      <Tap
        disabled={opened}
        onPress={() => router.push({ pathname: '/viewer', params: { id: m.id } })}
        onLongPress={ctx.onLongPress}
        delayLongPress={320}
      >
        <View style={[styles.circlePlaceholder, { width: size * 0.7, height: size * 0.7, borderRadius: size, backgroundColor: t.surface2 }]}>
          <T style={{ fontSize: 34 }}>{opened ? '👀' : '⭕'}</T>
          <T v="small" tone="secondary" center>
            {opened ? 'Просмотрено' : 'Кружок · 1 раз'}
          </T>
        </View>
      </Tap>
    );
  }

  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  return (
    <Tap
      scale={0.97}
      onLongPress={ctx.onLongPress}
      delayLongPress={320}
      onPress={() => {
        if (!url) return;
        if (isPlaying) player.pause();
        else {
          setNowPlaying(m.id);
          player.muted = false;
          player.play();
        }
      }}
    >
      <View style={{ width: size, height: size }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: t.surface2 }}>
          {url ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : null}
          {!isPlaying ? (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <View style={styles.circlePlay}>
                {m._status === 'sending' ? <ActivityIndicator color="#fff" /> : <Icon icon={Play} size={26} color="#fff" fill="#fff" />}
              </View>
            </View>
          ) : null}
        </View>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={hexToRgba('#FFFFFF', 0.25)} strokeWidth={4} fill="none" />
          {isPlaying || progress > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={t.accent}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={circ * (1 - progress)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </Svg>
        <View style={[styles.circleMeta, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <T v="tiny" color="#fff">
            {formatDuration(isPlaying ? time?.currentTime ?? 0 : m.meta?.duration ?? player.duration ?? 0)}
          </T>
          <MetaRow m={m} ctx={ctx} color="#fff" />
        </View>
        {m.view_once && ctx.mine ? (
          <View style={[styles.onceBadge, { backgroundColor: t.surface }]}>
            <Icon icon={Eye} size={12} color={t.text} />
            <T v="tiny">{(m.opens ?? []).length ? 'открыт' : '1 раз'}</T>
          </View>
        ) : null}
      </View>
    </Tap>
  );
});

export const CapsuleBubble = memo(function CapsuleBubble({ m, ctx }: { m: Message; ctx: BubbleCtx }) {
  const t = useTheme();
  const unlockAt = m.unlock_at ? new Date(m.unlock_at).getTime() : 0;
  const [now, setNow] = useState(Date.now());
  const sealed = unlockAt > now;
  const left = unlockAt - now;

  useEffect(() => {
    if (!sealed) return;
    const step = left < 3600_000 ? 1000 : 30_000;
    const id = setInterval(() => setNow(Date.now()), step);
    return () => clearInterval(id);
  }, [sealed, left < 3600_000]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sealed && !m.capsule && !m._status) {
      fetchCapsule(m).then(() => haptic.success());
    }
  }, [sealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors: [string, string] = ctx.theme.colors ?? ['#FF8A5C', '#FF4D8D'];
  const sender = memberName(ctx.chat, m.sender_id, ctx.me);

  if (sealed) {
    return (
      <Animated.View entering={ZoomIn.springify().damping(14)}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.capsule, corners(ctx)]}>
          <View style={styles.capsuleSeal}>
            <T style={{ fontSize: 30, lineHeight: 36 }}>💌</T>
          </View>
          <T v="tiny" color="rgba(255,255,255,0.8)" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            Капсула времени
          </T>
          <T v="h2" color="#fff" style={{ marginTop: 2 }}>
            {formatCountdown(left)}
          </T>
          <T v="caption" color="rgba(255,255,255,0.9)">
            откроется {formatMoment(m.unlock_at!)}
          </T>
          {ctx.mine && m.capsule?.body ? (
            <View style={styles.capsulePeek}>
              <Icon icon={Lock} size={12} color="rgba(255,255,255,0.85)" />
              <T v="caption" color="rgba(255,255,255,0.92)" numberOfLines={2} style={{ flex: 1, fontStyle: 'italic' }}>
                {m.capsule.body}
              </T>
            </View>
          ) : (
            <T v="caption" color="rgba(255,255,255,0.85)" style={{ marginTop: 8 }}>
              {ctx.mine ? 'Видно только вам до открытия' : `${sender} оставил(а) послание. Не подглядывать 🤫`}
            </T>
          )}
          <View style={{ alignSelf: 'flex-end', marginTop: 6 }}>
            <MetaRow m={m} ctx={{ ...ctx, mine: ctx.mine }} color="rgba(255,255,255,0.85)" />
          </View>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <View style={[styles.capsuleOpen, corners(ctx), { backgroundColor: t.surface, borderColor: hexToRgba(colors[0], 0.55) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <T style={{ fontSize: 20 }}>✨</T>
          <T v="small" tone="secondary" style={{ flex: 1 }}>
            Капсула от {fullDate(m.created_at)} · {ctx.mine ? 'вы' : sender}
          </T>
        </View>
        {m.capsule?.body ? (
          <T v="body">{m.capsule.body}</T>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={t.textTertiary} />
            <T v="callout" tone="secondary">
              Открываем…
            </T>
          </View>
        )}
        <View style={{ alignSelf: 'flex-end', marginTop: 6 }}>
          <MetaRow m={m} ctx={ctx} color={t.textTertiary} />
        </View>
      </View>
    </Animated.View>
  );
});

export const TouchBubble = memo(function TouchBubble({ m, ctx }: { m: Message; ctx: BubbleCtx }) {
  const t = useTheme();
  const kind = (m.meta?.touch ?? 'heart') as TouchKind;
  const meta = TOUCHES[kind];
  const name = memberName(ctx.chat, m.sender_id, ctx.me);
  return (
    <Tap
      onLongPress={ctx.onLongPress}
      delayLongPress={320}
      onPress={() => {
        playTouch(kind);
        useUi.getState().showTouch({ chatId: m.chat_id, kind, from: ctx.mine ? 'Вы' : name, at: Date.now() });
      }}
      style={[styles.touch, { backgroundColor: t.surface }]}
    >
      <T style={{ fontSize: 34, lineHeight: 40 }}>{meta.emoji}</T>
      <View>
        <T v="caption">{ctx.mine ? `Вы: ${meta.label.toLowerCase()}` : `${name} ${meta.verb}`}</T>
        <T v="tiny" tone="tertiary">
          {formatTime(m.created_at)} · нажмите, чтобы почувствовать
        </T>
      </View>
    </Tap>
  );
});

export function SystemRow({ m, chat, me }: { m: Message; chat: Chat | undefined; me: string | null }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', marginVertical: 8, paddingHorizontal: 30 }}>
      <View style={[styles.system, { backgroundColor: t.surface2 }]}>
        <T v="small" tone="secondary" center>
          {systemText(m, chat, me)}
        </T>
      </View>
    </View>
  );
}

export function DayPill({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', marginVertical: 12 }}>
      <View style={[styles.system, { backgroundColor: hexToRgba(t.surface, 0.9) }]}>
        <T v="small" tone="secondary">
          {label}
        </T>
      </View>
    </View>
  );
}

export function ExpiringHint({ seconds }: { seconds: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginVertical: 6 }}>
      <Icon icon={Hourglass} size={12} color={t.textTertiary} />
      <T v="small" tone="tertiary">
        Новые сообщения исчезнут через {formatCountdown(seconds * 1000)}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  incomingShadow: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end' },
  metaOverlay: {},
  metaAbs: { position: 'absolute', right: 11, bottom: 6 },
  metaOnMedia: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  bigMeta: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, marginTop: -2 },
  failed: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  quote: { flexDirection: 'row', gap: 8, borderRadius: 10, paddingVertical: 6, paddingRight: 10, marginBottom: 6, overflow: 'hidden' },
  quoteBar: { width: 3, borderRadius: 2, marginLeft: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  once: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingRight: 30 },
  onceIcon: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 240, paddingVertical: 2 },
  play: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 28 },
  rate: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  circlePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  circlePlay: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  circleMeta: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  onceBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  capsule: { width: 250, padding: 16, paddingTop: 18 },
  capsuleSeal: { position: 'absolute', top: 12, right: 12, width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  capsulePeek: { flexDirection: 'row', gap: 6, marginTop: 10, padding: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'flex-start' },
  capsuleOpen: { width: 270, padding: 14, borderWidth: 1.5 },
  touch: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, marginVertical: 4 },
  system: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
});
