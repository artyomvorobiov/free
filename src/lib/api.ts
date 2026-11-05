/**
 * Все операции с данными. В демо-режиме работают только с локальным состоянием.
 */
import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { toast, useUi } from '@/store/ui';

import { DEMO } from './config';
import { DEMO_ME, DEMO_PEOPLE, demoChats, demoMessages, demoReplyText, demoTouchBack } from './demo';
import { uuid } from './ids';
import { uploadMedia } from './media';
import { supabase } from './supabase';
import type { Chat, Message, MessageKind, MessageMeta, Profile, ProfileLite, ScheduledMessage, TouchKind } from './types';

export const MESSAGE_SELECT =
  '*, reactions(user_id, emoji), capsule:capsule_bodies(body), opens:view_once_opens(user_id), reply:reply_to(id, sender_id, kind, body)';
const PAGE = 40;

const me = () => useAuth.getState().userId ?? 'me';

export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/blocked/i.test(msg)) return 'Пользователь ограничил сообщения';
  if (/row-level security|forbidden|42501/i.test(msg)) return 'Нет доступа';
  if (/network|fetch/i.test(msg)) return 'Нет соединения с сервером';
  if (/too many touches/i.test(msg)) return 'Не так часто 🙂';
  if (/rate limit|429/i.test(msg)) return 'Слишком много попыток, подождите немного';
  return msg;
}

// ---------------------------------------------------------------- чаты

export async function loadChats() {
  if (DEMO) {
    if (!useChats.getState().loaded) useChats.getState().setAll(demoChats());
    return;
  }
  const { data, error } = await supabase.rpc('get_my_chats');
  if (error) throw error;
  useChats.getState().setAll((data ?? []) as Chat[]);
}

export async function openDirect(userId: string): Promise<string> {
  if (DEMO) {
    const found = Object.values(useChats.getState().byId).find(
      (c) => c.kind === 'direct' && c.members.some((m) => m.id === userId),
    );
    if (found) return found.id;
    const p = DEMO_PEOPLE.find((x) => x.id === userId);
    const id = 'c-' + uuid();
    useChats.getState().upsert({
      id,
      kind: 'direct',
      title: null,
      emoji: null,
      theme: 'default',
      disappear_seconds: null,
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      last_read_at: new Date().toISOString(),
      muted_until: null,
      snoozed_until: null,
      pinned_at: null,
      archived: false,
      members: [
        { ...DEMO_ME, role: 'member', seen_at: null, joined_at: new Date().toISOString() },
        ...(p ? [{ ...p, role: 'member' as const, seen_at: null, joined_at: new Date().toISOString() }] : []),
      ],
      last_message: null,
      unread: 0,
    });
    return id;
  }
  const { data, error } = await supabase.rpc('get_or_create_direct', { p_other: userId });
  if (error) throw error;
  if (!useChats.getState().byId[data as string]) await loadChats();
  return data as string;
}

export async function createGroup(title: string, emoji: string, memberIds: string[]): Promise<string> {
  if (DEMO) {
    const id = 'c-' + uuid();
    const now = new Date().toISOString();
    const members = DEMO_PEOPLE.filter((p) => memberIds.includes(p.id)).map((p) => ({
      ...p,
      role: 'member' as const,
      seen_at: null,
      joined_at: now,
    }));
    const sys: Message = blankMessage(id, 'system', { meta: { type: 'created', title } });
    useChats.getState().upsert({
      id,
      kind: 'group',
      title,
      emoji,
      theme: 'default',
      disappear_seconds: null,
      created_at: now,
      last_message_at: now,
      last_read_at: now,
      muted_until: null,
      snoozed_until: null,
      pinned_at: null,
      archived: false,
      members: [{ ...DEMO_ME, role: 'owner', seen_at: now, joined_at: now }, ...members],
      last_message: sys,
      unread: 0,
    });
    useMessages.getState().setInitial(id, [sys], false);
    return id;
  }
  const { data, error } = await supabase.rpc('create_group', { p_title: title, p_emoji: emoji, p_members: memberIds });
  if (error) throw error;
  await loadChats();
  return data as string;
}

export async function addMembers(chatId: string, ids: string[]) {
  if (DEMO) {
    const chat = useChats.getState().byId[chatId];
    if (!chat) return;
    const now = new Date().toISOString();
    const add = DEMO_PEOPLE.filter((p) => ids.includes(p.id) && !chat.members.some((m) => m.id === p.id));
    useChats.getState().patch(chatId, {
      members: [...chat.members, ...add.map((p) => ({ ...p, role: 'member' as const, seen_at: null, joined_at: now }))],
    });
    return;
  }
  const { error } = await supabase.rpc('add_members', { p_chat: chatId, p_members: ids });
  if (error) throw error;
  await loadChats();
}

