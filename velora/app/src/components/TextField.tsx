/**
 * Velora — TextField
 * ------------------
 * Beschriftetes Eingabefeld mit optionalem Icon, Fehlerzustand und Fokus-Rahmen.
 * Kapselt React-Natives `TextInput` und wendet Theme-Tokens an.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  /** Beschriftung über dem Feld. */
  label: string;
  /** Fehlermeldung unter dem Feld (setzt roten Rahmen). */
  error?: string;
  /** Führendes Ionicons-Icon. */
  icon?: keyof typeof Ionicons.glyphMap;
}

export function TextField({ label, error, icon, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={styles.wrapper}>
      <Text variant="caption" color="textMuted" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? theme.colors.primary : theme.colors.textMuted}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            { color: theme.colors.text, fontFamily: theme.fontFamily },
            style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { marginBottom: 6, marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, paddingVertical: 12 },
  error: { marginTop: 6, marginLeft: 2 },
});
