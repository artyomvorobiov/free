/**
 * Демо-режим: приложение работает без сервера, чтобы можно было
 * сразу посмотреть дизайн и функции. Ничего никуда не отправляется.
 */
import type { Chat, Member, Message, Profile, ProfileLite, TouchKind } from './types';

export const DEMO_ME: Profile = {
  id: 'me',
  username: 'you',
  display_name: 'Вы',
  avatar_url: null,
  bio: 'Пробую «Близко» в демо-режиме',
  status_emoji: null,
  status_text: null,
  status_until: null,
  status_quiet: false,
  last_seen_at: new Date().toISOString(),
  show_last_seen: true,
  read_receipts: true,
  push_preview: true,
  created_at: new Date().toISOString(),
};

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const people: Record<string, ProfileLite> = {
  masha: {
    id: 'masha',
    username: 'masha',
    display_name: 'Маша',
    avatar_url: null,
    bio: 'Иллюстратор. Люблю горы и кофе',
    status_emoji: '🎧',
    status_text: 'В фокусе — отвечу позже',
    status_until: later(150),
    status_quiet: true,
    last_seen_at: ago(12),
  },
  artem: {
    id: 'artem',
    username: 'artem',
    display_name: 'Артём',
    avatar_url: null,
    bio: '',
    status_emoji: null,
    status_text: null,
    status_until: null,
    last_seen_at: ago(0.5),
  },
  liza: {
    id: 'liza',
    username: 'liza.k',
    display_name: 'Лиза',
    avatar_url: null,
    bio: '',
    status_emoji: '✈️',
    status_text: 'В отпуске',
    status_until: later(60 * 24 * 3),
    last_seen_at: ago(60 * 26),
  },
  mom: {
    id: 'mom',
    username: 'mama',
    display_name: 'Мама',
    avatar_url: null,
    bio: '',
    status_emoji: null,
    status_text: null,
    status_until: null,
    last_seen_at: ago(40),
  },
};

export const DEMO_PEOPLE = Object.values(people);

const member = (p: ProfileLite, role: Member['role'] = 'member', seenMin = 0): Member => ({
  ...p,
  role,
  seen_at: ago(seenMin),
  joined_at: ago(60 * 24 * 30),
});
const meMember = (): Member => member(DEMO_ME, 'member', 0);

let seq = 0;
function msg(chat: string, sender: string | null, min: number, patch: Partial<Message>): Message {
  seq += 1;
  return {
    id: `demo-${chat}-${seq}`,
    chat_id: chat,
    sender_id: sender,
    kind: 'text',
    body: null,
    media_path: null,
    meta: {},
    reply_to: null,
    view_once: false,
    silent: false,
    unlock_at: null,
    expires_at: null,
    edited_at: null,
    created_at: ago(min),
    reactions: [],
    ...patch,
  };
}

const wave = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => Math.max(0.12, Math.abs(Math.sin(i * 0.55 + seed) * Math.cos(i * 0.21 + seed * 2))));

