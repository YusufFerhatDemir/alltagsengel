/**
 * Bewerber-Pipeline: acht Stufen mit automatischer Wiedervorlage.
 *
 * NEU → VORGEPRÜFT → RÜCKFRAGE → VORSTELLUNGSGESPRÄCH → ZUSAGE →
 * UNTERLAGEN → EINSATZBEREIT, Ausstieg ABGELEHNT.
 *
 * ── WO DIE STUFE STEHT ────────────────────────────────────────────────
 * `lead_inquiries.status` trägt einen CHECK auf genau fünf CRM-Werte
 * (new, contacted, qualified, converted, lost — live am 11.09.2026 per
 * 23514-Probe belegt). Acht Stufen passen da nicht hinein, und die Spalte
 * zu erweitern bräuchte DDL, die aus einer Agentensitzung nicht geht.
 *
 * Deshalb zwei Ebenen:
 *   bewerbung_daten.pipeline.stufe   die feine Stufe (jsonb, keine Migration)
 *   status                           die grobe CRM-Stufe, aus der feinen
 *                                    abgeleitet und IMMER mitgeschrieben
 *
 * Die grobe Stufe bleibt dadurch für /mis/crm, das Marketing-Dashboard und
 * jeden anderen Leser richtig: eine Zusage ist dort „qualified", eine
 * Einsatzbereitschaft „converted".
 *
 * ── WENN BEIDE AUSEINANDERLAUFEN ──────────────────────────────────────
 * Stellt jemand den Status an anderer Stelle um (/mis/crm), passt die
 * gespeicherte feine Stufe nicht mehr zur groben. Dann gewinnt der Status:
 * er ist die Spalte mit CHECK und der Wert, den alle anderen sehen. Die
 * feine Stufe wird aus ihm abgeleitet, statt eine veraltete Angabe
 * anzuzeigen.
 *
 * ── AUTOMATISCHE WIEDERVORLAGE ────────────────────────────────────────
 * Jeder Stufenwechsel setzt `lead_inquiries.follow_up_date` (live, Typ
 * date) auf heute + Stufenfrist. Endzustände setzen es auf NULL. Die
 * Tages-Kette `lead_follow_up` und die Admin-Seite lesen dieselbe Spalte.
 */

import {
  berlinerTagPlus, followUpSeitEingang, followUpSeitWiedervorlage, plusTage,
  tagAlsZeitpunkt, type FollowUpStufe,
} from '@/lib/leads/follow-up'

export interface BewerberStufe {
  key: string
  label: string
  color: string
  /** Wert in `lead_inquiries.status` (CHECK: new|contacted|qualified|converted|lost). */
  dbStatus: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  /** Kalendertage bis zur nächsten Wiedervorlage; `null` = Endzustand. */
  wiedervorlageTage: number | null
  /** Was in dieser Stufe zu tun ist — steht in der Zeile, nicht in einem Handbuch. */
  aufgabe: string
}

export const BEWERBER_STUFEN: readonly BewerberStufe[] = [
  { key: 'neu', label: 'Neu', color: '#2196F3', dbStatus: 'new', wiedervorlageTage: 1,
    aufgabe: 'Bewerbung sichten und Erstkontakt aufnehmen' },
  { key: 'vorgeprueft', label: 'Vorgeprüft', color: '#03A9F4', dbStatus: 'contacted', wiedervorlageTage: 2,
    aufgabe: 'Passt grundsätzlich — Gesprächstermin anbieten' },
  { key: 'rueckfrage', label: 'Rückfrage', color: '#E8A000', dbStatus: 'contacted', wiedervorlageTage: 3,
    aufgabe: 'Offene Angaben erfragen, Antwort nachhalten' },
  { key: 'vorstellungsgespraech', label: 'Vorstellungsgespräch', color: '#9C27B0', dbStatus: 'qualified', wiedervorlageTage: 7,
    aufgabe: 'Gespräch führen und Entscheidung festhalten' },
  { key: 'zusage', label: 'Zusage', color: '#7E57C2', dbStatus: 'qualified', wiedervorlageTage: 3,
    aufgabe: 'Zusage mitteilen, Unterlagen anfordern' },
  { key: 'unterlagen', label: 'Unterlagen', color: '#26A69A', dbStatus: 'qualified', wiedervorlageTage: 5,
    aufgabe: 'Führungszeugnis, Nachweise und Vertrag einsammeln' },
  { key: 'einsatzbereit', label: 'Einsatzbereit', color: '#5CB882', dbStatus: 'converted', wiedervorlageTage: null,
    aufgabe: 'Abgeschlossen — in Personal übernehmen' },
  { key: 'abgelehnt', label: 'Abgelehnt', color: '#D04B3B', dbStatus: 'lost', wiedervorlageTage: null,
    aufgabe: 'Abgeschlossen' },
] as const

export const BEWERBER_STUFEN_FLOW: readonly string[] = BEWERBER_STUFEN.map(s => s.key)

/** Vorwärtsweg ohne Ausstieg. */
export const BEWERBER_VORWAERTS: readonly string[] = BEWERBER_STUFEN_FLOW.filter(s => s !== 'abgelehnt')

export const BEWERBER_ENDZUSTAENDE: readonly string[] = ['einsatzbereit', 'abgelehnt']

/**
 * Grobe → feine Stufe für Bewerbungen ohne gespeicherte Pipeline
 * (die 34+ Altbestände) und für auseinandergelaufene Stände.
 * `contacted` → vorgeprüft, `qualified` → Vorstellungsgespräch: jeweils die
 * erste feine Stufe, die zur groben passt — nie eine, die mehr behauptet.
 */
