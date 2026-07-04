/**
 * Velora — Markenkonstanten
 * -------------------------
 * Zentrale Quelle für Name, Slogan, Kontakt- und Betreiberdaten. UI-Texte
 * referenzieren diese Konstanten, damit Branding an einer Stelle gepflegt wird.
 *
 * Rechtsträger ist die Alltagsengel UG (haftungsbeschränkt); Velora ist das
 * eigenständige Produkt-/Markenbranding (siehe velora/README.md).
 */

export const BRAND = {
  name: 'Velora',
  slogan: 'Für Menschen. Mit Herz.',
  tagline: 'Digitale Alltagsbegleitung & ambulante Pflege',

  contact: {
    email: 'info@alltagsengel.care',
  },

  legal: {
    operator: 'Alltagsengel UG (haftungsbeschränkt)',
    address: 'Neue Mainzer Straße 66-68, 60311 Frankfurt am Main',
    /** Anerkennung als Angebot zur Unterstützung im Alltag. */
    recognition: '§45a SGB XI',
  },
} as const;

export type Brand = typeof BRAND;
