/**
 * Velora — Profil
 * ---------------
 * Kontoübersicht, Einstellungen und der Design-Umschalter, mit dem sich die drei
 * Farbpaletten (Salbeigrün / Teal / Lavendel) zur Design-Findung live umschalten
 * lassen. Enthält außerdem die Abmeldung.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button, Card, Screen, SectionHeader, Text } from '@/components';
import { BRAND } from '@/constants/brand';
import { PALETTE_ORDER, PALETTES } from '@/theme/palettes';
import { usePalette, useTheme } from '@/theme/ThemeProvider';

export default function ProfilScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/login');
  }

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Text variant="title">Profil</Text>
      </View>

      {/* Konto-Karte */}
      <Card style={styles.accountCard}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
          <Text variant="title" style={{ color: theme.colors.onPrimary }}>
            {(user?.vorname?.[0] ?? 'V').toUpperCase()}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="subtitle">{user?.vorname ?? 'Willkommen'}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {user?.email ?? '—'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Card>

      {/* Design-Umschalter: drei Paletten-Optionen */}
      <View style={styles.section}>
        <SectionHeader title="Design" />
        <Card>
          <Text variant="caption" color="textMuted" style={styles.paletteHint}>
            Wähle die Farbwelt der App. (Design-Findung – Option A/B/C)
          </Text>
          <PaletteSwitcher />
        </Card>
      </View>

      {/* Einstellungen */}
      <View style={styles.section}>
        <SectionHeader title="Einstellungen" />
        <Card padded={false}>
          <SettingsRow icon="notifications-outline" label="Benachrichtigungen" first />
          <SettingsRow icon="shield-checkmark-outline" label="Datenschutz & Sicherheit" />
          <SettingsRow icon="card-outline" label="Abrechnung & Pflegekasse" />
          <SettingsRow icon="help-circle-outline" label="Hilfe & Support" last />
        </Card>
      </View>

      {/* Abmelden */}
      <View style={styles.section}>
        <Button
          label="Abmelden"
          variant="ghost"
          icon="log-out-outline"
          onPress={handleSignOut}
        />
      </View>

      {/* Betreiber-/Rechtshinweis */}
      <Text variant="caption" color="textMuted" center style={styles.legal}>
        {BRAND.name} · {BRAND.slogan}
        {'\n'}
        {BRAND.legal.operator}
      </Text>
    </Screen>
  );
}

/** Drei auswählbare Paletten-Swatches, die das Theme sofort umschalten. */
function PaletteSwitcher() {
  const theme = useTheme();
  const { paletteId, setPalette } = usePalette();

  return (
    <View style={styles.paletteRow}>
      {PALETTE_ORDER.map((id) => {
        const palette = PALETTES[id];
        const selected = id === paletteId;
        return (
          <Pressable
            key={id}
            onPress={() => setPalette(id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[
              styles.paletteOption,
              {
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            {/* Farbvorschau: primary / secondary / accent */}
            <View style={styles.swatchStack}>
              <View style={[styles.swatch, { backgroundColor: palette.colors.primary }]} />
              <View style={[styles.swatch, { backgroundColor: palette.colors.secondary }]} />
              <View style={[styles.swatch, { backgroundColor: palette.colors.accent }]} />
            </View>
            <Text variant="caption" weight={selected ? '700' : '400'} style={{ marginTop: 8 }}>
              {palette.label}
            </Text>
            <Text variant="caption" color="textMuted" style={styles.paletteDesc}>
              {palette.description}
            </Text>
            {selected ? (
              <View style={[styles.check, { backgroundColor: theme.colors.primary }]}>
                <Ionicons name="checkmark" size={12} color={theme.colors.onPrimary} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Eine Zeile in der Einstellungsliste. */
function SettingsRow({
  icon,
  label,
  first,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  first?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={[
        styles.settingsRow,
        {
          borderTopColor: theme.colors.border,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
        first && styles.settingsFirst,
        last && styles.settingsLast,
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} style={styles.settingsIcon} />
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { marginTop: 8, marginBottom: 20 },
  accountCard: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  section: { marginTop: 28 },
  paletteHint: { marginBottom: 14 },
  paletteRow: { flexDirection: 'row', gap: 10 },
  paletteOption: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  swatchStack: { flexDirection: 'row' },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginHorizontal: -3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  paletteDesc: { textAlign: 'center', marginTop: 1 },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
  settingsFirst: {},
  settingsLast: {},
  settingsIcon: { marginRight: 14 },
  legal: { marginTop: 32, lineHeight: 18 },
});