export async function removeMember(chatId: string, userId: string) {
  if (DEMO) {
    const chat = useChats.getState().byId[chatId];
    if (chat) useChats.getState().patch(chatId, { members: chat.members.filter((m) => m.id !== userId) });
    return;
  }
  const { error } = await supabase.rpc('remove_member', { p_chat: chatId, p_user: userId });
  if (error) throw error;
  await loadChats();
}

export async function leaveChat(chatId: string) {
  if (!DEMO) {
    const { error } = await supabase.rpc('leave_chat', { p_chat: chatId });
    if (error) throw error;
  }
  useChats.getState().remove(chatId);
}

/** Общие настройки чата: название, эмодзи, тема, исчезающие сообщения */
export async function updateChat(
  chatId: string,
  patch: { title?: string; emoji?: string; theme?: string; disappear_seconds?: number | null },
) {
  const prev = useChats.getState().byId[chatId];
  useChats.getState().patch(chatId, patch);
  if (DEMO) {
    const type = patch.theme !== undefined ? 'theme' : patch.disappear_seconds !== undefined ? 'disappear' : patch.title ? 'title' : null;
    if (type) {
      const value = type === 'theme' ? patch.theme : type === 'disappear' ? patch.disappear_seconds ?? null : patch.title;
      addLocalMessage(blankMessage(chatId, 'system', { meta: { type, value } }));
    }
    return;
  }
  const { error } = await supabase.rpc('update_chat', { p_chat: chatId, p_patch: patch });
  if (error) {
    if (prev) useChats.getState().upsert(prev);
    throw error;
  }
}

/** Личные настройки чата: без звука, «ответить позже», закреп */
export async function setChatPrefs(
  chatId: string,
  patch: { muted_until?: string | null; snoozed_until?: string | null; pinned_at?: string | null; archived?: boolean },
) {
  const prev = useChats.getState().byId[chatId];
  useChats.getState().patch(chatId, patch);
  if (DEMO) return;
  const { error } = await supabase.from('chat_prefs').upsert({ chat_id: chatId, user_id: me(), ...patch });
  if (error) {
    if (prev) useChats.getState().upsert(prev);
    throw error;
  }
}

const readTimers: Record<string, ReturnType<typeof setTimeout>> = {};
export function markRead(chatId: string) {
  const chat = useChats.getState().byId[chatId];
  if (chat && chat.unread) useChats.getState().patch(chatId, { unread: 0, last_read_at: new Date().toISOString() });
  if (DEMO) return;
  clearTimeout(readTimers[chatId]);
  readTimers[chatId] = setTimeout(() => {
    supabase.rpc('mark_read', { p_chat: chatId }).then(({ error }) => {
      if (error) console.warn('mark_read', error.message);
    });
  }, 400);
}

// ---------------------------------------------------------------- сообщения

export async function loadMessages(chatId: string) {
  if (DEMO) {
    if (!useMessages.getState().get(chatId).loaded) useMessages.getState().setInitial(chatId, demoMessages(chatId), false);
    return;
  }
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (error) throw error;
  useMessages.getState().setInitial(chatId, (data ?? []) as Message[], (data?.length ?? 0) === PAGE);
}

export async function loadOlder(chatId: string) {
  const state = useMessages.getState().get(chatId);
  if (DEMO || !state.hasMore || state.loadingMore || !state.items.length) return;
  useMessages.getState().setLoadingMore(chatId, true);
  const oldest = state.items[state.items.length - 1].created_at;
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('chat_id', chatId)
    .lt('created_at', oldest)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (error) {
    useMessages.getState().setLoadingMore(chatId, false);
    return;
  }
  useMessages.getState().appendOlder(chatId, (data ?? []) as Message[], (data?.length ?? 0) === PAGE);
}

export async function fetchMessage(id: string): Promise<Message | null> {
  if (DEMO) return useMessages.getState().find(id);
  const { data } = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', id).maybeSingle();
  return (data as Message) ?? null;
}

function blankMessage(chatId: string, kind: MessageKind, patch: Partial<Message> = {}): Message {
  const chat = useChats.getState().byId[chatId];
  const now = new Date().toISOString();
  return {
    id: uuid(),
    chat_id: chatId,
    sender_id: me(),
    kind,
    body: null,
    media_path: null,
    meta: {},
    reply_to: null,
    view_once: false,
    silent: false,
    unlock_at: null,
    expires_at:
      chat?.disappear_seconds && kind !== 'system'
        ? new Date(Date.now() + chat.disappear_seconds * 1000).toISOString()
        : null,
    edited_at: null,
    created_at: now,
    reactions: [],
    ...patch,
  };
}

