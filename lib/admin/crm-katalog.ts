/**
 * Die Statuskataloge des CRM — an EINER Stelle.
 *
 * ── WARUM DIESE DATEI ENTSTANDEN IST ──────────────────────────────────
 * Am 13.09.2026 gab es zwei Kataloge für denselben Wert:
 *
 *   app/mis/crm/page.tsx   lead · erstgespraech · active · paused · ended
 *   app/mis/crm/actions.ts new · contact · consultation · trial · active
 *                          · paused · churned
 *
 * Gemeinsam hatten sie `active` und `paused`. Die Oberfläche bot also drei
 * Stufen an, welche die Server Action nicht kannte — sie schrieb dann den
 * rohen Schlüssel in die Aktivität („Status → erstgespraech") — und die
 * Action führte vier Stufen, die niemand je auswählen konnte.
 *
 * Das ist kein Schönheitsfehler: der Aktivitätsverlauf ist das einzige,
 * woran später jemand ablesen kann, was mit einem Kunden geschehen ist.
 * Steht dort ein Schlüssel statt einer Beschriftung, ist der Verlauf für
 * die Person, die ihn liest, wertlos.
 *
 * ── DIE KATALOGE SIND DIE ERLAUBNISLISTE ──────────────────────────────
 * `istClientPipelineStatus` und `istLeadStatus` sind fail-closed: was hier
 * nicht steht, wird gar nicht erst an die Datenbank geschickt. Ein
 * unbekannter Wert liefe sonst entweder in einen CHECK-Fehler (laut) oder
 * in eine Spalte ohne CHECK (still) — und das Zweite ist schlimmer.
 */

import { APPLICATION_FLOW } from '@/lib/admin/ops'

export interface StatusEintrag {
  label: string
  color: string
}

/**
 * Die Pipeline-Kacheln der MIS-Oberfläche tragen IMMER ein Symbol —
 * deshalb ein eigener Typ statt eines optionalen Feldes. Ein `icon?`
 * zwänge jede Verwendungsstelle zu einem Ersatzwert, und der erste, der
 * dort `'inbox'` einsetzt, hat eine stille Falschanzeige gebaut.
 */
export interface PipelineEintrag extends StatusEintrag {
  icon: string
}

/**
 * `clients.pipeline_status`.
 *
 * Die fünf Stufen, welche die Oberfläche tatsächlich anbietet. Die
 * abweichende Liste aus der Server Action ist **nicht** übernommen worden:
 * live trägt keine einzige Zeile einen ihrer Werte (4 × `active`, sonst
 * nichts), sie war also nie in Gebrauch.
 */
export const CLIENT_PIPELINE: Record<string, PipelineEintrag> = {
  lead: { label: 'Lead', color: '#3B82F6', icon: 'inbox' },
  erstgespraech: { label: 'Erstgespräch', color: '#F59E0B', icon: 'messageCircle' },
  active: { label: 'Aktiv', color: '#22C55E', icon: 'check' },
  paused: { label: 'Pausiert', color: '#8A8278', icon: 'clock' },
  ended: { label: 'Beendet', color: '#EF4444', icon: 'x' },
}

/**
 * `lead_inquiries.status`.
 *
 * Dieselben fünf Werte wie `APPLICATION_FLOW` in `lib/admin/ops.ts` — dort
 * für Bewerbungen, hier für Kundenanfragen. Es ist **dieselbe Spalte**;
 * ein Test hält die beiden Listen deshalb aneinander.
 */
export const LEAD_STATUS: Record<string, StatusEintrag> = {
  new: { label: 'Neu', color: '#3B82F6' },
  contacted: { label: 'Kontaktiert', color: '#F59E0B' },
  qualified: { label: 'Qualifiziert', color: '#22C55E' },
  converted: { label: 'Konvertiert', color: '#C9A961' },
  lost: { label: 'Verloren', color: '#EF4444' },
}

/** Erlaubnisliste, fail-closed. */
export function istClientPipelineStatus(wert: unknown): wert is string {
  return typeof wert === 'string' && Object.prototype.hasOwnProperty.call(CLIENT_PIPELINE, wert)
}

export function istLeadStatus(wert: unknown): wert is string {
  return typeof wert === 'string' && Object.prototype.hasOwnProperty.call(LEAD_STATUS, wert)
}

/**
 * Beschriftung für den Aktivitätsverlauf.
 *
 * Fällt bewusst auf den Schlüssel zurück, statt zu werfen: ein Verlauf mit
 * einem rohen Schlüssel ist unschön, ein fehlender Verlauf ist schlimmer.
 * Die Erlaubnisliste oben verhindert den Fall ohnehin vorher.
 */
export function statusLabel(katalog: Record<string, StatusEintrag>, wert: string): string {
  return katalog[wert]?.label ?? wert
}

/** Für Tests und Prüfungen: die Schlüssel in Anzeigereihenfolge. */
export const CLIENT_PIPELINE_KEYS = Object.keys(CLIENT_PIPELINE)
export const LEAD_STATUS_KEYS = Object.keys(LEAD_STATUS)

