import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { DEMO, SUPABASE_KEY, SUPABASE_URL } from './config';

export const supabase = createClient(
  DEMO ? 'http://127.0.0.1:54321' : SUPABASE_URL,
  DEMO ? 'demo-key-not-used-in-demo-mode' : SUPABASE_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: !DEMO,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Токен обновляется только пока приложение открыто (рекомендация Supabase для React Native)
if (!DEMO && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
