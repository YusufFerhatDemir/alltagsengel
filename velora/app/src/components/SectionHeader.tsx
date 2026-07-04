/**
 * Velora — SectionHeader
 * ----------------------
 * Abschnittsüberschrift mit optionaler „Alle ansehen"-Aktion auf der rechten
 * Seite. Sorgt für einheitliche Abschnitts-Typografie über alle Screens.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Optionaler Aktions-Text rechts (z. B. „Alle ansehen"). */
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="heading">{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onActionPress} accessibilityRole="button" hitSlop={8}>
          <Text variant="label" color="primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
});
