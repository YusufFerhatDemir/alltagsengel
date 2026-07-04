/**
 * Velora — Screen-Container
 * -------------------------
 * Einheitliches Grundgerüst für Screens: Safe-Area, themenkonformer Hintergrund
 * und optionales Scrollen mit korrektem Standard-Seitenrand. Hält Layout-Logik
 * aus den einzelnen Screens heraus.
 */

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

export interface ScreenProps {
  children: ReactNode;
  /** Inhalt scrollbar machen (Default: false). */
  scroll?: boolean;
  /** Horizontalen Standard-Seitenrand anwenden (Default: true). */
  padded?: boolean;
  /** Safe-Area-Kanten (Default: oben + unten). */
  edges?: Edge[];
  /** Zusätzliches Styling des Inhalts-Containers. */
  contentStyle?: ViewStyle;
  /** Hintergrundfarbe überschreiben (Token). */
  background?: 'background' | 'surface';
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top', 'bottom'],
  contentStyle,
  background = 'background',
}: ScreenProps) {
  const theme = useTheme();

  const padding: ViewStyle = padded ? { paddingHorizontal: theme.spacing.screen } : {};
  const bg = { backgroundColor: theme.colors[background] };

  if (scroll) {
    return (
      <SafeAreaView style={[styles.flex, bg]} edges={edges}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            padding,
            { paddingBottom: theme.spacing.xxxl },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, bg]} edges={edges}>
      <View style={[styles.flex, padding, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
