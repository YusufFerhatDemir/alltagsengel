/**
 * Velora — Card
 * -------------
 * Erhöhte Inhaltsfläche mit Theme-konformem Radius, Rahmen und Schatten.
 * Optional als Pressable (wenn `onPress` gesetzt ist).
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Innenabstand anwenden (Default: true). */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, padded = true, style }: CardProps) {
  const theme = useTheme();

  const cardStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: padded ? theme.spacing.lg : 0,
    },
    theme.elevation.card,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.92 : 1 }]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}
