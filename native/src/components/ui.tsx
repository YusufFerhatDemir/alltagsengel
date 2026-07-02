import { type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { Colors, Fonts } from '../constants/theme'

// ═══════════════════════════════════════════════════════════
// UI-Primitives im Alltagsengel-Design (dark, gold accent)
// ═══════════════════════════════════════════════════════════

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>
}

export function BodyText({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.body, style]}>{children}</Text>
}

export function MutedText({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>
}

/** Auswahl-Chip (z. B. Pflegegrad-Buttons) */
export function Chip({
  active,
  onPress,
  children,
  style,
}: {
  active: boolean
  onPress: () => void
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive, style]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{children}</Text>
    </Pressable>
  )
}

/** Primärer Gold-Button */
export function GoldButton({
  onPress,
  children,
  disabled,
  loading,
  style,
}: {
  onPress: () => void
  children: ReactNode
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={[styles.goldBtn, inactive && styles.goldBtnDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.coal} />
      ) : (
        <Text style={[styles.goldBtnText, inactive && styles.goldBtnTextDisabled]}>{children}</Text>
      )}
    </Pressable>
  )
}

/** Sekundärer Ghost-Button */
export function GhostButton({
  onPress,
  children,
  style,
}: {
  onPress: () => void
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.ghostBtn, style]}>
      <Text style={styles.ghostBtnText}>{children}</Text>
    </Pressable>
  )
}

/** Text-Eingabefeld im App-Design */
export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={Colors.ink3}
      {...props}
      style={[styles.input, props.style]}
    />
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  sectionTitle: {
    color: Colors.ink,
    fontFamily: Fonts.bold,
    fontSize: 19,
    marginBottom: 10,
  },
  label: {
    color: Colors.ink3,
    fontFamily: Fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  body: {
    color: Colors.ink2,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: Colors.ink4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(201,150,60,0.18)',
  },
  chipText: {
    color: Colors.ink2,
    fontFamily: Fonts.semibold,
    fontSize: 14,
    textAlign: 'center',
  },
  chipTextActive: {
    color: Colors.goldBright,
  },
  goldBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  goldBtnText: {
    color: Colors.coal,
    fontFamily: Fonts.bold,
    fontSize: 16,
  },
  goldBtnTextDisabled: {
    color: Colors.ink4,
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: Colors.ink2,
    fontFamily: Fonts.semibold,
    fontSize: 15,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderColor: Colors.inputBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    color: Colors.ink,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
})
