/**
 * Логика звонков.
 *
 * Сигналинг идёт через Supabase: строка в таблице `calls` хранит статус и
 * параметры соединения (SDP). Изменения приходят через Realtime, а на случай
 * сбоя каждые 1,5 с строку перечитываем. Сам звук и видео идут напрямую между
 * телефонами (WebRTC), через TURN — если прямое соединение невозможно.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Camera } from 'expo-camera';
import { router } from 'expo-router';

import { useAuth } from '@/store/auth';
import { useCall, type CallEndReason } from '@/store/call';
import { useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { toast, useUi } from '@/store/ui';

import { errorText, getProfile } from '../api';
import { chatTitle, peerOf } from '../chat-utils';
import { DEMO } from '../config';
import { haptic } from '../haptics';
import { uuid } from '../ids';
import { supabase } from '../supabase';
import type { Message } from '../types';
import { createPeer, getLocalStream, rtcAvailable, switchCamera } from './rtc';
import { callAudio } from './sounds';
import { FINAL_STATUSES, type CallRow, type IceServer, type PeerLike, type SessionDescription } from './types';

const RING_TIMEOUT_MS = 45_000;
const ICE_GATHER_MS = 2500;
const POLL_MS = 1500;
const HEARTBEAT_MS = 15_000;
const RECONNECT_GRACE_MS = 12_000;
const DEFAULT_ICE: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

let pc: PeerLike | null = null;
let row: CallRow | null = null;
let channel: RealtimeChannel | null = null;
let connectedOnce = false;
let answerApplied = false;
let accepting = false;
let ending = false;
let screenOpen = false;
let iceCache: { servers: IceServer[]; at: number } | null = null;
const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

const st = () => useCall.getState();
const me = () => useAuth.getState().userId;

function clearTimer(name: string) {
  if (timers[name]) {
    clearTimeout(timers[name]);
    clearInterval(timers[name]);
    timers[name] = undefined;
  }
}
function clearAllTimers() {
  Object.keys(timers).forEach(clearTimer);
}

export function setCallScreenOpen(open: boolean) {
  screenOpen = open;
}
function openScreen() {
  if (!screenOpen) router.push('/call');
}

export function callsSupported() {
  return DEMO || rtcAvailable();
}

// ---------------------------------------------------------------- вспомогательное

async function iceServers(): Promise<IceServer[]> {
  if (iceCache && Date.now() - iceCache.at < 10 * 60_000) return iceCache.servers;
  const { data, error } = await supabase.rpc('get_ice_servers');
  const servers = !error && Array.isArray(data) && data.length ? (data as IceServer[]) : DEFAULT_ICE;
  iceCache = { servers, at: Date.now() };
  return servers;
}

function waitIceGathering(peer: PeerLike, ms = ICE_GATHER_MS) {
  return new Promise<void>((resolve) => {
    if (peer.iceGatheringState === 'complete') return resolve();
    const done = () => {
      clearTimeout(t);
      peer.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (peer.iceGatheringState === 'complete') done();
    };
    const t = setTimeout(done, ms);
    peer.addEventListener('icegatheringstatechange', check);
  });
}

const sdp = (p: PeerLike): SessionDescription => ({ type: p.localDescription!.type, sdp: p.localDescription!.sdp });

async function ensurePermissions(video: boolean): Promise<boolean> {
  try {
    const mic = await Camera.requestMicrophonePermissionsAsync();
    if (!mic.granted) {
      toast('Разрешите доступ к микрофону в настройках', 'error');
      return false;
    }
    if (video) {
      const cam = await Camera.requestCameraPermissionsAsync();
      if (!cam.granted) {
        toast('Разрешите доступ к камере в настройках', 'error');
        return false;
      }
    }
    return true;
  } catch {
    return true; // на вебе разрешение спросит сам браузер
  }
}

async function peerFor(chatId: string, userId: string) {
  const chat = useChats.getState().byId[chatId];
  const m = chat?.members.find((x) => x.id === userId);
  if (m) return { id: m.id, name: m.display_name || '@' + (m.username ?? ''), avatar: m.avatar_url };
  const p = await getProfile(userId).catch(() => null);
  return { id: userId, name: p?.display_name || 'Собеседник', avatar: p?.avatar_url ?? null };
}

async function fetchRow(id: string): Promise<CallRow | null> {
  const { data } = await supabase.from('calls').select('*').eq('id', id).maybeSingle();
  return (data as CallRow) ?? null;
}

function startPolling() {
  clearTimer('poll');
  timers.poll = setInterval(async () => {
    if (!row || ending) return;
    const fresh = await fetchRow(row.id).catch(() => null);
    if (fresh) onCallRow(fresh);
  }, POLL_MS);
}

function startHeartbeat() {
  clearTimer('heartbeat');
  const beat = () => row && supabase.rpc('call_heartbeat', { p_call: row.id }).then(() => {}, () => {});
  beat();
  timers.heartbeat = setInterval(beat, HEARTBEAT_MS);
}

function joinChannel(callId: string) {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel(`call:${callId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload as { muted?: boolean; cameraOff?: boolean };
      st().set({ remoteMuted: !!p.muted, remoteCameraOff: !!p.cameraOff });
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') shareState();
    });
}

function shareState() {
  const s = st();
  channel?.send({ type: 'broadcast', event: 'state', payload: { muted: s.muted, cameraOff: s.cameraOff } }).catch(() => {});
}

function wirePeer(peer: PeerLike) {
  peer.addEventListener('track', (e: { streams?: unknown[] }) => {
    const stream = e.streams?.[0];
    if (stream) st().set({ remoteStream: stream as never, remoteVersion: st().remoteVersion + 1 });
  });
  const onState = () => {
    if (!pc || ending) return;
    const ice = peer.iceConnectionState;
    const conn = peer.connectionState;
    if (conn === 'connected' || ice === 'connected' || ice === 'completed') {
      clearTimer('reconnect');
      if (!connectedOnce) {
        connectedOnce = true;
        clearTimer('poll');
        clearTimer('ring');
        callAudio.stopRingback();
        st().set({ phase: 'active', startedAt: Date.now(), reconnecting: false });
        haptic.success();
        shareState();
      } else st().set({ reconnecting: false });
    } else if (conn === 'failed' || ice === 'failed') {
      hangup(connectedOnce ? undefined : 'failed');
    } else if (conn === 'disconnected' || ice === 'disconnected') {
      st().set({ reconnecting: true });
      if (!timers.reconnect) timers.reconnect = setTimeout(() => hangup(connectedOnce ? undefined : 'failed'), RECONNECT_GRACE_MS);
    }
  };
  peer.addEventListener('connectionstatechange', onState);
  peer.addEventListener('iceconnectionstatechange', onState);
}

async function setupPeer(video: boolean) {
  const local = await getLocalStream(video, 'user');
  st().set({ localStream: local });
  const peer = createPeer(await iceServers());
  pc = peer;
  wirePeer(peer);
  for (const track of local.getTracks()) peer.addTrack(track, local);
  return peer;
}

// ---------------------------------------------------------------- исходящий

export async function startCall(chatId: string, video: boolean) {
  if (st().phase !== 'idle') {
    toast('Сначала завершите текущий звонок', 'info', '📞');
    return;
  }
  const chat = useChats.getState().byId[chatId];
  const peerMember = chat ? peerOf(chat, me()) : undefined;
  if (!chat || chat.kind !== 'direct' || !peerMember) {
    toast('Звонить можно в личных чатах', 'info');
    return;
  }
  const peer = { id: peerMember.id, name: chatTitle(chat, me()), avatar: peerMember.avatar_url };

  if (DEMO) return startDemoCall(chatId, peer, video);
  if (!rtcAvailable()) {
    toast('Звонки работают в установленной версии приложения (TestFlight / App Store), а не в Expo Go', 'info', '📞');
    return;
  }
  if (!(await ensurePermissions(video))) return;

  resetFlags();
  st().set({ phase: 'outgoing', direction: 'out', video, chatId, peer, speaker: video, cameraOff: false, facing: 'user' });
  openScreen();

  try {
    const { data, error } = await supabase.rpc('start_call', { p_chat: chatId, p_video: video });
    if (error) throw error;
    row = data as CallRow;
    st().set({ callId: row.id });
    if (row.status === 'busy') {
      finish('busy');
      return;
    }
    callAudio.startSession(video, true);
    if (video) callAudio.setSpeaker(true);
    joinChannel(row.id);
    const peerConn = await setupPeer(video);
    const offer = await peerConn.createOffer({});
    await peerConn.setLocalDescription(offer);
    await waitIceGathering(peerConn);
    if (ending || !row) return;
    const { error: offerErr } = await supabase.rpc('call_set_offer', { p_call: row.id, p_offer: sdp(peerConn) });
    if (offerErr) throw offerErr;
    startPolling();
    timers.ring = setTimeout(() => hangup('missed'), RING_TIMEOUT_MS);
  } catch (e) {
    toast(errorText(e), 'error');
    hangup('failed');
  }
}

async function applyAnswer(answer: SessionDescription) {
  if (!pc || answerApplied) return;
  answerApplied = true;
  clearTimer('ring');
  callAudio.stopRingback();
  st().set({ phase: 'connecting' });
  try {
    await pc.setRemoteDescription(answer);
    startHeartbeat();
  } catch (e) {
    console.warn('applyAnswer', e);
    hangup('failed');
  }
}

// ---------------------------------------------------------------- входящий

async function onIncoming(r: CallRow) {
  if (!rtcAvailable()) {
    const p = await peerFor(r.chat_id, r.caller_id);
    toast(`${p.name} звонит вам — ответить можно в установленной версии приложения`, 'info', '📞');
    return;
  }
  resetFlags();
  row = r;
  const peer = await peerFor(r.chat_id, r.caller_id);
  if (row?.id !== r.id || st().phase !== 'idle') return;
  st().set({ phase: 'incoming', direction: 'in', video: r.video, chatId: r.chat_id, callId: r.id, peer, speaker: r.video });
  callAudio.startRingtone();
  openScreen();
  startPolling();
  timers.ring = setTimeout(() => finish('missed'), RING_TIMEOUT_MS + 5000);
}

export async function acceptCall() {
  if (!row || accepting || st().phase !== 'incoming') return;
  accepting = true;
  callAudio.stopRingtone();
  clearTimer('ring');
  const video = row.video;
  st().set({ phase: 'connecting' });
  if (!(await ensurePermissions(video))) {
    declineCall();
    return;
  }
  try {
    callAudio.startSession(video, false);
    if (video) callAudio.setSpeaker(true);
    joinChannel(row.id);
    const peerConn = await setupPeer(video);
    let offer = row.offer;
    for (let i = 0; !offer && i < 20 && !ending; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const fresh = row ? await fetchRow(row.id) : null;
      if (fresh && FINAL_STATUSES.includes(fresh.status)) return finish(reasonFromRow(fresh));
      offer = fresh?.offer ?? null;
    }
    if (!offer || ending || !row) {
      if (!ending) hangup('failed');
      return;
    }
    await peerConn.setRemoteDescription(offer);
    const answer = await peerConn.createAnswer();
    await peerConn.setLocalDescription(answer);
    await waitIceGathering(peerConn);
    if (ending || !row) return;
    const { data, error } = await supabase.rpc('answer_call', { p_call: row.id, p_answer: sdp(peerConn) });
    if (error) {
      // звонящий успел положить трубку
      const fresh = await fetchRow(row.id);
      finish(fresh ? reasonFromRow(fresh) : 'canceled');
      return;
    }
    row = data as CallRow;
    startHeartbeat();
  } catch (e) {
    toast(errorText(e), 'error');
    hangup('failed');
  }
}

export function declineCall() {
  if (!row) return finish('declined');
  supabase.rpc('end_call', { p_call: row.id, p_reason: null }).then(() => {}, () => {});
  finish('declined');
}

// ---------------------------------------------------------------- события с сервера

function reasonFromRow(r: CallRow): CallEndReason {
  const mine = r.caller_id === me();
  switch (r.status) {
    case 'declined':
      return 'declined';
    case 'busy':
      return 'busy';
    case 'missed':
      return 'missed';
    case 'canceled':
      return mine ? 'canceled' : 'missed';
    case 'ended':
      return 'ended';
    case 'failed':
      return 'failed';
    default:
      return 'ended';
  }
}

/** Новая версия строки звонка (из Realtime, push или опроса) */
export function onCallRow(r: CallRow) {
  const uid = me();
  if (!uid || (r.caller_id !== uid && r.callee_id !== uid)) return;
  if (!row || row.id !== r.id) {
    if (r.callee_id === uid && r.status === 'ringing') {
      if (st().phase === 'ended') {
        // предыдущий звонок только что закончился — сразу готовы принять новый
        clearAllTimers();
        row = null;
        ending = false;
        useCall.getState().reset();
      }
      if (st().phase === 'idle') onIncoming(r);
      else if (st().callId !== r.id) supabase.rpc('end_call', { p_call: r.id, p_reason: 'busy' }).then(() => {}, () => {});
    }
    return;
  }
  row = r;
  if (FINAL_STATUSES.includes(r.status)) {
    finish(reasonFromRow(r));
    return;
  }
  const s = st();
  if (s.direction === 'out' && r.status === 'accepted' && r.answer) applyAnswer(r.answer);
}

