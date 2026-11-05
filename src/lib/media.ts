import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { DEMO } from './config';
import { supabase } from './supabase';

export type LocalImage = { uri: string; width: number; height: number };

/** Читает локальный файл целиком (для загрузки в хранилище) */
export async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

/** Сжимает фото до разумного размера перед отправкой */
export async function compressImage(img: LocalImage, maxSide = 1600, quality = 0.8): Promise<LocalImage> {
  try {
    const ctx = ImageManipulator.manipulate(img.uri);
    if (Math.max(img.width, img.height) > maxSide) {
      if (img.width >= img.height) ctx.resize({ width: maxSide });
      else ctx.resize({ height: maxSide });
    }
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return { uri: out.uri, width: out.width, height: out.height };
  } catch {
    return img;
  }
}

export async function pickImage(): Promise<LocalImage | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return compressImage({ uri: a.uri, width: a.width, height: a.height });
}

export async function takePhoto(): Promise<LocalImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return compressImage({ uri: a.uri, width: a.width, height: a.height });
}

export async function pickAvatar(): Promise<LocalImage | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return compressImage({ uri: a.uri, width: a.width, height: a.height }, 640, 0.85);
}

/** Загрузка медиа сообщения: media/<chatId>/<messageId>.<ext> */
export async function uploadMedia(chatId: string, messageId: string, uri: string, ext: string, contentType: string) {
  const path = `${chatId}/${messageId}.${ext}`;
  const body = await readBytes(uri);
  const { error } = await supabase.storage.from('media').upload(path, body, { contentType, upsert: false });
  // при повторной отправке файл мог уже загрузиться в прошлый раз
  if (error && !/duplicate|already exists|409/i.test(error.message)) throw error;
  urlCache.set(path, { url: uri, exp: Date.now() + 50 * 60_000 });
  return path;
}

export async function uploadAvatar(userId: string, uri: string) {
  const path = `${userId}/avatar.jpg`;
  const body = await readBytes(uri);
  const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

// ---------- временные ссылки на приватные файлы ----------
const urlCache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string | null>>();

export async function signedUrl(path: string, opts?: { short?: boolean }): Promise<string | null> {
  if (DEMO) return null;
  const ttl = opts?.short ? 120 : 3600;
  const cached = urlCache.get(path);
  if (!opts?.short && cached && cached.exp > Date.now()) return cached.url;
  const key = path + (opts?.short ? ':short' : '');
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const { data, error } = await supabase.storage.from('media').createSignedUrl(path, ttl);
    inflight.delete(key);
    if (error || !data?.signedUrl) return null;
    if (!opts?.short) urlCache.set(path, { url: data.signedUrl, exp: Date.now() + (ttl - 120) * 1000 });
    return data.signedUrl;
  })();
  inflight.set(key, p);
  return p;
}

/** Ссылка на медиа сообщения: локальный файл (пока отправляется) или временная ссылка */
export function useMediaUrl(path: string | null, localUri?: string, enabled = true) {
  const [url, setUrl] = useState<string | null>(localUri ?? (path ? urlCache.get(path)?.url ?? null : null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    if (localUri) {
      setUrl(localUri);
      return;
    }
    if (!path || !enabled) return;
    const cached = urlCache.get(path);
    if (cached && cached.exp > Date.now()) {
      setUrl(cached.url);
      return;
    }
    signedUrl(path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [path, localUri, enabled]);
  return { url, failed };
}