function addLocalMessage(m: Message) {
  useMessages.getState().upsert(m);
  useChats.getState().onMessage(m, me(), useUi.getState().activeChatId === m.chat_id);
}

export type Outgoing = {
  kind: Exclude<MessageKind, 'system' | 'capsule'>;
  body?: string;
  meta?: MessageMeta;
  replyTo?: Message | null;
  silent?: boolean;
  viewOnce?: boolean;
  /** локальный файл для фото/голосового/кружка */
  file?: { uri: string; ext: string; contentType: string };
};

const retryQueue = new Map<string, Outgoing & { chatId: string }>();

export async function sendMessage(chatId: string, out: Outgoing, existingId?: string): Promise<void> {
  const id = existingId ?? uuid();
  const local = blankMessage(chatId, out.kind, {
    id,
    body: out.body?.trim() || null,
    meta: out.meta ?? {},
    reply_to: out.replyTo?.id ?? null,
    reply: out.replyTo
      ? { id: out.replyTo.id, sender_id: out.replyTo.sender_id, kind: out.replyTo.kind, body: out.replyTo.body }
      : null,
    silent: !!out.silent,
    view_once: !!out.viewOnce,
    media_path: out.file ? `${chatId}/${id}.${out.file.ext}` : null,
    _localUri: out.file?.uri,
    _status: 'sending',
  });
  addLocalMessage(local);
  retryQueue.set(id, { ...out, chatId });

  if (DEMO) {
    setTimeout(() => {
      useMessages.getState().patch(chatId, id, { _status: undefined });
      retryQueue.delete(id);
      simulateReply(chatId, out.kind === 'touch' ? 'touch' : 'text');
    }, 350);
    return;
  }

  try {
    if (out.file) await uploadMedia(chatId, id, out.file.uri, out.file.ext, out.file.contentType);
    const { data, error } = await supabase
      .from('messages')
      .insert({
        id,
        chat_id: chatId,
        kind: out.kind,
        body: local.body,
        meta: local.meta,
        reply_to: local.reply_to,
        silent: local.silent,
        view_once: local.view_once,
        media_path: local.media_path,
      })
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    retryQueue.delete(id);
    const saved = { ...(data as Message), _status: undefined };
    useMessages.getState().upsert(saved);
    useChats.getState().onMessageUpdated(saved);
  } catch (e) {
    useMessages.getState().patch(chatId, id, { _status: 'failed' });
    toast(errorText(e), 'error');
  }
}

export async function retrySend(msg: Message) {
  const out = retryQueue.get(msg.id);
  if (!out) return;
  useMessages.getState().remove(msg.id);
  await sendMessage(out.chatId, out, msg.id);
}

export function discardFailed(msg: Message) {
  retryQueue.delete(msg.id);
  useMessages.getState().remove(msg.id);
}

export async function editMessage(msg: Message, body: string) {
  const text = body.trim();
  if (!text || text === msg.body) return;
  const edited_at = new Date().toISOString();
  useMessages.getState().patch(msg.chat_id, msg.id, { body: text, edited_at });
  useChats.getState().onMessageUpdated({ ...msg, body: text, edited_at });
  if (DEMO) return;
  const { error } = await supabase.from('messages').update({ body: text }).eq('id', msg.id);
  if (error) {
    useMessages.getState().patch(msg.chat_id, msg.id, { body: msg.body, edited_at: msg.edited_at });
    toast(errorText(error), 'error');
  }
}

export async function deleteMessage(msg: Message) {
  useMessages.getState().remove(msg.id);
  useChats.getState().onMessageDeleted(msg.id, (chatId) => useMessages.getState().latest(chatId));
  if (DEMO || msg._status) {
    retryQueue.delete(msg.id);
    return;
  }
  const { error } = await supabase.from('messages').delete().eq('id', msg.id);
  if (error) {
    useMessages.getState().upsert(msg);
    toast(errorText(error), 'error');
    return;
  }
  if (msg.media_path && msg.sender_id === me()) {
    supabase.storage.from('media').remove([msg.media_path]).catch(() => {});
  }
}

export async function react(msg: Message, emoji: string | null) {
  const uid = me();
  const prev = (msg.reactions ?? []).find((r) => r.user_id === uid) ?? null;
  const next = emoji && prev?.emoji !== emoji ? emoji : null;
  useMessages.getState().setReaction(msg.chat_id, msg.id, next ? { user_id: uid, emoji: next } : null, uid);
  if (DEMO || msg._status) return;
  const { error } = next
    ? await supabase.from('reactions').upsert({ message_id: msg.id, chat_id: msg.chat_id, user_id: uid, emoji: next })
    : await supabase.from('reactions').delete().eq('message_id', msg.id).eq('user_id', uid);
  if (error) {
    useMessages.getState().setReaction(msg.chat_id, msg.id, prev, uid);
    toast(errorText(error), 'error');
  }
}

