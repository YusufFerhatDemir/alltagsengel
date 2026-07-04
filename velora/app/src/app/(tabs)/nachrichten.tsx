/**
 * Velora — Nachrichten
 * --------------------
 * In-App-Chat zwischen Angehörigen, Begleitern und Koordination. Zeigt vorerst
 * eine beispielhafte Konversationsliste; die Echtzeit-Anbindung folgt.
 */

import { StyleSheet, View } from 'react-native';

import { Card, Screen, Text } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

interface Konversation {
  id: string;
  name: string;
  rolle: string;
  vorschau: string;
  zeit: string;
  ungelesen: number;
  initialen: string;
}

const KONVERSATIONEN: Konversation[] = [
  {
    id: '1',
    name: 'Sophie M.',
    rolle: 'Alltagsbegleiterin',
    vorschau: 'Ich bin pünktlich um 14:30 da – bis gleich!',
    zeit: '12:04',
    ungelesen: 2,
    initialen: 'SM',
  },
  {
    id: '2',
    name: 'Koordination Velora',
    rolle: 'Team',
    vorschau: 'Deine Abrechnung für Juni wurde eingereicht.',
    zeit: 'Gestern',
    ungelesen: 0,
    initialen: 'V',
  },
  {
    id: '3',
    name: 'Leon K.',
    rolle: 'Alltagsbegleiter',
    vorschau: 'Der Einkauf ist erledigt, alles im Kühlschrank. 🛒',
    zeit: 'Mo',
    ungelesen: 0,
    initialen: 'LK',
  },
];

export default function NachrichtenScreen() {
  const theme = useTheme();

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Text variant="title">Nachrichten</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>
          Bleib mit deinem Team in Verbindung.
        </Text>
      </View>

      {KONVERSATIONEN.map((k) => (
        <Card key={k.id} style={styles.row} onPress={() => {}}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.secondary }]}>
            <Text variant="subtitle" style={{ color: theme.colors.onPrimary }}>
              {k.initialen}
            </Text>
          </View>

          <View style={styles.flex}>
            <View style={styles.rowTop}>
              <Text variant="subtitle" numberOfLines={1} style={styles.flex}>
                {k.name}
              </Text>
              <Text variant="caption" color="textMuted">
                {k.zeit}
              </Text>
            </View>
            <Text variant="caption" color="textMuted" style={{ marginTop: 1 }}>
              {k.rolle}
            </Text>
            <Text
              variant="body"
              color={k.ungelesen > 0 ? 'text' : 'textMuted'}
              numberOfLines={1}
              style={{ marginTop: 4 }}
            >
              {k.vorschau}
            </Text>
          </View>

          {k.ungelesen > 0 ? (
            <View style={[styles.unread, { backgroundColor: theme.colors.primary }]}>
              <Text variant="caption" style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>
                {k.ungelesen}
              </Text>
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { marginTop: 8, marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
});
