/**
 * Velora — Eingabe-Validierung
 * ----------------------------
 * Kleine, wiederverwendbare Validierungs-Helfer für Formulare.
 */

/** Prüft eine E-Mail-Adresse pragmatisch (nicht RFC-vollständig, aber robust). */
export function isValidEmail(email: string): boolean {
  const value = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Mindestlänge für Passwörter. */
export const MIN_PASSWORD_LENGTH = 6;

/** Prüft, ob ein Passwort die Mindestanforderungen erfüllt. */
export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
