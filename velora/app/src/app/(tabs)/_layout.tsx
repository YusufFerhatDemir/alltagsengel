/**
 * Velora — Tab-Navigation
 * -----------------------
 * Fünf Haupt-Tabs: Home, Suche, Kalender, Nachrichten, Profil.
 * Enthält zugleich das Auth-Gate: Ohne angemeldeten Nutzer wird auf den Login
 * umgeleitet.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Icon-Paare (inaktiv / aktiv) pro Tab – Outline vs. gefüllt. */
function tabIcon(base: string) {
  return ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => {
    const name = (focused ? base : `${base}-outline`) as IoniconName;
    return <Ionicons name={name} size={size} color={color} />;
  };
}

export default function TabsLayout() {
  const theme = useTheme();
  const { user, initializing } = useAuth();

  // Auth-Gate: Nicht angemeldete Nutzer sehen die Tabs nicht.
  if (!initializing && !user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('home') }}
      />
      <Tabs.Screen
        name="suche"
        options={{ title: 'Suche', tabBarIcon: tabIcon('search') }}
      />
      <Tabs.Screen
        name="kalender"
        options={{ title: 'Kalender', tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen
        name="nachrichten"
        options={{ title: 'Nachrichten', tabBarIcon: tabIcon('chatbubbles') }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarIcon: tabIcon('person') }}
      />
    </Tabs>
  );
}
