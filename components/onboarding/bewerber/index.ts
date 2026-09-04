/**
 * Bewerber-Onboarding — Masken je Schritt.
 *
 * Der Schlüssel ist derselbe wie in SCHRITTFOLGEN.bewerber
 * (lib/onboarding/schritte.ts). Fehlt hier ein Schlüssel, rendert der
 * Wizard den Schritt ohne Maske — bei Hinweis- und Prüfschritten ist das
 * gewollt, bei einem Formularschritt wäre es ein Fehler. Der Test
 * __tests__/onboarding/bewerber-masken.test.ts hält beide Seiten
 * deckungsgleich.
 */
export { default as Schritt01Willkommen } from './Schritt01Willkommen'
export { default as Schritt02Person } from './Schritt02Person'
export { default as Schritt03Einsatzgebiet } from './Schritt03Einsatzgebiet'
export { default as Schritt04Qualifikation } from './Schritt04Qualifikation'
export { default as Schritt05Fuehrerschein } from './Schritt05Fuehrerschein'
export { default as Schritt06Sprachen } from './Schritt06Sprachen'
export { default as Schritt07Verfuegbarkeit } from './Schritt07Verfuegbarkeit'
export { default as Schritt08Stundenumfang } from './Schritt08Stundenumfang'
export { default as Schritt09Fuehrungszeugnis } from './Schritt09Fuehrungszeugnis'
export { default as Schritt10Unterlagen } from './Schritt10Unterlagen'
export { default as Schritt11Zusammenfassung } from './Schritt11Zusammenfassung'
export { default as Schritt12Absenden } from './Schritt12Absenden'
export * from './zusammenfassung'
