// ═══════════════════════════════════════════════════════════════════════
// HTML-Escaping fuer Benachrichtigungen
// ═══════════════════════════════════════════════════════════════════════
//
// Eigene Datei, damit sowohl der Versandweg (lib/notifications.ts) als
// auch der Nachrichtenbau (lib/notifications/vorgaenge/*) dieselbe
// Funktion benutzen koennen, ohne dass die beiden Module einander
// importieren muessen (Zirkelbezug).
//
// Ohne dieses Escaping kann ein Nutzer ueber seinen eigenen first_name
// oder einen Freitext-Ablehnungsgrund HTML in E-Mails einschleusen, die
// unter der Alltagsengel-Absenderadresse an ANDERE Nutzer gehen —
// Phishing trotz legitimen Absenders.
// ═══════════════════════════════════════════════════════════════════════

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
