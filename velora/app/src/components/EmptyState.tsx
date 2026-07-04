/**
 * Velora — EmptyState
 * -------------------
 * Freundlicher Platzhalter für noch leere oder in Entwicklung befindliche
 * Bereiche: Icon-Badge, Titel, Beschreibung und optionale Aktion.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: theme.colors.secondarySoft }]}>
        <Ionicons name={icon} size={34} color={theme.colors.primary} />
      </View>
      <Text variant="heading" center style={styles.title}>
        {title}
      </Text>
      <Text variant="body" color="textMuted" center style={styles.description}>
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { marginBottom: 8 },
  description: { maxWidth: 320 },
  action: { marginTop: 24 },
});
