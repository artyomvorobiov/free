/**
 * Подключение к серверу.
 *
 * Самый простой способ: создайте в корне проекта файл `.env`
 * (скопируйте `.env.example`) и вставьте туда URL и ключ проекта Supabase.
 * Если значения не заданы — приложение запустится в демо-режиме
 * с тестовыми чатами, чтобы можно было посмотреть дизайн.
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
export const SUPABASE_KEY = (process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '').trim();

export const IS_CONFIGURED =
  /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_KEY.length > 20 && !SUPABASE_URL.includes('xxxxxxxx');

/** Демо-режим: работает без сервера, все данные живут только на устройстве. */
export const DEMO = !IS_CONFIGURED;

/** Длина кода из письма (Supabase → Authentication → Providers → Email → Email OTP Length). */
export const OTP_LENGTH = 6;

export const APP_NAME = 'Близко';
