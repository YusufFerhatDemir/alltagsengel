/**
 * Onboarding — Maße für Tippflächen
 *
 * Eine Zahl, an einer Stelle. Verstreute `minHeight: 40` driften: die
 * eine Kachel wird nachgezogen, die andere nicht, und am Ende ist genau
 * der Knopf zu klein, den die meisten drücken.
 *
 * ── WARUM 48 PIXEL ─────────────────────────────────────────────────────
 * Das ist die verbreitete Untergrenze für eine sichere Tippfläche
 * (WCAG 2.2, Erfolgskriterium 2.5.8 nennt 24 px als Minimum, die
 * Plattformrichtlinien von Android und Apple liegen bei 48 bzw. 44).
 * Für dieses Publikum wird der höhere Wert genommen: die Empfänger sind
 * oft ältere Menschen, häufig auf dem Telefon, teils mit unruhigen
 * Händen. Ein zu kleines Ziel ist dort kein Schönheitsfehler, sondern
 * der häufigste Abbruchgrund.
 *
 * Der Test __tests__/onboarding/tippflaechen.test.ts hält fest, dass
 * keine Onboarding-Komponente darunter geht.
 */

/** Untergrenze jeder Tippfläche in Pixeln. */
export const TIPPFLAECHE_MIN = 48

/** Hauptknöpfe („Weiter", „Abschließen") — bewusst größer. */
export const TIPPFLAECHE_HAUPT = 52