const STATUS_ZU_STUFE: Record<string, string> = {
  new: 'neu',
  contacted: 'vorgeprueft',
  qualified: 'vorstellungsgespraech',
  converted: 'einsatzbereit',
  lost: 'abgelehnt',
}

export function istBewerberStufe(wert: unknown): wert is string {
  return typeof wert === 'string' && BEWERBER_STUFEN_FLOW.includes(wert)
}

export function bewerberStufe(key: string): BewerberStufe {
  return BEWERBER_STUFEN.find(s => s.key === key) ?? BEWERBER_STUFEN[0]
}

export interface PipelineVerlauf {
  stufe: string
  am: string
  /** Anzeigename der Verwaltung. Kein Personenname nach außen — nur intern. */
  von: string | null
}

export interface PipelineStand {
  stufe: string
  seit: string
  verlauf: PipelineVerlauf[]
}

/** Höchstens so viele Verlaufseinträge im jsonb — es ist kein Audit-Log. */
export const VERLAUF_MAX = 20

function pipelineAus(daten: unknown): PipelineStand | null {
  if (!daten || typeof daten !== 'object') return null
  const p = (daten as Record<string, unknown>).pipeline
  if (!p || typeof p !== 'object') return null
  const stand = p as Partial<PipelineStand>
  if (!istBewerberStufe(stand.stufe) || typeof stand.seit !== 'string') return null
  return {
    stufe: stand.stufe,
    seit: stand.seit,
    verlauf: Array.isArray(stand.verlauf) ? stand.verlauf.filter(v => v && istBewerberStufe(v.stufe)) : [],
  }
}

/**
 * Feine Stufe einer Bewerbung. Gespeicherte Pipeline gilt nur, solange sie
 * zum Status passt — sonst gewinnt der Status (siehe Kopfkommentar).
 */
export function stufeFuerBewerbung(daten: unknown, status: string | null | undefined): {
  stufe: string
  seit: string | null
  ausStatus: boolean
} {
  const p = pipelineAus(daten)
  const s = status || 'new'
  if (p && bewerberStufe(p.stufe).dbStatus === s) {
    return { stufe: p.stufe, seit: p.seit, ausStatus: false }
  }
  return { stufe: STATUS_ZU_STUFE[s] ?? 'neu', seit: null, ausStatus: true }
}

/**
 * Neue jsonb-Nutzlast mit gesetzter Stufe. Alle übrigen Schlüssel bleiben
 * unangetastet — `bewerbung_daten` trägt die Formularangaben (version 1)
 * bzw. den Onboarding-Stand, und die dürfen durch einen Stufenwechsel
 * nicht verloren gehen.
 */
export function mitPipelineStufe(
  daten: unknown,
  stufe: string,
  jetzt: Date,
  von: string | null,
): Record<string, unknown> {
  const basis: Record<string, unknown> = daten && typeof daten === 'object' && !Array.isArray(daten)
    ? { ...(daten as Record<string, unknown>) }
    : {}
  const alt = pipelineAus(daten)
  const am = jetzt.toISOString()
  const verlauf = [...(alt?.verlauf ?? []), { stufe, am, von }].slice(-VERLAUF_MAX)
  basis.pipeline = { stufe, seit: am, verlauf } satisfies PipelineStand
  return basis
}

/**
 * `true`, wenn die jsonb-Nutzlast echte Formularangaben trägt
 * (/api/apply, version 1). Ein reiner Pipeline-Stand ist keine
 * Formularangabe — die Detailansicht soll dann den Altbestand-Hinweis
 * zeigen statt einer Reihe leerer Felder.
 */
export function hatFormularangaben(daten: unknown): boolean {
  return !!daten && typeof daten === 'object' && (daten as Record<string, unknown>).version === 1
}

// ── Follow-up ──────────────────────────────────────────────────────────

export interface BewerbungFollowUpEingabe {
  stufe: string
  created_at: string | null
  updated_at?: string | null
  /** `lead_inquiries.follow_up_date` (YYYY-MM-DD). */
  follow_up_date: string | null
}

/**
 * Wann ist die Bewerbung wieder dran? Gesetzte `follow_up_date` gilt;
 * fehlt sie (Altbestand, Stufe außerhalb dieser Seite gewechselt), zählt
 * letzte Änderung + Stufenfrist — eine offene Bewerbung ohne Datum darf
 * nicht aus jeder Wiedervorlage herausfallen.
 */
export function wiedervorlageFuerBewerbung(e: BewerbungFollowUpEingabe): string | null {
  if (BEWERBER_ENDZUSTAENDE.includes(e.stufe)) return null
  const gesetzt = tagAlsZeitpunkt(e.follow_up_date)
  if (gesetzt) return gesetzt
  const tage = bewerberStufe(e.stufe).wiedervorlageTage
  const basis = e.updated_at || e.created_at
  return tage !== null && basis ? plusTage(basis, tage) : null
}

/**
 * NEU: 24/48/72 h ab Eingang. Spätere offene Stufen: dieselbe Leiter ab
 * der Wiedervorlage. Endzustände: nie.
 */
export function followUpFuerBewerbung(e: BewerbungFollowUpEingabe, jetzt: Date = new Date()): FollowUpStufe {
  if (BEWERBER_ENDZUSTAENDE.includes(e.stufe)) return 'keine'
  if (e.stufe === 'neu') return followUpSeitEingang(e.created_at, jetzt)
  return followUpSeitWiedervorlage(wiedervorlageFuerBewerbung(e), jetzt)
}

/** follow_up_date für einen Stufenwechsel — NULL bei Endzuständen. */
export function naechsteWiedervorlage(stufe: string, jetzt: Date): string | null {
  const tage = bewerberStufe(stufe).wiedervorlageTage
  return tage === null ? null : berlinerTagPlus(jetzt, tage)
}