export async function refreshCall(id: string) {
  const fresh = await fetchRow(id).catch(() => null);
  if (fresh) onCallRow(fresh);
}

/** Нажали на push о звонке: если ещё звонит — показываем входящий, иначе открываем чат */
export async function openFromPush(callId: string, chatId?: string) {
  const fresh = await fetchRow(callId).catch(() => null);
  if (fresh?.status === 'ringing' && fresh.callee_id === me()) {
    onCallRow(fresh);
    return;
  }
  const id = fresh?.chat_id ?? chatId;
  if (id) router.push({ pathname: '/chat/[id]', params: { id } });
}

/** Есть ли звонок, который звонит прямо сейчас (при открытии приложения) */
export async function checkIncomingCalls() {
  const uid = me();
  if (DEMO || !uid || st().phase !== 'idle') return;
  const since = new Date(Date.now() - 55_000).toISOString();
  const { data } = await supabase
    .from('calls')
    .select('*')
    .eq('callee_id', uid)
    .eq('status', 'ringing')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  const r = (data?.[0] as CallRow | undefined) ?? null;
  if (r) onCallRow(r);
}

// ---------------------------------------------------------------- управление

export function hangup(reason?: 'missed' | 'failed') {
  if (st().demo) {
    finishDemo();
    return;
  }
  if (row && !FINAL_STATUSES.includes(row.status)) {
    supabase.rpc('end_call', { p_call: row.id, p_reason: reason ?? null }).then(() => {}, () => {});
  }
  const s = st();
  const local: CallEndReason =
    reason === 'missed' ? 'missed' : reason === 'failed' ? 'failed' : s.direction === 'out' && !connectedOnce && !answerApplied ? 'canceled' : 'ended';
  finish(local);
}

