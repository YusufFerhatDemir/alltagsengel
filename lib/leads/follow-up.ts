/**
 * Follow-up-Leiter für Leads — Warteliste, Bewerbungen, Kundenanfragen.
 *
 * DIE REGEL (Auftrag 11./12.09.2026)
 *   24 h nach Eingang ohne Statusänderung → Erinnerung (Hinweis)
 *   48 h                                  → Eskalation (Warnung)
 *   72 h                                  → Dringend (rot, Alarm an die Verwaltung)
 *   7 Tage                                → Verschleppt (eigene Stufe, täglicher Alarm)
 * Kein Lead darf tagelang vergessen werden.
 *
 * ── WORAN DIE UHR LÄUFT ───────────────────────────────────────────────
 * Für einen Lead in der Stufe NEU ist „ohne Statusänderung" gleichbedeutend
 * mit „seit Eingang": solange niemand ihn angefasst hat, steht er auf NEU.
 * Die Uhr läuft deshalb ab `created_at` — NICHT ab `updated_at`. Ein
 * technisches Update (Trigger, Backfill) setzt `updated_at` neu, ohne dass
 * ein Mensch den Lead gesehen hätte; die Erinnerung verschwände dann
 * lautlos.
 *
 * Für Leads in einer späteren, noch offenen Stufe gilt dieselbe Leiter ab
 * der fälligen Wiedervorlage: am Fälligkeitstag Erinnerung, 24 h drüber
 * Eskalation, 48 h drüber Dringend. Die Stufen „fällig" und „24 h nach
 * Eingang" sind damit derselbe Punkt auf derselben Leiter.
 *
 * Rein rechnend — kein Datenbank- und kein Browserzugriff, deshalb aus
 * Seite, Server Action und Cron-Kette gleichermaßen importierbar.
 */

export const FOLLOW_UP_SCHWELLEN_STUNDEN = {
  erinnerung: 24,
  eskalation: 48,
  dringend: 72,
  /** Sieben Tage. Ab hier ist es kein Rückstand mehr, sondern ein liegen gelassener Vorgang. */
  verschleppt: 24 * 7,
} as const

export type FollowUpStufe = 'keine' | 'erinnerung' | 'eskalation' | 'dringend' | 'verschleppt'

export const FOLLOW_UP_META: Record<FollowUpStufe, { label: string; color: string; rang: number }> = {
  keine: { label: '—', color: '#8A8A8A', rang: 0 },
  erinnerung: { label: 'Erinnerung', color: '#E8A000', rang: 1 },
  eskalation: { label: 'Eskalation', color: '#FF7043', rang: 2 },
  dringend: { label: 'Dringend', color: '#D04B3B', rang: 3 },
  verschleppt: { label: 'Verschleppt', color: '#7B1E14', rang: 4 },
}

const STUNDE_MS = 60 * 60 * 1000

/** Stunden seit einem Zeitpunkt; `null` bei fehlendem oder unlesbarem Wert. */
export function stundenSeit(zeitpunkt: string | Date | null | undefined, jetzt: Date = new Date()): number | null {
  if (!zeitpunkt) return null
  const t = zeitpunkt instanceof Date ? zeitpunkt.getTime() : Date.parse(zeitpunkt)
  if (Number.isNaN(t)) return null
  return (jetzt.getTime() - t) / STUNDE_MS
}

/** Leiter auf eine Stundenzahl anwenden. */
export function stufeFuerStunden(stunden: number | null): FollowUpStufe {
  if (stunden === null) return 'keine'
  if (stunden >= FOLLOW_UP_SCHWELLEN_STUNDEN.verschleppt) return 'verschleppt'
  if (stunden >= FOLLOW_UP_SCHWELLEN_STUNDEN.dringend) return 'dringend'
  if (stunden >= FOLLOW_UP_SCHWELLEN_STUNDEN.eskalation) return 'eskalation'
  if (stunden >= FOLLOW_UP_SCHWELLEN_STUNDEN.erinnerung) return 'erinnerung'
  return 'keine'
}

/** Lead in Stufe NEU: Uhr läuft ab Eingang. */
export function followUpSeitEingang(eingang: string | Date | null | undefined, jetzt: Date = new Date()): FollowUpStufe {
  return stufeFuerStunden(stundenSeit(eingang, jetzt))
}

/**
 * Lead in einer späteren offenen Stufe: Uhr läuft ab der Wiedervorlage.
 * Fällig = Erinnerung, +24 h = Eskalation, +48 h = Dringend.
 */
export function followUpSeitWiedervorlage(faelligAm: string | Date | null | undefined, jetzt: Date = new Date()): FollowUpStufe {
  const ueber = stundenSeit(faelligAm, jetzt)
  if (ueber === null || ueber < 0) return 'keine'
  return stufeFuerStunden(ueber + FOLLOW_UP_SCHWELLEN_STUNDEN.erinnerung)
}

/** Zeitpunkt + n Tage, als ISO-Zeitstempel. */
export function plusTage(von: string | Date, tage: number): string {
  const t = von instanceof Date ? von.getTime() : Date.parse(von)
  return new Date(t + tage * 24 * STUNDE_MS).toISOString()
}

/**
 * Kalendertag (YYYY-MM-DD) + n Tage in Europe/Berlin — für `date`-Spalten
 * wie `lead_inquiries.follow_up_date`. UTC-Datum wäre zwischen 22 und 24 Uhr
 * deutscher Zeit schon der Folgetag.
 */
export function berlinerTagPlus(jetzt: Date, tage: number): string {
  const heute = jetzt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const [j, m, t] = heute.split('-').map(Number)
  const d = new Date(Date.UTC(j, m - 1, t + tage))
  return d.toISOString().slice(0, 10)
}

/**
 * Ein `date` (YYYY-MM-DD) gilt ab Tagesbeginn in Berlin als fällig. Als
 * Näherung ohne Zeitzonenbibliothek: 00:00 Berlin ≈ 22:00/23:00 UTC des
 * Vortags; wir nehmen konservativ 00:00 UTC des Tages — die Erinnerung
 * erscheint damit höchstens zwei Stunden später, nie früher.
 */
export function tagAlsZeitpunkt(datum: string | null | undefined): string | null {
  if (!datum || !/^\d{4}-\d{2}-\d{2}/.test(datum)) return null
  return `${datum.slice(0, 10)}T00:00:00.000Z`
}

export interface FollowUpZaehlung {
  erinnerung: number
  eskalation: number
  dringend: number
  /** Über sieben Tage ohne Bearbeitung. */
  verschleppt: number
  gesamt: number
}

export function zaehleFollowUps(stufen: readonly FollowUpStufe[]): FollowUpZaehlung {
  const z: FollowUpZaehlung = { erinnerung: 0, eskalation: 0, dringend: 0, verschleppt: 0, gesamt: 0 }
  for (const s of stufen) {
    if (s === 'keine') continue
    z[s]++
    z.gesamt++
  }
  return z
}

/** Höchste Stufe aus einer Liste — für Sammelmeldungen. */
export function hoechsteStufe(stufen: readonly FollowUpStufe[]): FollowUpStufe {
  let best: FollowUpStufe = 'keine'
  for (const s of stufen) if (FOLLOW_UP_META[s].rang > FOLLOW_UP_META[best].rang) best = s
  return best
}
