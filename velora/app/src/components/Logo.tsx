/**
 * Velora — Logo / Wortmarke
 * -------------------------
 * Eigenständiges Velora-Branding (kein fremdes Asset). Die Bildmarke ist ein
 * "V" aus zwei Blattklingen, rein aus getönten Views gezeichnet – dadurch passt
 * sie sich automatisch der aktiven Palette an. Optional mit Wortmarke „Velora"
 * und Slogan.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BRAND } from '@/constants/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface LogoProps {
  /** Höhe der Bildmarke in px (Default: 40). */
  size?: number;
  /** Anordnung: Marke + Wortmarke nebeneinander, untereinander oder nur Marke. */
  layout?: 'horizontal' | 'vertical' | 'mark';
  /** Slogan unter der Wortmarke anzeigen (nur bei `vertical`). */
  withSlogan?: boolean;
  /** Marke in Weiß rendern (für farbige Hintergründe). */
  inverse?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Die reine Bildmarke: zwei Blattklingen, die ein „V" bilden. */
function Mark({ size, inverse }: { size: number; inverse?: boolean }) {
  const theme = useTheme();
  const bladeWidth = size * 0.2;
  const bladeHeight = size * 0.82;

  const front = inverse ? theme.colors.onPrimary : theme.colors.primary;
  const back = inverse ? theme.colors.secondarySoft : theme.colors.secondary;

  const blade = (rotate: string, translateX: number, color: string): ViewStyle => ({
    position: 'absolute',
    width: bladeWidth,
    height: bladeHeight,
    borderRadius: bladeWidth,
    backgroundColor: color,
    transform: [{ translateX }, { rotate }],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* hintere Klinge (Sekundärfarbe) – neigt sich zur Mitte (bildet linken V-Schenkel) */}
      <View style={blade('-20deg', -size * 0.19, back)} />
      {/* vordere Klinge (Primärfarbe) – rechter V-Schenkel */}
      <View style={blade('20deg', size * 0.19, front)} />
    </View>
  );
}

export function Logo({
  size = 40,
  layout = 'horizontal',
  withSlogan = false,
  inverse = false,
  style,
}: LogoProps) {
  const wordColor = inverse ? 'onPrimary' : 'text';
  const wordSize = size * 0.66;

  if (layout === 'mark') {
    return (
      <View style={style}>
        <Mark size={size} inverse={inverse} />
      </View>
    );
  }

  const wordmark = (
    <View>
      <Text
        variant="title"
        color={wordColor}
        weight="700"
        style={{ fontSize: wordSize, lineHeight: wordSize * 1.1, letterSpacing: 0.3 }}
      >
        {BRAND.name}
      </Text>
      {withSlogan ? (
        <Text
          variant="caption"
          color={inverse ? 'secondarySoft' : 'textMuted'}
          style={styles.slogan}
        >
          {BRAND.slogan}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        layout === 'horizontal' ? styles.horizontal : styles.vertical,
        style,
      ]}
    >
      <Mark size={size} inverse={inverse} />
      <View style={layout === 'horizontal' ? styles.wordSpacingH : styles.wordSpacingV}>
        {wordmark}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  horizontal: { flexDirection: 'row', alignItems: 'center' },
  vertical: { alignItems: 'center' },
  wordSpacingH: { marginLeft: 10 },
  wordSpacingV: { marginTop: 10, alignItems: 'center' },
  slogan: { marginTop: 2 },
});