export async function sendTouch(chatId: string, touch: TouchKind) {
  await sendMessage(chatId, { kind: 'touch', meta: { touch } });
}

/** Переслать сообщение в другой чат (медиа копируется в папку нового чата) */
export async function forwardMessage(msg: Message, toChatId: string, fromName: string) {
  const meta: MessageMeta = { ...msg.meta, forwarded_from: msg.meta.forwarded_from ?? fromName };
  if (msg.kind === 'capsule' || msg.kind === 'system') return;
  if (!msg.media_path || DEMO) {
    await sendMessage(toChatId, {
      kind: msg.kind,
      body: msg.body ?? undefined,
      meta,
      file: msg._localUri
        ? { uri: msg._localUri, ext: msg.media_path?.split('.').pop() ?? 'jpg', contentType: 'application/octet-stream' }
        : undefined,
    });
    return;
  }
  const id = uuid();
  const ext = msg.media_path.split('.').pop() ?? 'bin';
  const newPath = `${toChatId}/${id}.${ext}`;
  const { error: cpErr } = await supabase.storage.from('media').copy(msg.media_path, newPath);
  if (cpErr) throw cpErr;
  const { data, error } = await supabase
    .from('messages')
    .insert({ id, chat_id: toChatId, kind: msg.kind, body: msg.body, meta, media_path: newPath })
    .select(MESSAGE_SELECT)
    .single();
  if (error) throw error;
  addLocalMessage(data as Message);
}

// ---------------------------------------------------------------- капсулы и одноразовые

export async function sendCapsule(chatId: string, body: string, unlockAt: Date) {
  const id = uuid();
  const local = blankMessage(chatId, 'capsule', {
    id,
    unlock_at: unlockAt.toISOString(),
    capsule: { body },
    _status: 'sending',
  });
  addLocalMessage(local);
  if (DEMO) {
    setTimeout(() => useMessages.getState().patch(chatId, id, { _status: undefined }), 400);
    return;
  }
  const { error } = await supabase.rpc('send_capsule', {
    p_chat: chatId,
    p_body: body,
    p_unlock_at: unlockAt.toISOString(),
    p_id: id,
  });
  if (error) {
    useMessages.getState().remove(id);
    toast(errorText(error), 'error');
    return;
  }
  useMessages.getState().patch(chatId, id, { _status: undefined });
}

/** Загружает содержимое капсулы после открытия */
export async function fetchCapsule(msg: Message) {
  if (DEMO) {
    if (!msg.capsule) {
      useMessages.getState().patch(msg.chat_id, msg.id, {
        capsule: { body: 'Это послание ждало своего часа ✨ С днём рождения! Пусть этот год будет самым тёплым.' },
      });
    }
    return;
  }
  const { data } = await supabase.from('capsule_bodies').select('body').eq('message_id', msg.id).maybeSingle();
  if (data) useMessages.getState().patch(msg.chat_id, msg.id, { capsule: data as { body: string } });
}

export async function markViewOnceOpened(msg: Message) {
  const uid = me();
  useMessages.getState().addOpen(msg.id, uid);
  if (DEMO) return;
  await supabase.rpc('open_view_once', { p_message: msg.id });
}

// ---------------------------------------------------------------- отложенные

export async function scheduleMessage(chatId: string, body: string, sendAt: Date, silent = false) {
  if (DEMO) {
    const delay = Math.max(1000, sendAt.getTime() - Date.now());
    if (delay < 10 * 60_000) setTimeout(() => sendMessage(chatId, { kind: 'text', body, silent, meta: { scheduled: true } }), delay);
    demoScheduled.push({ id: uuid(), chat_id: chatId, sender_id: 'me', body, send_at: sendAt.toISOString(), silent, created_at: new Date().toISOString() });
    return;
  }
  const { error } = await supabase
    .from('scheduled_messages')
    .insert({ chat_id: chatId, body, send_at: sendAt.toISOString(), silent });
  if (error) throw error;
}

const demoScheduled: ScheduledMessage[] = [];

export async function listScheduled(chatId: string): Promise<ScheduledMessage[]> {
  if (DEMO) return demoScheduled.filter((s) => s.chat_id === chatId && new Date(s.send_at) > new Date());
  const { data } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('send_at', { ascending: true });
  return (data ?? []) as ScheduledMessage[];
}

