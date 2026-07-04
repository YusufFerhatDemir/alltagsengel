/**
 * Velora — Themed Text
 * --------------------
 * Dünne Hülle um React-Natives `Text`, die Typografie-Varianten und Farb-Tokens
 * aus dem Theme anwendet. Screens schreiben `<Text variant="title">` statt roher
 * fontSize/color-Angaben.
 */

import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme/theme';

type Variant = keyof Theme['typography'];
type ColorToken = keyof Theme['colors'];

export interface TextProps extends RNTextProps {
  /** Typografie-Variante (Default: `body`). */
  variant?: Variant;
  /** Farb-Token aus dem Theme (Default: `text`). */
  color?: ColorToken;
  /** Zentriert den Text. */
  center?: boolean;
  /** Überschreibt das Font-Gewicht der Variante. */
  weight?: TextStyle['fontWeight'];
}

export function Text({
  variant = 'body',
  color = 'text',
  center,
  weight,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const token = theme.typography[variant];

  return (
    <RNText
      style={[
        {
          fontFamily: theme.fontFamily,
          fontSize: token.fontSize,
          lineHeight: token.lineHeight,
          fontWeight: weight ?? token.fontWeight,
          color: theme.colors[color],
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}
