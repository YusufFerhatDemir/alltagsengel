/**
 * Velora — Button
 * ---------------
 * Barrierefreier Button mit drei Varianten (primary / secondary / ghost),
 * optionalem Icon und Ladezustand. Verwendet Pressable für gedrückte Zustände.
 */

import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Ionicons-Name für ein führendes Icon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Zeigt einen Spinner und deaktiviert den Button. */
  loading?: boolean;
  disabled?: boolean;
  /** Volle Breite einnehmen (Default: true). */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  // Farbwahl je Variante.
  const bg =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'secondary'
        ? theme.colors.secondarySoft
        : 'transparent';
  const fg =
    variant === 'primary'
      ? theme.colors.onPrimary
      : variant === 'secondary'
        ? theme.colors.primary
        : theme.colors.primary;
  const borderColor = variant === 'ghost' ? theme.colors.border : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderRadius: theme.radius.md,
          opacity: isDisabled ? 0.55 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        fullWidth ? styles.fullWidth : undefined,
        variant === 'primary' ? theme.elevation.card : undefined,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={18} color={fg} style={styles.icon} /> : null}
          <Text variant="label" style={{ color: fg }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 8 },
});
