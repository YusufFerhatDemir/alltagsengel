/**
 * Velora — Theme-Context
 * ----------------------
 * Stellt das aktive {@link Theme} app-weit bereit und erlaubt das Umschalten der
 * Palette zur Laufzeit (Design-Findung Option A/B/C). Die Auswahl wird persistent
 * gespeichert, sodass sie einen App-Neustart übersteht.
 *
 * Nutzung:
 *   const { theme } = useTheme();          // Tokens lesen
 *   const { paletteId, setPalette } = usePalette();  // Palette wechseln
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_PALETTE, type PaletteId } from './palettes';
import { buildTheme, type Theme } from './theme';

const STORAGE_KEY = 'velora.palette';

interface ThemeContextValue {
  /** Aktuelles Theme (Farben + Tokens). */
  theme: Theme;
  /** Aktive Palette-Kennung. */
  paletteId: PaletteId;
  /** Palette wechseln (wird persistiert). */
  setPalette: (id: PaletteId) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [paletteId, setPaletteId] = useState<PaletteId>(DEFAULT_PALETTE);

  // Gespeicherte Palette beim Start laden.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && stored && isPaletteId(stored)) {
          setPaletteId(stored);
        }
      })
      .catch(() => {
        /* Fällt still auf Standard-Palette zurück. */
      });
    return () => {
      active = false;
    };
  }, []);

  const setPalette = useCallback((id: PaletteId) => {
    setPaletteId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {
      /* Persistenz ist best-effort. */
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: buildTheme(paletteId), paletteId, setPalette }),
    [paletteId, setPalette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Liefert das aktive Theme (Farben + Design-Tokens). */
export function useTheme(): Theme {
  return useThemeContext().theme;
}

/** Liefert Palette-Kennung + Umschalter (für den Design-Umschalter). */
export function usePalette(): { paletteId: PaletteId; setPalette: (id: PaletteId) => void } {
  const { paletteId, setPalette } = useThemeContext();
  return { paletteId, setPalette };
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme/usePalette müssen innerhalb von <ThemeProvider> stehen.');
  }
  return ctx;
}

function isPaletteId(value: string): value is PaletteId {
  return value === 'salbeigruen' || value === 'teal' || value === 'lavendel';
}
