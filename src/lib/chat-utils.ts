import { TOUCHES } from './haptics';
import { disappearLabel, formatDuration } from './time';
import type { Chat, Member, Message, TouchKind } from './types';
import { chatThemeById } from '@/theme/tokens';

export function peerOf(chat: Chat, me: string | null): Member | undefined {
  if (chat.kind !== 'direct') return undefined;
  return chat.members.find((m) => m.id !== me);
}

export function chatTitle(chat: Chat, me: string | null) {
  if (chat.kind === 'self') return 'Заметки';
  if (chat.kind === 'group') return chat.title || 'Группа';
  const p = peerOf(chat, me);
  return p ? p.display_name || (p.username ? '@' + p.username : 'Без имени') : 'Удалённый аккаунт';
}

export function memberName(chat: Chat | undefined, id: string | null, me: string | null) {
  if (!id) return 'Удалённый аккаунт';
  if (id === me) return 'Вы';
  return chat?.members.find((m) => m.id === id)?.display_name || 'Участник';
}

export function statusActive(p?: { status_until: string | null; status_text: string | null; status_emoji: string | null }) {
  if (!p || (!p.status_text && !p.status_emoji)) return false;
  return !p.status_until || new Date(p.status_until).getTime() > Date.now();
}

/** Текст системного сообщения */
export function systemText(m: Message, chat: Chat | undefined, me: string | null) {
  const who = memberName(chat, m.sender_id, me);
  const meta = m.meta ?? {};
  switch (meta.type) {
    case 'created':
      return `${who} ${who === 'Вы' ? 'создали' : 'создал(а)'} группу «${meta.title ?? chat?.title ?? ''}»`;
    case 'added':
      return `${who} ${who === 'Вы' ? 'добавили' : 'добавил(а)'} ${memberName(chat, meta.user_id ?? null, me)}`;
    case 'removed':
      return `${who} ${who === 'Вы' ? 'исключили' : 'исключил(а)'} ${memberName(chat, meta.user_id ?? null, me)}`;
    case 'left':
      return `${who} ${who === 'Вы' ? 'покинули' : 'покинул(а)'} группу`;
    case 'title':
      return `${who} ${who === 'Вы' ? 'переименовали' : 'переименовал(а)'} группу в «${meta.value}»`;
    case 'theme': {
      const th = chatThemeById(String(meta.value ?? 'default'));
      return `${who} ${who === 'Вы' ? 'сменили' : 'сменил(а)'} тему чата: ${th.emoji} ${th.name}`;
    }
    case 'disappear':
      return meta.value
        ? `⏳ ${who} ${who === 'Вы' ? 'включили' : 'включил(а)'} исчезающие сообщения: ${disappearLabel(Number(meta.value))}`
        : `${who} ${who === 'Вы' ? 'выключили' : 'выключил(а)'} исчезающие сообщения`;
    default:
      return 'Изменения в чате';
  }
}

/** Короткое описание сообщения для списка чатов и ответов */
export function preview(m: Message | null | undefined, chat?: Chat, me?: string | null): string {
  if (!m) return '';
  switch (m.kind) {
    case 'text':
      return (m.body ?? '').replace(/\s+/g, ' ');
    case 'image':
      return m.view_once ? '📷 Одноразовое фото' : m.body ? `📷 ${m.body}` : '📷 Фото';
    case 'voice':
      return `🎤 Голосовое${m.meta?.duration ? ' · ' + formatDuration(m.meta.duration) : ''}`;
    case 'circle':
      return m.view_once ? '⭕ Одноразовый кружок' : `⭕ Кружок${m.meta?.duration ? ' · ' + formatDuration(m.meta.duration) : ''}`;
    case 'touch': {
      const t = TOUCHES[(m.meta?.touch ?? 'heart') as TouchKind];
      return `${t.emoji} ${t.label}`;
    }
    case 'capsule':
      return m.unlock_at && new Date(m.unlock_at) > new Date() ? '💌 Капсула времени' : `💌 ${m.capsule?.body ?? 'Капсула открыта'}`;
    case 'system':
      return systemText(m, chat, me ?? null);
    default:
      return '';
  }
}
