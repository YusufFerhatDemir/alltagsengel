/**
 * Velora — QuickAction
 * --------------------
 * Kachel mit Icon-Badge und Label für schnelle Aktionen auf dem Home-Screen.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme/theme';
import { Card } from './Card';
import { Text } from './Text';

export interface QuickActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Kurzer Zusatztext (optional). */
  hint?: string;
  onPress: () => void;
  /** Farb-Token für das Icon-Badge (Default: `primary`). */
  tint?: keyof Theme['colors'];
}

export function QuickAction({ icon, label, hint, onPress, tint = 'primary' }: QuickActionProps) {
  const theme = useTheme();

  return (
    <Card onPress={onPress} style={styles.card}>
      <View
        style={[
          styles.badge,
          { backgroundColor: withAlpha(theme.colors[tint]), borderRadius: theme.radius.md },
        ]}
      >
        <Ionicons name={icon} size={22} color={theme.colors[tint]} />
      </View>
      <Text variant="subtitle" style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

/** Hängt an einen 6-stelligen Hex-Wert eine dezente Alpha-Stufe (~14 %) an. */
function withAlpha(hex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}24`;
  return hex;
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 116, justifyContent: 'flex-start' },
  badge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  label: { marginBottom: 2 },
});
