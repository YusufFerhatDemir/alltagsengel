/**
 * Velora — Home
 * -------------
 * Startseite nach der Anmeldung: persönliche Begrüßung, Schnellaktionen und ein
 * Überblick über den nächsten Termin sowie Kontext-Karten (Entlastungsbetrag,
 * Medikamenten-Tracking als Ausblick auf Phase 2).
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Card, QuickAction, Screen, SectionHeader, Text } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  // Tageszeit-abhängige Begrüßung (zur Laufzeit bestimmt).
  const greeting = useMemo(() => getGreeting(), []);
  const vorname = user?.vorname ?? 'willkommen';

  return (
    <Screen scroll>
      {/* Kopfbereich: Begrüßung + Benachrichtigungen */}
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">
            {greeting}
          </Text>
          <Text variant="title" numberOfLines={1}>
            {vorname} 👋
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Benachrichtigungen"
          onPress={() => router.push('/(tabs)/nachrichten')}
          style={[styles.bell, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
          <View style={[styles.badgeDot, { backgroundColor: theme.colors.accent }]} />
        </Pressable>
      </View>

      {/* Nächster Termin – hervorgehobene Karte */}
      <Card style={[styles.nextCard, { backgroundColor: theme.colors.primary }]} padded>
        <View style={styles.nextTopRow}>
          <Text variant="caption" style={{ color: theme.colors.secondarySoft }}>
            Dein nächster Termin
          </Text>
          <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Text variant="caption" style={{ color: theme.colors.onPrimary }}>
              Heute
            </Text>
          </View>
        </View>
        <Text variant="heading" style={{ color: theme.colors.onPrimary, marginTop: 8 }}>
          Alltagsbegleitung
        </Text>
        <View style={styles.nextMetaRow}>
          <Ionicons name="time-outline" size={16} color={theme.colors.secondarySoft} />
          <Text variant="body" style={{ color: theme.colors.secondarySoft, marginLeft: 6 }}>
            14:30 – 16:30 Uhr · mit Sophie M.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/kalender')}
          style={[styles.nextButton, { backgroundColor: theme.colors.onPrimary }]}
        >
          <Text variant="label" style={{ color: theme.colors.primary }}>
            Details ansehen
          </Text>
        </Pressable>
      </Card>

      {/* Schnellaktionen */}
      <View style={styles.section}>
        <SectionHeader title="Schnellzugriff" />
        <View style={styles.grid}>
          <QuickAction
            icon="search"
            label="Begleitung finden"
            hint="Passende Engel"
            tint="primary"
            onPress={() => router.push('/(tabs)/suche')}
          />
          <QuickAction
            icon="calendar"
            label="Termine"
            hint="Planen & buchen"
            tint="secondary"
            onPress={() => router.push('/(tabs)/kalender')}
          />
        </View>
        <View style={styles.grid}>
          <QuickAction
            icon="medkit"
            label="Medikamente"
            hint="Erinnerungen"
            tint="accent"
            onPress={() => router.push('/(tabs)/nachrichten')}
          />
          <QuickAction
            icon="chatbubbles"
            label="Nachrichten"
            hint="Im Austausch"
            tint="info"
            onPress={() => router.push('/(tabs)/nachrichten')}
          />
        </View>
      </View>

      {/* Kontext-Karte: Entlastungsbetrag */}
      <View style={styles.section}>
        <SectionHeader title="Dein Budget" />
        <Card>
          <View style={styles.budgetRow}>
            <View style={styles.flex}>
              <Text variant="subtitle">Entlastungsbetrag §45b</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                Verfügbar diesen Monat
              </Text>
            </View>
            <Text variant="title" color="primary">
              131 €
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
            <View
              style={[styles.progressFill, { backgroundColor: theme.colors.secondary, width: '35%' }]}
            />
          </View>
          <Text variant="caption" color="textMuted" style={{ marginTop: 8 }}>
            46 € genutzt · Abrechnung erfolgt automatisch mit der Pflegekasse
          </Text>
        </Card>
      </View>

      {/* Ausblick: Medikamenten-Tracking (Phase 2) */}
      <View style={styles.section}>
        <Card
          onPress={() => router.push('/(tabs)/nachrichten')}
          style={{ backgroundColor: theme.colors.secondarySoft, borderColor: theme.colors.secondarySoft }}
        >
          <View style={styles.teaserRow}>
            <View style={[styles.teaserIcon, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="notifications" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text variant="subtitle">Medikamenten-Erinnerung</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                Bald verfügbar – nie wieder eine Einnahme vergessen.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

/** Liefert eine tageszeitabhängige Begrüßung. */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 12,
    right: 13,
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  nextCard: { borderWidth: 0 },
  nextTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  nextMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  nextButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  section: { marginTop: 28 },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 999 },
  teaserRow: { flexDirection: 'row', alignItems: 'center' },
  teaserIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
});
