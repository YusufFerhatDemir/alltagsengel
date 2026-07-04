/**
 * Velora — Einstiegs-Weiche
 * -------------------------
 * Entscheidet beim Start, ob der Nutzer in die App (Tabs) oder zum Login geleitet
 * wird. Zeigt währenddessen einen kurzen Ladezustand, bis die gespeicherte
 * Session geladen ist.
 */

import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function Index() {
  const { user, initializing } = useAuth();
  const theme = useTheme();

  if (initializing) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href={user ? '/(tabs)' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
