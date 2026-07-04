/**
 * Velora — Root-Layout
 * --------------------
 * Oberste Ebene der App: hängt die globalen Provider (SafeArea, Theme, Auth) ein
 * und rendert den Navigations-Stack. Das eigentliche Auth-Gating (Login vs. Tabs)
 * übernimmt die Weiche in `index.tsx`.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

// Splash bleibt sichtbar, bis die App bereit ist.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Provider sind synchron bereit – Splash direkt freigeben.
    SplashScreen.hideAsync().catch(() => {
      /* Splash war evtl. schon ausgeblendet. */
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
