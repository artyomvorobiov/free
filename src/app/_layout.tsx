import { Onest_400Regular } from '@expo-google-fonts/onest/400Regular';
import { Onest_500Medium } from '@expo-google-fonts/onest/500Medium';
import { Onest_600SemiBold } from '@expo-google-fonts/onest/600SemiBold';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded/600SemiBold';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Toasts, TouchOverlay } from '@/components/ui/Overlays';
import { initAuth } from '@/lib/auth';
import { openFromPush, refreshCall } from '@/lib/calls/engine';
import { addNotificationReceivedListener, addNotificationTapListener, setupNotificationHandler } from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/useTheme';

SplashScreen.preventAutoHideAsync().catch(() => {});
setupNotificationHandler();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Unbounded_600SemiBold,
    Unbounded_700Bold,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
  });
  const status = useAuth((s) => s.status);
  const t = useTheme();

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);

  const ready = (fontsLoaded || !!fontError) && status !== 'loading';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (status !== 'ready') return;
    const offTap = addNotificationTapListener((data) => {
      if (data.type === 'call' && data.callId) openFromPush(data.callId, data.chatId);
      else if (data.chatId) router.push({ pathname: '/chat/[id]', params: { id: data.chatId } });
    });
    const offReceive = addNotificationReceivedListener((data) => {
      if (data.type === 'call' && data.callId) refreshCall(data.callId);
    });
    return () => {
      offTap();
      offReceive();
    };
  }, [status]);

  const navTheme = useMemo(() => {
    const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: t.bg, card: t.bg, primary: t.accent, text: t.text, border: t.hairline } };
  }, [t]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'default' }}>
            <Stack.Protected guard={status === 'signedOut'} redirectTo={status === 'needsSetup' ? '/setup' : '/'}>
              <Stack.Screen name="welcome" />
              <Stack.Screen name="email" />
              <Stack.Screen name="code" />
              <Stack.Screen name="password" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'needsSetup'} redirectTo={status === 'signedOut' ? '/welcome' : '/'}>
              <Stack.Screen name="setup" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'ready'} redirectTo={status === 'needsSetup' ? '/setup' : '/welcome'}>
              <Stack.Screen name="index" />
              <Stack.Screen name="chat/[id]" />
              <Stack.Screen name="info/[id]" />
              <Stack.Screen name="user/[id]" />
              <Stack.Screen name="new" />
              <Stack.Screen name="new-group" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="blocked" />
              <Stack.Screen name="forward" options={{ presentation: 'modal' }} />
              <Stack.Screen name="viewer" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
              <Stack.Screen name="call" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
            </Stack.Protected>
          </Stack>
          <TouchOverlay />
          <Toasts />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
