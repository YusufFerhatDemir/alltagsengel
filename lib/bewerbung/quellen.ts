// ═══════════════════════════════════════════════════════════════════
// Die zwei Bewerberquellen — und wer welche sieht
// ═══════════════════════════════════════════════════════════════════
//
// ── BEFUND 14.09.2026 ─────────────────────────────────────────────
// Es gibt zwei Bewerberlisten, und sie beantworten dieselbe Frage
// verschieden:
//
//   `lead_inquiries` (BEWERBUNG_FILTER)   live 36 Zeilen
//       Alles, was ueber das Website-Formular hereinkommt
//       (/api/apply). Gefuehrt in /admin/applications mit ATS-Feldern,
//       Pipeline und Wiedervorlage; die taegliche Kette 13
//       (lib/automation/lead-follow-up.ts) erinnert daran.
//
//   `mis_applicants`                      live 0 Zeilen
//       Von Hand erfasste Bewerber aus Arbeitsagentur, Indeed,
//       Empfehlung. Gefuehrt in /mis/recruiting mit eigener Pipeline
//       und Stellenanzeigen. Seit Bestehen leer.
//
// Wer /mis/recruiting oeffnet, liest daraus „keine Bewerbungen" —
// waehrend 36 vorliegen, davon 35 unbearbeitet, die aelteste vom
// 15.07.2026. Kein Fehler, keine Meldung, nur eine leere Tabelle.
//
// Das ist dasselbe Muster, das lib/auth/bereiche.ts fuer
// /admin/applications schon einmal beschrieben hat („stand fuer pdl und
// qm in der Navigation und zeigte ihnen eine LEERE Bewerbungsliste").
// Dort wurde es durch Anheben der Berechtigung geloest. Hier geht das
// NICHT: /mis/recruiting ist die Personalseite (`personal.lesen`, also
// auch pdl), und die Website-Bewerbungen liegen bewusst auf
// `marketing.verwalten` — auf `lead_inquiries` steht live genau eine
// verwaltende Policy, „Admin full access" mit is_admin().
//
// ── DIE REGEL HIER ────────────────────────────────────────────────
// Die Grenze bleibt, die stille Null verschwindet. Wer die Liste
// oeffnen duerfte, bekommt die Anzahl; wer nicht, bekommt den Satz,
// dass diese Bewerbungen anderswo gefuehrt werden. Beides ist wahr,
// und keines der beiden ist eine leere Tabelle ohne Erklaerung.
// ═══════════════════════════════════════════════════════════════════

/** Die Berechtigung, die die Website-Bewerbungen sichtbar macht. */
export const BEWERBUNG_SICHT_BERECHTIGUNG = 'marketing.verwalten' as const

/** Wo die Website-Bewerbungen gefuehrt werden. */
export const BEWERBUNG_VERWALTUNG_PFAD = '/admin/applications'

export interface BewerbungUebersicht {
  /** Offene Bewerbungen (ohne Endzustaende). Nur mit Berechtigung gefuellt. */
  offen: number | null
  /** Seit wie vielen Tagen die aelteste offene wartet; null wenn keine. */
  aeltesteTage: number | null
  /**
   * Darf die aufrufende Person die Liste selbst oeffnen? Steuert, ob die
   * Oberflaeche einen Link anbietet oder nur den Hinweis zeigt.
   */
  darfSehen: boolean
}

/**
 * Der Hinweistext fuer /mis/recruiting.
 *
 * Bewusst zwei Faelle statt eines allgemeinen Satzes: „es gibt noch eine
 * Liste" hilft niemandem weiter, der nicht weiss, ob dort etwas liegt.
 */
export function bewerbungHinweis(u: BewerbungUebersicht): string {
  const wo = 'Bewerbungen über das Website-Formular werden in der Verwaltung geführt'
  if (!u.darfSehen || u.offen === null) {
    return `${wo}. Diese Liste zeigt nur von Hand erfasste Bewerber `
      + '(Arbeitsagentur, Indeed, Empfehlung).'
  }
  if (u.offen === 0) {
    return `${wo} — dort ist derzeit nichts offen. Diese Liste zeigt nur von Hand `
      + 'erfasste Bewerber (Arbeitsagentur, Indeed, Empfehlung).'
  }
  const alter = u.aeltesteTage != null && u.aeltesteTage > 0
    ? `, die älteste wartet seit ${u.aeltesteTage} Tagen`
    : ''
  return `${wo}: dort sind ${u.offen} Bewerbung${u.offen === 1 ? '' : 'en'} offen${alter}. `
    + 'Diese Liste zeigt nur von Hand erfasste Bewerber (Arbeitsagentur, Indeed, Empfehlung).'
}

/** Tage zwischen einem Eingang und jetzt — nie negativ. */
export function tageSeit(iso: string | null | undefined, jetzt: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((jetzt.getTime() - t) / 86_400_000))
}
