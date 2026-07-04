/**
 * Velora — Design-Tokens & Theme-Builder
 * --------------------------------------
 * Zentrale, palette-unabhängige Design-Tokens (Abstände, Radien, Typografie,
 * Schatten) plus {@link buildTheme}, das eine Palette mit diesen Tokens zu einem
 * vollständigen `Theme` verschmilzt.
 *
 * Konsumiert wird das Theme über {@link useTheme} (siehe ThemeProvider). Screens
 * und Komponenten greifen ausschließlich auf Tokens zu – keine Magic Numbers.
 */

import { Platform } from 'react-native';

import { PALETTES, type PaletteColors, type PaletteId } from './palettes';

/**
 * Abstands-Skala (4-pt-Raster). `screen` ist der Standard-Seitenrand.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  /** Horizontaler Standard-Seitenrand. */
  screen: 20,
} as const;

/** Eckenradien. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Typografie-Skala. `weight` als String, damit es zu React-Native-Fonts passt.
 * Plattform-Font: System-Font auf iOS/Android, saubere Sans im Web.
 */
export const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
}) as string;

export const typography = {
  /** Große Display-Überschrift (Hero, Onboarding). */
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const },
  /** Seitentitel. */
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const },
  /** Abschnittsüberschrift. */
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  /** Kartentitel / hervorgehobener Text. */
  subtitle: { fontSize: 17, lineHeight: 23, fontWeight: '600' as const },
  /** Fließtext. */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  /** Kleiner Text, Metadaten. */
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  /** Buttons / Labels. */
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
} as const;

/**
 * Plattformübergreifende Schatten-Presets. iOS nutzt shadow*, Android elevation,
 * Web `boxShadow` (via style). Wir liefern beides und lassen RN das Passende wählen.
 */
export const elevation = {
  none: {},
  card: Platform.select({
    ios: {
      shadowColor: '#1c2b22',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
    },
    android: { elevation: 3 },
    default: { boxShadow: '0 6px 16px rgba(28,43,34,0.08)' },
  }),
  floating: Platform.select({
    ios: {
      shadowColor: '#1c2b22',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 24,
    },
    android: { elevation: 8 },
    default: { boxShadow: '0 10px 24px rgba(28,43,34,0.14)' },
  }),
} as const;

/** Vollständiges Theme-Objekt, das Komponenten konsumieren. */
export interface Theme {
  id: PaletteId;
  colors: PaletteColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
  fontFamily: string;
}

/** Setzt eine Palette mit den globalen Tokens zu einem Theme zusammen. */
export function buildTheme(paletteId: PaletteId): Theme {
  return {
    id: paletteId,
    colors: PALETTES[paletteId].colors,
    spacing,
    radius,
    typography,
    elevation,
    fontFamily,
  };
}