function buildMessages(): Record<string, Message[]> {
  const masha = [
    msg('c-masha', 'masha', 60 * 26, { body: 'Привет! Как прошла неделя? 🌿' }),
    msg('c-masha', 'me', 60 * 25.8, { body: 'Насыщенно 😅 Закрыла наконец проект' }),
    msg('c-masha', 'masha', 60 * 25.7, { body: 'Ура!! Надо отметить', reactions: [{ user_id: 'me', emoji: '❤️' }] }),
    msg('c-masha', 'masha', 60 * 3, {
      kind: 'capsule',
      unlock_at: later(60 * 24 * 2 + 37),
      meta: {},
    }),
    msg('c-masha', 'masha', 60 * 2.9, { body: 'Не открывай раньше времени 😏 Это на твой день рождения' }),
    msg('c-masha', 'me', 60 * 2.5, { kind: 'touch', meta: { touch: 'heart' } }),
    msg('c-masha', 'masha', 34, {
      kind: 'voice',
      media_path: 'demo/voice.m4a',
      meta: { duration: 23, waveform: wave(48, 1.3) },
    }),
    msg('c-masha', 'masha', 33, { body: 'Короче, в субботу идём на выставку? Я возьму билеты 🎟' }),
  ];
  const artem = [
    msg('c-artem', 'artem', 60 * 30, { kind: 'system', meta: { type: 'disappear', value: 86400 } }),
    msg('c-artem', 'artem', 50, { body: 'Скинь адрес, я уже выезжаю', expires_at: later(60 * 23) }),
    msg('c-artem', 'me', 49, { body: 'Ленина 12, второй подъезд', expires_at: later(60 * 23) }),
    msg('c-artem', 'artem', 4, { body: 'Буду минут через 10 🚗', expires_at: later(60 * 24) }),
  ];
  const group = [
    msg('c-trip', 'artem', 60 * 48, { kind: 'system', meta: { type: 'created', title: 'Поход на Алтай' } }),
    msg('c-trip', 'liza', 60 * 47, { body: 'Кто берёт палатку?' }),
    msg('c-trip', 'artem', 60 * 46.5, { body: 'Я! И горелку тоже', reactions: [{ user_id: 'liza', emoji: '🔥' }, { user_id: 'me', emoji: '🔥' }] }),
    msg('c-trip', 'masha', 60 * 5, { body: 'Билеты на поезд взяла ✅ Отправление в 7:40' }),
    msg('c-trip', 'liza', 60 * 4.8, {
      kind: 'capsule',
      unlock_at: ago(10),
      capsule: { body: 'Привет из прошлого! Если вы это читаете — мы уже на Алтае 🏔 Не забудьте сделать общее фото у озера.' },
    }),
    msg('c-trip', 'artem', 18, { body: 'Предлагаю созвониться вечером и всё обсудить' }),
  ];
  const mom = [
    msg('c-mom', 'me', 60 * 30, { body: 'Мам, привет! Всё хорошо, позвоню вечером' }),
    msg('c-mom', 'mom', 60 * 6, { body: 'Ты обедал? Не забудь купить хлеб 🍞' }),
  ];
  const notes = [
    msg('c-self', 'me', 60 * 72, { body: 'Идеи для подарка Маше: плёночный фотоаппарат, набор акварели' }),
    msg('c-self', 'me', 60 * 20, { body: 'Не забыть: продлить загранпаспорт' }),
  ];
  return { 'c-masha': masha, 'c-artem': artem, 'c-trip': group, 'c-mom': mom, 'c-self': notes };
}

let store: Record<string, Message[]> | null = null;
export function demoMessages(chatId: string): Message[] {
  if (!store) store = buildMessages();
  return [...(store[chatId] ?? [])].reverse();
}

export function demoChats(): Chat[] {
  if (!store) store = buildMessages();
  const last = (id: string) => store![id][store![id].length - 1] ?? null;
  const base = (id: string, patch: Partial<Chat>): Chat => ({
    id,
    kind: 'direct',
    title: null,
    emoji: null,
    theme: 'default',
    disappear_seconds: null,
    created_at: ago(60 * 24 * 30),
    last_message_at: last(id)?.created_at ?? ago(60 * 24 * 30),
    last_read_at: ago(60 * 24),
    muted_until: null,
    snoozed_until: null,
    pinned_at: null,
    archived: false,
    members: [],
    last_message: last(id),
    unread: 0,
    ...patch,
  });
  return [
    base('c-self', { kind: 'self', members: [meMember()], pinned_at: ago(60 * 24 * 10) }),
    base('c-masha', { theme: 'sunset', members: [meMember(), member(people.masha, 'member', 60 * 2.6)], unread: 2 }),
    base('c-artem', { disappear_seconds: 86400, members: [meMember(), member(people.artem, 'member', 49)], unread: 1 }),
    base('c-trip', {
      kind: 'group',
      title: 'Поход на Алтай',
      emoji: '🏔',
      theme: 'forest',
      members: [member(people.artem, 'owner'), meMember(), member(people.masha), member(people.liza)],
      unread: 3,
    }),
    base('c-mom', { members: [meMember(), member(people.mom, 'member', 60 * 29)], unread: 0, last_read_at: ago(60) }),
  ];
}

const REPLIES = [
  'Ага, понял(а) 👌',
  'Звучит отлично!',
  'Ха-ха, точно 😄',
  'Давай так и сделаем',
  'Сейчас посмотрю и напишу',
  'Ого, круто!',
  'Спасибо ❤️',
  'Договорились 🙌',
];

export function demoReplyText() {
  return REPLIES[Math.floor(Math.random() * REPLIES.length)];
}

export function demoTouchBack(): TouchKind {
  const all: TouchKind[] = ['heart', 'hug', 'spark'];
  return all[Math.floor(Math.random() * all.length)];
}
