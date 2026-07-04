/**
 * Velora — Kalender
 * -----------------
 * Übersicht der geplanten Begleitungen. Zeigt beispielhaft strukturierte Termine
 * gruppiert nach Tag. Die echte Terminverwaltung (Buchung, Änderung, Echtzeit-
 * Status) wird an das Backend angebunden.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Screen, Text } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

interface Termin {
  id: string;
  titel: string;
  zeit: string;
  begleiter: string;
  status: 'bestaetigt' | 'angefragt';
}

interface Tag {
  label: string;
  termine: Termin[];
}

// Beispiel-Daten zur Illustration der Struktur.
const TAGE: Tag[] = [
  {
    label: 'Heute',
    termine: [
      { id: '1', titel: 'Alltagsbegleitung', zeit: '14:30 – 16:30', begleiter: 'Sophie M.', status: 'bestaetigt' },
    ],
  },
  {
    label: 'Morgen',
    termine: [
      { id: '2', titel: 'Einkaufsbegleitung', zeit: '10:00 – 11:30', begleiter: 'Leon K.', status: 'bestaetigt' },
      { id: '3', titel: 'Spaziergang', zeit: '15:00 – 16:00', begleiter: 'Noch offen', status: 'angefragt' },
    ],
  },
];

export default function KalenderScreen() {
  const theme = useTheme();

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Text variant="title">Kalender</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>
          Deine geplanten Begleitungen.
        </Text>
      </View>

      {TAGE.map((tag) => (
        <View key={tag.label} style={styles.group}>
          <Text variant="label" color="textMuted" style={styles.groupLabel}>
            {tag.label.toUpperCase()}
          </Text>

          {tag.termine.map((termin) => {
            const bestaetigt = termin.status === 'bestaetigt';
            return (
              <Card key={termin.id} style={styles.terminCard}>
                <View style={[styles.timeCol, { borderRightColor: theme.colors.border }]}>
                  <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text variant="subtitle">{termin.titel}</Text>
                  <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {termin.zeit} Uhr · {termin.begleiter}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: bestaetigt
                        ? theme.colors.secondarySoft
                        : theme.colors.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{ color: bestaetigt ? theme.colors.primary : theme.colors.textMuted }}
                  >
                    {bestaetigt ? 'Bestätigt' : 'Angefragt'}
                  </Text>
                </View>
              </Card>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { marginTop: 8, marginBottom: 24 },
  group: { marginBottom: 24 },
  groupLabel: { marginBottom: 10, letterSpacing: 0.6 },
  terminCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  timeCol: {
    paddingRight: 14,
    marginRight: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