/**
 * Sind Kundenanfragen- und Bewerbungsliste deckungsgleich?
 *
 * Wird vom Test benutzt und steht hier, damit die Behauptung neben den
 * Daten wohnt, über die sie spricht.
 */
export function deckungsgleichMitApplicationFlow(): boolean {
  return LEAD_STATUS_KEYS.length === APPLICATION_FLOW.length
    && LEAD_STATUS_KEYS.every(k => APPLICATION_FLOW.includes(k))
}

// ═══════════════════════════════════════════════════════════════════════
// Aktivitätsarten
// ═══════════════════════════════════════════════════════════════════════

/**
 * `mis_crm_activities.activity_type`.
 *
 * Spiegelt den CHECK aus Migration `20260705000000_crm_module_tables.sql`.
 * Ein Test hält die Liste an die Migration — dieselbe Regel wie bei
 * `CLIENT_PIPELINE`.
 */
export const AKTIVITAET_TYPEN: Record<string, StatusEintrag> = {
  call: { label: 'Telefonat', color: '#3B82F6' },
  email: { label: 'E-Mail', color: '#8B5CF6' },
  visit: { label: 'Besuch', color: '#22C55E' },
  note: { label: 'Notiz', color: '#8A8278' },
  follow_up: { label: 'Wiedervorlage', color: '#F59E0B' },
  status_change: { label: 'Statuswechsel', color: '#C9A961' },
}

export const AKTIVITAET_TYPEN_KEYS = Object.keys(AKTIVITAET_TYPEN)

export function istAktivitaetsTyp(wert: unknown): wert is string {
  return typeof wert === 'string' && Object.prototype.hasOwnProperty.call(AKTIVITAET_TYPEN, wert)
}

/**
 * Längengrenzen einer Aktivität.
 *
 * `title` steht in der Verlaufsliste und muss dort lesbar bleiben;
 * `description` trägt den Freitext.
 */
export const AKTIVITAET_MAX_LEN = { title: 200, description: 4000 } as const

export interface AktivitaetEingabe {
  activity_type: string
  title: string
  description?: string
  client_id?: string
  lead_id?: string
}

export interface AktivitaetPruefErgebnis {
  aktivitaet: AktivitaetEingabe | null
  fehler: string | null
}

/**
 * Prüft eine von Hand angelegte Aktivität.
 *
 * ── GENAU EIN BEZUG ───────────────────────────────────────────────────
 * Eine Aktivität ohne `client_id` und ohne `lead_id` hängt an nichts: sie
 * steht in keiner Verlaufsliste und ist nur noch über einen direkten
 * Tabellenblick auffindbar. Eine mit beidem behauptet, derselbe Vorgang
 * sei ein Kunde UND eine Anfrage. Beides wird abgewiesen.
 *
 * `performed_by` kommt bewusst NICHT aus der Eingabe — siehe
 * `createActivity`.
 */
export function pruefeAktivitaet(roh: Record<string, unknown>): AktivitaetPruefErgebnis {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    return { aktivitaet: null, fehler: 'Keine Angaben übergeben.' }
  }
  if (!istAktivitaetsTyp(roh.activity_type)) {
    return { aktivitaet: null, fehler: `Unbekannte Aktivitätsart: ${String(roh.activity_type)}` }
  }

  const text = (k: 'title' | 'description', pflicht: boolean): string | { fehler: string } => {
    const w = roh[k]
    if (w === undefined || w === null || w === '') {
      return pflicht ? { fehler: `${k} fehlt.` } : ''
    }
    if (typeof w !== 'string') return { fehler: `Ungültige Angabe: ${k}` }
    const t = w.trim()
    if (!t && pflicht) return { fehler: `${k} fehlt.` }
    if (t.length > AKTIVITAET_MAX_LEN[k]) {
      return { fehler: `${k} ist zu lang (max. ${AKTIVITAET_MAX_LEN[k]} Zeichen)` }
    }
    return t
  }

  const title = text('title', true)
  if (typeof title !== 'string') return { aktivitaet: null, fehler: title.fehler }
  const description = text('description', false)
  if (typeof description !== 'string') return { aktivitaet: null, fehler: description.fehler }

  const client = typeof roh.client_id === 'string' && roh.client_id ? roh.client_id : undefined
  const lead = typeof roh.lead_id === 'string' && roh.lead_id ? roh.lead_id : undefined
  if (!client && !lead) {
    return { aktivitaet: null, fehler: 'Aktivität ohne Bezug — Kunde oder Anfrage angeben.' }
  }
  if (client && lead) {
    return { aktivitaet: null, fehler: 'Aktivität kann nicht zu Kunde UND Anfrage gehören.' }
  }

  return {
    aktivitaet: { activity_type: roh.activity_type, title, description: description || undefined, client_id: client, lead_id: lead },
    fehler: null,
  }
}

