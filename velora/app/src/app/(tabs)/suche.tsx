/**
 * Velora — Suche
 * --------------
 * Einstieg in die Begleiter-Suche: Suchfeld, Kategorie-Filter und (vorerst) ein
 * Platzhalter für die Ergebnisliste. Der Matching-Algorithmus (Standort,
 * Verfügbarkeit, Qualifikation) folgt in einer späteren Ausbaustufe.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Text, TextField } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

const KATEGORIEN = ['Alle', 'Alltagsbegleitung', 'Einkaufshilfe', 'Spaziergänge', 'Betreuung'];

export default function SucheScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [aktiveKategorie, setAktiveKategorie] = useState('Alle');

  return (
    <Screen>
      <View style={styles.head}>
        <Text variant="title">Begleitung finden</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>
          Passende Engel in deiner Nähe.
        </Text>
      </View>

      <TextField
        label="Suche"
        icon="search-outline"
        placeholder="Ort, Name oder Leistung"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />

      {/* Kategorie-Filter als horizontale Chip-Leiste */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {KATEGORIEN.map((kategorie) => {
          const aktiv = kategorie === aktiveKategorie;
          return (
            <Pressable
              key={kategorie}
              onPress={() => setAktiveKategorie(kategorie)}
              style={[
                styles.chip,
                {
                  backgroundColor: aktiv ? theme.colors.primary : theme.colors.surface,
                  borderColor: aktiv ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <Text variant="caption" style={{ color: aktiv ? theme.colors.onPrimary : theme.colors.text }}>
                {kategorie}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.results}>
        <EmptyState
          icon="people-outline"
          title="Deine Suche startet hier"
          description="Gib einen Ort oder eine Leistung ein – wir finden passende Alltagsengel, sobald das Begleiter-Netzwerk verbunden ist."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: 8, marginBottom: 20 },
  chips: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  results: { flex: 1, marginTop: 8 },
});