export function toggleMute() {
  const muted = !st().muted;
  st().localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  st().set({ muted });
  shareState();
  haptic.tap();
}

export function toggleCamera() {
  const cameraOff = !st().cameraOff;
  st().localStream?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
  st().set({ cameraOff });
  shareState();
  haptic.tap();
}

export function flipCamera() {
  switchCamera(st().localStream?.getVideoTracks()[0]);
  st().set({ facing: st().facing === 'user' ? 'environment' : 'user' });
  haptic.tap();
}

export function toggleSpeaker() {
  const speaker = !st().speaker;
  callAudio.setSpeaker(speaker);
  st().set({ speaker });
  haptic.tap();
}

// ---------------------------------------------------------------- завершение

function resetFlags() {
  connectedOnce = false;
  answerApplied = false;
  accepting = false;
  ending = false;
}

function finish(reason: CallEndReason) {
  if (ending || st().phase === 'idle') return;
  ending = true;
  clearAllTimers();
  callAudio.stopRingtone();
  callAudio.stopRingback();
  callAudio.stopSession(reason === 'busy');
  try {
    pc?.close();
  } catch {}
  pc = null;
  st().localStream?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {}
  });
  if (channel) supabase.removeChannel(channel);
  channel = null;
  if (reason !== 'ended') haptic.warning();
  st().set({ phase: 'ended', endReason: reason, endedAt: Date.now(), localStream: null, reconnecting: false });
  timers.close = setTimeout(() => {
    row = null;
    useCall.getState().reset();
    ending = false;
  }, 1800);
}

