/**
 * Velora — Farbpaletten
 * ----------------------
 * Drei kuratierte Paletten-Optionen. Die App startet mit Option A (Salbeigrün),
 * kann aber zur Design-Findung zur Laufzeit umgeschaltet werden
 * (siehe {@link ThemeProvider} und den Palette-Umschalter im Profil-Tab).
 *
 * Jede Palette definiert vollständige semantische Farb-Tokens, damit die UI
 * niemals rohe Hex-Werte referenziert, sondern immer die Bedeutung
 * (`primary`, `surface`, `textMuted`, …). Das hält einen späteren Theme-Wechsel
 * bzw. einen Dark-Mode trivial.
 */

/** Vollständiger semantischer Farbsatz einer Palette. */
export interface PaletteColors {
  /** Markenfarbe – Buttons, aktive Tabs, Akzentflächen. */
  primary: string;
  /** Dunklere Variante von `primary` – Verläufe, gedrückte Zustände. */
  primaryDark: string;
  /** Kontrastfarbe auf `primary` (i. d. R. hell). */
  onPrimary: string;
  /** Sekundärfarbe – unterstützende Flächen, sanfte Highlights. */
  secondary: string;
  /** Sehr helle Tönung der Sekundärfarbe – Chips, Badges, Hintergründe. */
  secondarySoft: string;
  /** Akzentfarbe – Hinweise, Hervorhebungen, dekorative Details. */
  accent: string;

  /** App-Hintergrund. */
  background: string;
  /** Kartenflächen / erhöhte Elemente. */
  surface: string;
  /** Alternative Fläche – Eingabefelder, sekundäre Kacheln. */
  surfaceAlt: string;

  /** Primäre Textfarbe. */
  text: string;
  /** Gedämpfte Textfarbe – Untertitel, Metadaten. */
  textMuted: string;
  /** Text auf farbigen Flächen. */
  textInverse: string;

  /** Trennlinien / Rahmen. */
  border: string;

  /** Statusfarben. */
  success: string;
  warning: string;
  danger: string;
  info: string;
}

/** Kennung der auswählbaren Paletten. */
export type PaletteId = 'salbeigruen' | 'teal' | 'lavendel';

/** Metadaten + Farben einer Palette. */
export interface PaletteDefinition {
  id: PaletteId;
  /** Anzeigename für den Umschalter. */
  label: string;
  /** Kurze Beschreibung der Stimmung. */
  description: string;
  colors: PaletteColors;
}

/**
 * Option A — Salbeigrün (Standard)
 * Ruhig, natürlich, vertrauensvoll. Passt zum pflegenden Kern von Velora.
 */
const salbeigruen: PaletteDefinition = {
  id: 'salbeigruen',
  label: 'Salbeigrün',
  description: 'Ruhig & natürlich',
  colors: {
    primary: '#3d6b4e',
    primaryDark: '#2c523c',
    onPrimary: '#ffffff',
    secondary: '#6b9e7a',
    secondarySoft: '#e4efe7',
    accent: '#e8c87a',

    background: '#faf6ee',
    surface: '#ffffff',
    surfaceAlt: '#f2ede2',

    text: '#22302a',
    textMuted: '#6a7871',
    textInverse: '#faf6ee',

    border: '#e3ddd0',

    success: '#3d8b5f',
    warning: '#d9962f',
    danger: '#c0492f',
    info: '#3d6b8b',
  },
};

/**
 * Option B — Teal
 * Frisch, modern, technologisch. Betont Veloras digital-affine Positionierung.
 */
const teal: PaletteDefinition = {
  id: 'teal',
  label: 'Teal',
  description: 'Frisch & modern',
  colors: {
    primary: '#1a7a7a',
    primaryDark: '#125c5c',
    onPrimary: '#ffffff',
    secondary: '#4db8b8',
    secondarySoft: '#dcf0f0',
    accent: '#d4956a',

    background: '#f7fbfb',
    surface: '#ffffff',
    surfaceAlt: '#ebf4f4',

    text: '#12313a',
    textMuted: '#5c7a80',
    textInverse: '#f7fbfb',

    border: '#d5e6e6',

    success: '#1f8f6b',
    warning: '#d4956a',
    danger: '#c0492f',
    info: '#1a7a7a',
  },
};

/**
 * Option C — Lavendel
 * Sanft, würdevoll, premium. Ein wärmerer, empathischer Auftritt.
 */
const lavendel: PaletteDefinition = {
  id: 'lavendel',
  label: 'Lavendel',
  description: 'Sanft & würdevoll',
  colors: {
    primary: '#5c4a8a',
    primaryDark: '#453768',
    onPrimary: '#ffffff',
    secondary: '#8b7ab8',
    secondarySoft: '#e9e4f2',
    accent: '#e8a87a',

    background: '#faf8fc',
    surface: '#ffffff',
    surfaceAlt: '#f0ecf6',

    text: '#2c2440',
    textMuted: '#726a86',
    textInverse: '#faf8fc',

    border: '#e2dcee',

    success: '#4b9d6f',
    warning: '#d99a3f',
    danger: '#c0492f',
    info: '#5c4a8a',
  },
};

/** Alle Paletten in Anzeige-Reihenfolge. */
export const PALETTES: Record<PaletteId, PaletteDefinition> = {
  salbeigruen,
  teal,
  lavendel,
};

/** Reihenfolge für den Umschalter (Option A → B → C). */
export const PALETTE_ORDER: PaletteId[] = ['salbeigruen', 'teal', 'lavendel'];

/** Standard-Palette beim App-Start. */
export const DEFAULT_PALETTE: PaletteId = 'salbeigruen';