export async function cancelScheduled(id: string) {
  if (DEMO) {
    const i = demoScheduled.findIndex((s) => s.id === id);
    if (i >= 0) demoScheduled.splice(i, 1);
    return;
  }
  const { error } = await supabase.from('scheduled_messages').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------- люди и профиль

export async function searchUsers(q: string): Promise<ProfileLite[]> {
  const query = q.trim().replace(/^@/, '').toLowerCase();
  if (query.length < 2) return [];
  if (DEMO) {
    return DEMO_PEOPLE.filter(
      (p) => p.username?.startsWith(query) || p.display_name.toLowerCase().includes(query),
    );
  }
  const { data, error } = await supabase.rpc('search_users', { p_query: query });
  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

export async function getProfile(id: string): Promise<ProfileLite | null> {
  if (DEMO) return DEMO_PEOPLE.find((p) => p.id === id) ?? (id === 'me' ? DEMO_ME : null);
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  return (data as ProfileLite) ?? null;
}

export async function isUsernameAvailable(username: string) {
  if (DEMO) return !DEMO_PEOPLE.some((p) => p.username === username.toLowerCase());
  const { data } = await supabase.rpc('is_username_available', { p_username: username });
  return !!data;
}

export async function updateProfile(patch: Partial<Profile>) {
  const prev = useAuth.getState().profile;
  useAuth.getState().patchProfile(patch);
  if (DEMO) return;
  const { error } = await supabase.from('profiles').update(patch).eq('id', me());
  if (error) {
    if (prev) useAuth.getState().set({ profile: prev });
    throw error;
  }
}

export async function setStatus(s: { emoji: string; text: string; until: Date | null; quiet: boolean } | null) {
  await updateProfile({
    status_emoji: s?.emoji ?? null,
    status_text: s?.text ?? null,
    status_until: s?.until ? s.until.toISOString() : null,
    status_quiet: s?.quiet ?? false,
  });
}

export async function touchPresence() {
  if (DEMO) return;
  const p = useAuth.getState().profile;
  if (!p || !p.show_last_seen) return;
  await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', p.id);
}

// ---------------------------------------------------------------- безопасность

export async function blockUser(userId: string) {
  if (DEMO) return;
  const { error } = await supabase.from('blocks').upsert({ blocker: me(), blocked: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string) {
  if (DEMO) return;
  const { error } = await supabase.from('blocks').delete().eq('blocked', userId).eq('blocker', me());
  if (error) throw error;
}

export async function listBlocked(): Promise<ProfileLite[]> {
  if (DEMO) return [];
  const { data } = await supabase.from('blocks').select('blocked').eq('blocker', me());
  const ids = (data ?? []).map((r: { blocked: string }) => r.blocked);
  if (!ids.length) return [];
  const { data: people } = await supabase.from('profiles').select('*').in('id', ids);
  return (people ?? []) as ProfileLite[];
}

export async function isBlocked(userId: string) {
  if (DEMO) return false;
  const { data } = await supabase.from('blocks').select('blocked').eq('blocker', me()).eq('blocked', userId).maybeSingle();
  return !!data;
}

export async function report(targetUser: string | null, messageId: string | null, reason: string) {
  if (DEMO) return;
  const { error } = await supabase.from('reports').insert({ target_user: targetUser, message_id: messageId, reason });
  if (error) throw error;
}

// ---------------------------------------------------------------- демо-ответы

function simulateReply(chatId: string, kind: 'text' | 'touch') {
  const chat = useChats.getState().byId[chatId];
  if (!chat || chat.kind === 'self') return;
  const other = chat.members.find((m) => m.id !== 'me');
  if (!other) return;
  setTimeout(() => useUi.getState().setTyping(chatId, other.id, 'text'), 900);
  setTimeout(() => {
    useUi.getState().setTyping(chatId, other.id, null);
    const reply =
      kind === 'touch'
        ? blankMessage(chatId, 'touch', { sender_id: other.id, meta: { touch: demoTouchBack() } })
        : blankMessage(chatId, 'text', { sender_id: other.id, body: demoReplyText() });
    addLocalMessage(reply);
    if (useUi.getState().activeChatId === chatId) {
      useChats.getState().patch(chatId, {
        members: chat.members.map((m) => (m.id === 'me' ? m : { ...m, seen_at: new Date().toISOString() })),
      });
    }
    if (reply.kind === 'touch') {
      useUi.getState().showTouch({ chatId, kind: reply.meta.touch ?? 'heart', from: other.display_name, at: Date.now() });
    }
  }, 2600);
}