// ---------------------------------------------------------------- демо-режим (без сервера)

function startDemoCall(chatId: string, peer: { id: string; name: string; avatar: string | null }, video: boolean) {
  resetFlags();
  st().set({ phase: 'outgoing', direction: 'out', video, chatId, peer, demo: true, speaker: video, callId: 'demo-' + uuid() });
  openScreen();
  callAudio.startSession(video, true);
  timers.ring = setTimeout(() => {
    callAudio.stopRingback();
    connectedOnce = true;
    st().set({ phase: 'active', startedAt: Date.now() });
    haptic.success();
  }, 3500);
}

/** Демо входящего звонка (кнопка в настройках демо-режима) */
export function startDemoIncoming() {
  if (!DEMO || st().phase !== 'idle') return;
  const chat = Object.values(useChats.getState().byId).find((c) => c.kind === 'direct');
  const peerMember = chat ? peerOf(chat, me()) : undefined;
  if (!chat || !peerMember) return;
  resetFlags();
  st().set({
    phase: 'incoming',
    direction: 'in',
    video: false,
    chatId: chat.id,
    demo: true,
    callId: 'demo-' + uuid(),
    peer: { id: peerMember.id, name: chatTitle(chat, me()), avatar: peerMember.avatar_url },
  });
  callAudio.startRingtone();
  openScreen();
  timers.ring = setTimeout(() => finishDemo(), RING_TIMEOUT_MS);
}

export function acceptDemo() {
  clearTimer('ring');
  callAudio.stopRingtone();
  connectedOnce = true;
  st().set({ phase: 'active', startedAt: Date.now() });
  haptic.success();
}

function finishDemo() {
  const s = st();
  const duration = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : null;
  const status = connectedOnce ? 'ended' : s.direction === 'in' ? 'declined' : 'canceled';
  if (s.chatId) {
    const msg: Message = {
      id: uuid(),
      chat_id: s.chatId,
      sender_id: s.direction === 'out' ? me() : s.peer?.id ?? null,
      kind: 'call',
      body: null,
      media_path: null,
      meta: { call_id: s.callId ?? undefined, call_status: status, video: s.video, duration: duration ?? undefined },
      reply_to: null,
      view_once: false,
      silent: false,
      unlock_at: null,
      expires_at: null,
      edited_at: null,
      created_at: new Date().toISOString(),
      reactions: [],
    };
    useMessages.getState().upsert(msg);
    useChats.getState().onMessage(msg, me(), useUi.getState().activeChatId === s.chatId);
  }
  finish(status === 'ended' ? 'ended' : status === 'declined' ? 'declined' : 'canceled');
}
