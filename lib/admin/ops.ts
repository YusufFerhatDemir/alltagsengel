// ═══════════════════════════════════════════════════════════════
// Alltagsengel Betriebssystem — gemeinsame Helfer für /admin
// ═══════════════════════════════════════════════════════════════
// Formatierung, Budget-Ampel-Logik und Status-Maps. Wird von allen
// operativen Admin-Seiten (clients, records, budgets, invoices,
// caregivers, partners) geteilt, damit Logik & Optik konsistent
// bleiben.
// ═══════════════════════════════════════════════════════════════

// Entlastungsbetrag nach §45b SGB XI.
//
// Kein eigener Zahlenwert mehr: die gesetzlichen Saetze stehen versioniert in
// lib/config/budget-constants.ts (BUDGET_VERSIONEN). Ein zweiter hartkodierter
// Wert hier wuerde bei der naechsten Dynamisierung nach §30 SGB XI stillschweigend
// auseinanderlaufen — die Abrechnung rechnete dann mit dem neuen Satz, waehrend
// /admin/budgets und /kunde/budget dem Kunden weiter den alten anzeigen.
import {
  ENTLASTUNG_MONATLICH_EUR,
  ENTLASTUNG_JAEHRLICH_EUR,
} from '@/lib/config/budget-constants'
import { euroZuCent } from '@/lib/geld'

export const ENTLASTUNGSBETRAG_MONAT = ENTLASTUNG_MONATLICH_EUR
export const ENTLASTUNGSBETRAG_JAHR = ENTLASTUNG_JAEHRLICH_EUR

// ── Formatierung ────────────────────────────────────────────────
export function euro(value: number | null | undefined): string {
  const n = typeof value === 'number' ? value : 0
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return '—'
  // "14:30:00" → "14:30"
  return t.slice(0, 5)
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Gerade eben'
  if (mins < 60) return `vor ${mins} Min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `vor ${hours} Std`
  const days = Math.floor(hours / 24)
  return `vor ${days} Tag${days > 1 ? 'en' : ''}`
}

export function fullName(p?: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!p) return '—'
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—'
}

// ── Budget-Ampel ────────────────────────────────────────────────
// 🟢 < 70 % verbraucht · 🟡 70–95 % · 🔴 > 95 % oder überzogen
export type Ampel = 'gruen' | 'gelb' | 'rot'

export interface BudgetRow {
  monthly_amount?: number | null
  annual_amount?: number | null
  carryover_amount?: number | null
  carryover_expires?: string | null
  used_amount?: number | null
  used_from_carryover?: number | null
  private_amount?: number | null
}

export interface BudgetSummary {
  available: number        // gesamtes verfügbares Budget (Jahr + Übertrag)
  used: number             // gesamt verbraucht
  remaining: number        // verbleibend (kann negativ sein → privat)
  pct: number              // verbrauchter Anteil 0..100+
  ampel: Ampel
  carryover: number        // Vorjahresübertrag
  carryoverExpiresSoon: boolean
  carryoverExpired: boolean
}

export function summarizeBudget(b: BudgetRow | null | undefined): BudgetSummary {
  const annual = b?.annual_amount ?? ENTLASTUNGSBETRAG_JAHR
  const carryover = b?.carryover_amount ?? 0
  const used = b?.used_amount ?? 0
  const available = annual + carryover
  const remaining = available - used
  const pct = available > 0 ? Math.round((used / available) * 100) : 0

  let ampel: Ampel = 'gruen'
  if (pct > 95 || remaining < 0) ampel = 'rot'
  else if (pct >= 70) ampel = 'gelb'

  return {
    available,
    used,
    remaining,
    pct,
    ampel,
    carryover,
    carryoverExpiresSoon: carryoverExpiresSoon(b?.carryover_expires, carryover),
    carryoverExpired: carryoverExpired(b?.carryover_expires, carryover),
  }
}

// Vorjahresübertrag verfällt zum 30. Juni — zuerst verbrauchen!
function carryoverExpiresSoon(expires: string | null | undefined, carryover: number): boolean {
  if (!expires || carryover <= 0) return false
  const d = new Date(expires)
  if (isNaN(d.getTime())) return false
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000)
  return daysLeft >= 0 && daysLeft <= 60
}

function carryoverExpired(expires: string | null | undefined, carryover: number): boolean {
  if (!expires || carryover <= 0) return false
  const d = new Date(expires)
  if (isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}

export const AMPEL_META: Record<Ampel, { emoji: string; color: string; label: string }> = {
  gruen: { emoji: '🟢', color: '#5CB882', label: 'Im Rahmen' },
  gelb: { emoji: '🟡', color: '#E8A000', label: 'Achtung' },
  rot: { emoji: '🔴', color: '#D04B3B', label: 'Kritisch' },
}

// ── Status-Maps ─────────────────────────────────────────────────
export const RECORD_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: '#999' },
  incomplete: { label: 'Unvollständig', color: '#E8A000' },
  complete: { label: 'Vollständig', color: '#2196F3' },
  signed: { label: 'Unterschrieben', color: '#5CB882' },
  invoiced: { label: 'Abgerechnet', color: '#9C27B0' },
}

export const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: '#999' },
  sent: { label: 'Versendet', color: '#2196F3' },
  paid: { label: 'Bezahlt', color: '#5CB882' },
  partial: { label: 'Teilbezahlt', color: '#E8A000' },
  rejected: { label: 'Abgelehnt', color: '#D04B3B' },
  disputed: { label: 'Strittig', color: '#FF7043' },
  // Neue deutsche Status (PR #35 Statusmaschine)
  entwurf: { label: 'Entwurf', color: '#999' },
  geprueft: { label: 'Geprüft', color: '#7B68EE' },
  freigegeben: { label: 'Freigegeben', color: '#4CAF50' },
  uebermittelt: { label: 'Übermittelt', color: '#2196F3' },
  quittiert: { label: 'Quittiert', color: '#00BCD4' },
  bezahlt: { label: 'Bezahlt', color: '#5CB882' },
  teilweise_bezahlt: { label: 'Teilweise bezahlt', color: '#E8A000' },
  gekuerzt: { label: 'Gekürzt', color: '#FF9800' },
  abgelehnt: { label: 'Abgelehnt', color: '#D04B3B' },
  korrektur_erforderlich: { label: 'Korrektur erforderlich', color: '#F44336' },
  akzeptiert: { label: 'Akzeptiert', color: '#4CAF50' },
  storniert: { label: 'Storniert', color: '#9E9E9E' },
  erneut_eingereicht: { label: 'Erneut eingereicht', color: '#03A9F4' },
  strittig: { label: 'Strittig', color: '#FF7043' },
}

export const CLIENT_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktiv', color: '#5CB882' },
  new: { label: 'Neu', color: '#2196F3' },
  paused: { label: 'Pausiert', color: '#E8A000' },
  inactive: { label: 'Inaktiv', color: '#999' },
  archived: { label: 'Archiviert', color: '#777' },
}

export const CAREGIVER_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktiv', color: '#5CB882' },
  available: { label: 'Verfügbar', color: '#2196F3' },
  busy: { label: 'Im Einsatz', color: '#E8A000' },
  inactive: { label: 'Inaktiv', color: '#999' },
  onboarding: { label: 'Onboarding', color: '#9C27B0' },
}

export const QUALIFICATION_STATUS: Record<string, { label: string; color: string }> = {
  valid: { label: 'Gültig', color: '#5CB882' },
  expiring: { label: 'Läuft ab', color: '#E8A000' },
  expired: { label: 'Abgelaufen', color: '#D04B3B' },
}

export const ABSENCE_TYPE: Record<string, { label: string; color: string }> = {
  sick: { label: 'Krank', color: '#D04B3B' },
  vacation: { label: 'Urlaub', color: '#2196F3' },
  short_notice: { label: 'Kurzfristig', color: '#FF7043' },
  personal: { label: 'Persönlich', color: '#7E57C2' },
  other: { label: 'Sonstige', color: '#999' },
  fortbildung: { label: 'Fortbildung', color: '#26A69A' },
  mutterschutz: { label: 'Mutterschutz', color: '#EC407A' },
  elternzeit: { label: 'Elternzeit', color: '#AB47BC' },
  sonderurlaub: { label: 'Sonderurlaub', color: '#5C6BC0' },
  unbezahlt: { label: 'Unbezahlter Urlaub', color: '#8D6E63' },
}

export const ABSENCE_STATUS: Record<string, { label: string; color: string }> = {
  beantragt: { label: 'Beantragt', color: '#E8A000' },
  genehmigt: { label: 'Genehmigt', color: '#5CB882' },
  abgelehnt: { label: 'Abgelehnt', color: '#D04B3B' },
  storniert: { label: 'Storniert', color: '#999' },
}

export const VERTRAGSSTATUS: Record<string, { label: string; color: string }> = {
  aktiv: { label: 'Aktiv', color: '#5CB882' },
  gekuendigt: { label: 'Gekündigt', color: '#E8A000' },
  ausgeschieden: { label: 'Ausgeschieden', color: '#D04B3B' },
  ruhend: { label: 'Ruhend', color: '#999' },
}

export const SCHULUNGSART: Record<string, { label: string; color: string }> = {
  pflichtschulung: { label: 'Pflichtschulung', color: '#D04B3B' },
  fortbildung: { label: 'Fortbildung', color: '#2196F3' },
  auffrischung: { label: 'Auffrischung', color: '#E8A000' },
  einarbeitung: { label: 'Einarbeitung', color: '#26A69A' },
  extern: { label: 'Extern', color: '#7E57C2' },
  sonstiges: { label: 'Sonstiges', color: '#999' },
}

export const DIENSTPLAN_STATUS: Record<string, { label: string; color: string }> = {
  geplant: { label: 'Geplant', color: '#999' },
  bestaetigt: { label: 'Bestätigt', color: '#2196F3' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#E8A000' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#5CB882' },
  ausgefallen: { label: 'Ausgefallen', color: '#D04B3B' },
  vertretung: { label: 'Vertretung', color: '#7E57C2' },
}

export const DIENSTPLAN_TYP: Record<string, { label: string; color: string }> = {
  regulaer: { label: 'Regulär', color: '#5CB882' },
  vertretung: { label: 'Vertretung', color: '#7E57C2' },
  ueberstunden: { label: 'Überstunden', color: '#E8A000' },
  bereitschaft: { label: 'Bereitschaft', color: '#2196F3' },
  notdienst: { label: 'Notdienst', color: '#D04B3B' },
}

export const ARBEITSZEIT_STATUS: Record<string, { label: string; color: string }> = {
  erfasst: { label: 'Erfasst', color: '#999' },
  bestaetigt: { label: 'Bestätigt', color: '#5CB882' },
  korrigiert: { label: 'Korrigiert', color: '#E8A000' },
  gesperrt: { label: 'Gesperrt', color: '#D04B3B' },
}

export const ARBEITSZEIT_QUELLE: Record<string, { label: string; color: string }> = {
  manuell: { label: 'Manuell', color: '#999' },
  app: { label: 'App', color: '#2196F3' },
  dienstplan: { label: 'Dienstplan', color: '#5CB882' },
  import: { label: 'Import', color: '#7E57C2' },
}

export const WARNSTUFE: Record<string, { label: string; color: string }> = {
  ok: { label: 'OK', color: '#5CB882' },
  warnung_90: { label: '≤ 90 Tage', color: '#C9963C' },
  warnung_60: { label: '≤ 60 Tage', color: '#E8A000' },
  warnung_30: { label: '≤ 30 Tage', color: '#E8A000' },
  kritisch_7: { label: '≤ 7 Tage', color: '#D04B3B' },
  abgelaufen: { label: 'Abgelaufen', color: '#D04B3B' },
  kein_datum: { label: 'Kein Datum', color: '#999' },
}

export const PARTNER_TYPE: Record<string, { label: string; color: string }> = {
  arzt: { label: 'Arztpraxis', color: '#2196F3' },
  apotheke: { label: 'Apotheke', color: '#5CB882' },
  pflegedienst: { label: 'Pflegedienst', color: '#9C27B0' },
  sanitaetshaus: { label: 'Sanitätshaus', color: '#FF7043' },
  krankenkasse: { label: 'Krankenkasse', color: '#E8A000' },
  beratungsstelle: { label: 'Beratungsstelle', color: '#26A69A' },
  sonstige: { label: 'Sonstige', color: '#999' },
}

export const BUDGET_TYPE: Record<string, string> = {
  entlastung: 'Entlastungsbetrag §45b',
  verhinderung: 'Verhinderungspflege',
  carryover: 'Vorjahresübertrag',
  private: 'Privat',
}

// ── Leistungsarten (service_records.service_type) ────────────────
// Gemeinsame Liste für alle Erfassungs-Masken (Admin /admin/records/new und
// Personal-Bereich /mis/team). service_type ist eine freie Textspalte — die
// Auswahl hier hält die Schreibweise über alle Eingabewege hinweg identisch,
// damit Auswertungen und der Leistungsnachweis-PDF sauber gruppieren.
export const SERVICE_TYPES = [
  'Alltagsbegleitung',
  'Haushaltshilfe',
  'Einkaufshilfe',
  'Arztbegleitung',
  'Betreuung / Gesellschaft',
  'Spaziergang / Mobilität',
  'Demenzbetreuung',
  'Sonstige',
] as const

// Minuten zwischen zwei "HH:MM"-Zeiten (über Mitternacht hinweg robust).
export function diffMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins
}

// "95" → "1 h 35 min"
export function formatDuration(mins: number): string {
  if (!mins || mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

// Ausführliche Budget-Topf-Labels für offizielle Dokumente (Leistungsnachweis,
// Rechnung an die Pflegekasse) — vollständige Paragraphen-Angabe Pflicht!
export const BUDGET_TYPE_PDF: Record<string, string> = {
  entlastung: 'Entlastungsbetrag gem. §45b SGB XI',
  verhinderung: 'Verhinderungspflege gem. §39 SGB XI',
  carryover: 'Übertrag aus Vorjahr (§45b)',
  private: 'Privatleistung',
}

// ── Verordnungen (verordnungen.verordnung_type) ─────────────────
export const VERORDNUNG_TYPE: Record<string, { label: string; color: string }> = {
  entlastung_45b: { label: 'Entlastungsbetrag §45b', color: '#5CB882' },
  verhinderung_39: { label: 'Verhinderungspflege §39', color: '#2196F3' },
  behandlungspflege_37: { label: 'Behandlungspflege §37', color: '#9C27B0' },
  haeusliche_pflege_36: { label: 'Häusliche Pflege §36', color: '#FF7043' },
  alltagsbegleitung_45a: { label: 'Alltagsbegleitung §45a', color: '#C9963C' },
  pflegebox_40: { label: 'Pflegebox §40', color: '#26A69A' },
  fahrdienst: { label: 'Fahrdienst', color: '#5C6BC0' },
  kombinationsleistung_38: { label: 'Kombinationsleistung §38', color: '#E8A000' },
  sonstige: { label: 'Sonstige', color: '#999' },
}

// ── Verordnung vs. Bewilligung (Eylems Korrektur) ────────────────
// Nur §37 SGB V (Behandlungspflege) braucht eine echte ärztliche Verordnung
// (Muster 12). Alle anderen Typen sind Bewilligungen/Zusagen/Ansprüche —
// dort gibt es keinen Arzt und keine Verordnungsnummer.
export function istVerordnungPflicht(type: string): boolean {
  return type === 'behandlungspflege_37' || type === 'sonstige'
}

// Hinweistext „Keine ärztliche Verordnung nötig" je Bewilligungs-Typ
export const KEINE_VERORDNUNG_HINWEIS: Record<string, string> = {
  haeusliche_pflege_36: 'Keine ärztliche Verordnung nötig — Pflegesachleistung §36 SGB XI. Kommt aus der Kombinationsleistung und braucht die Zusage der Pflegekasse.',
  entlastung_45b: 'Keine ärztliche Verordnung nötig — Entlastungsbetrag §45b SGB XI: 131 €/Monat automatischer Anspruch ab Pflegegrad 1.',
  verhinderung_39: 'Keine ärztliche Verordnung nötig — Verhinderungspflege §39 SGB XI: Antrag bei der Pflegekasse.',
  alltagsbegleitung_45a: 'Keine ärztliche Verordnung nötig — Alltagsbegleitung §45a SGB XI: Anerkennung nach Landesrecht.',
  pflegebox_40: 'Keine ärztliche Verordnung nötig — Pflegehilfsmittel §40 SGB XI: bis 40 €/Monat, Antrag bei der Pflegekasse.',
  fahrdienst: 'Keine ärztliche Verordnung nötig — Fahrdienst wird je nach Kostenträger bewilligt oder privat abgerechnet.',
  kombinationsleistung_38: 'Kombinationsleistung §38 SGB XI (Sachleistung + Pflegegeld) — Kombi-Zusage der Pflegekasse erforderlich.',
}

// Automatisches Monatsbudget je Typ (Cent): §45b = 131 €, §40 = 40 €
export const BUDGET_DEFAULT_CENT: Record<string, number> = {
  entlastung_45b: 13100,
  pflegebox_40: 4000,
}

// ── Genehmigungen der Pflegekasse (verordnungen.genehmigung_status) ─
export const GENEHMIGUNG_STATUS: Record<string, { label: string; color: string }> = {
  ausstehend: { label: 'Ausstehend', color: '#999' },
  beantragt: { label: 'Beantragt', color: '#2196F3' },
  genehmigt: { label: 'Genehmigt', color: '#5CB882' },
  abgelehnt: { label: 'Abgelehnt', color: '#D04B3B' },
  abgelaufen: { label: 'Abgelaufen', color: '#E8A000' },
  widerspruch: { label: 'Widerspruch', color: '#FF7043' },
}

// ── Leistungsarten (verordnungen.leistungsart, verordnung_leistungen.leistungsart) ─
// Grundpflege §37 SGB V + Behandlungspflege-Unterkategorien
// + Alltagsbegleitung/Entlastung/Verhinderungspflege nach SGB XI.
// Alltagsengel deckt BEIDES ab: Alltagsbegleitung §45a UND ambulante Pflege §37.
export const LEISTUNGSART_LABELS: Record<string, { label: string; color: string }> = {
  grosse_koerperpflege: { label: 'Große Körperpflege', color: '#2196F3' },
  kleine_koerperpflege: { label: 'Kleine Körperpflege', color: '#26A69A' },
  hilfe_ausscheiden: { label: 'Hilfe beim Ausscheiden', color: '#7E57C2' },
  hauswirtschaft: { label: 'Hauswirtschaftliche Versorgung', color: '#5CB882' },
  behandlungspflege: { label: 'Behandlungspflege (allgemein)', color: '#9C27B0' },
  medikamentengabe: { label: 'Medikamentengabe', color: '#5C6BC0' },
  injektionen: { label: 'Injektionen', color: '#EC407A' },
  wundversorgung: { label: 'Wundversorgung', color: '#D04B3B' },
  kompressionsstruempfe: { label: 'Kompressionsstrümpfe an/aus', color: '#8D6E63' },
  blutzuckermessung: { label: 'Blutzuckermessung', color: '#FF7043' },
  katheter: { label: 'Katheterversorgung', color: '#26C6DA' },
  stomaversorgung: { label: 'Stomaversorgung', color: '#AB47BC' },
  alltagsbegleitung_45a: { label: 'Alltagsbegleitung §45a', color: '#C9963C' },
  verhinderungspflege_39: { label: 'Verhinderungspflege §39', color: '#42A5F5' },
  entlastung_45b: { label: 'Entlastungsleistung §45b', color: '#66BB6A' },
  pflegebox: { label: 'Pflegebox §40', color: '#26A69A' },
  fahrdienst_begleitung: { label: 'Fahrdienst mit Begleitung', color: '#5C6BC0' },
  fahrdienst_transport: { label: 'Fahrdienst Transport', color: '#7986CB' },
  kombinationsleistung: { label: 'Kombinationsleistung §38', color: '#E8A000' },
  sonstige: { label: 'Sonstige', color: '#999' },
}

// ── Häufigkeit einer Leistungsposition (verordnung_leistungen.haeufigkeit) ─
export const HAEUFIGKEIT_LABELS: Record<string, { label: string; color: string }> = {
  taeglich: { label: 'Täglich', color: '#D04B3B' },
  '2x_taeglich': { label: '2x täglich', color: '#C2185B' },
  '3x_taeglich': { label: '3x täglich', color: '#880E4F' },
  '1x_woche': { label: '1x pro Woche', color: '#5CB882' },
  '2x_woche': { label: '2x pro Woche', color: '#26A69A' },
  '3x_woche': { label: '3x pro Woche', color: '#2196F3' },
  '4x_woche': { label: '4x pro Woche', color: '#5C6BC0' },
  '5x_woche': { label: '5x pro Woche', color: '#7E57C2' },
  '1x_monat': { label: '1x pro Monat', color: '#8D6E63' },
  '2x_monat': { label: '2x pro Monat', color: '#E8A000' },
  nach_bedarf: { label: 'Nach Bedarf', color: '#999' },
}

// ── Abrechnungsstatus je Verordnung (verordnungen.abrechnungs_status) ─
export const ABRECHNUNGS_STATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#999' },
  teilweise_abgerechnet: { label: 'Teilweise abgerechnet', color: '#E8A000' },
  vollstaendig_abgerechnet: { label: 'Vollständig abgerechnet', color: '#5CB882' },
}

// Gültigkeits-Ampel für Verordnungen/Genehmigungen:
// 🔴 ≤14 Tage (oder abgelaufen) · 🟡 ≤30 Tage · 🟢 sonst
export function gueltigkeitsAmpel(bis: string | null | undefined): Ampel | null {
  const d = daysUntil(bis)
  if (d === null) return null
  if (d <= 14) return 'rot'
  if (d <= 30) return 'gelb'
  return 'gruen'
}

// ── Kostenträger (verordnungen.kostentraeger_typ, kostentraeger_kontakte.typ) ─
// Gilt für Pflegedienst + Betreuung, NICHT Intensivpflege.
export const KOSTENTRAEGER_TYP: Record<string, { label: string; color: string }> = {
  krankenkasse: { label: 'Krankenkasse', color: '#2196F3' },
  pflegekasse: { label: 'Pflegekasse', color: '#C9963C' },
  sozialamt: { label: 'Sozialamt', color: '#9C27B0' },
  privat: { label: 'Privat', color: '#5CB882' },
  berufsgenossenschaft: { label: 'Berufsgenossenschaft', color: '#E8A000' },
  beihilfe: { label: 'Beihilfe', color: '#26A69A' },
  pkv: { label: 'Private Krankenversicherung (PKV)', color: '#7E57C2' },
}

// ── Bundesländer (leistungspreise.bundesland, kostentraeger_kontakte.bundesland) ─
export const BUNDESLAND_LABELS: Record<string, string> = {
  baden_wuerttemberg: 'Baden-Württemberg',
  bayern: 'Bayern',
  berlin: 'Berlin',
  brandenburg: 'Brandenburg',
  bremen: 'Bremen',
  hamburg: 'Hamburg',
  hessen: 'Hessen',
  mecklenburg_vorpommern: 'Mecklenburg-Vorpommern',
  niedersachsen: 'Niedersachsen',
  nordrhein_westfalen: 'Nordrhein-Westfalen',
  rheinland_pfalz: 'Rheinland-Pfalz',
  saarland: 'Saarland',
  sachsen: 'Sachsen',
  sachsen_anhalt: 'Sachsen-Anhalt',
  schleswig_holstein: 'Schleswig-Holstein',
  thueringen: 'Thüringen',
}

// ── Absagen (einsatz_absagen.abgesagt_von) ──────────────────────
export const ABSAGE_VON: Record<string, { label: string; color: string }> = {
  klient: { label: 'Klient', color: '#2196F3' },
  mitarbeiterin: { label: 'Mitarbeiterin', color: '#E8A000' },
}

// Cent-Beträge <-> Euro-Anzeige (für preis_cent, soll/ist/kuerzung_cent)
export function centToEuro(cent: number | null | undefined): string {
  if (cent == null) return '—'
  return euro(cent / 100)
}

export function euroToCent(value: string | number | null | undefined): number | null {
  if (value === '' || value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (isNaN(n)) return null
  return euroZuCent(n)
}

export interface LeistungspreisRow {
  bundesland: string
  leistungsart: string
  preis_cent: number
  gueltig_ab: string
  gueltig_bis: string | null
}

// Findet den aktuell gültigen Preis für Bundesland + Leistungsart (Stichtag optional, sonst heute)
export function findLeistungspreis(
  preise: LeistungspreisRow[],
  bundesland: string | null | undefined,
  leistungsart: string | null | undefined,
  stichtag?: string
): LeistungspreisRow | null {
  if (!bundesland || !leistungsart) return null
  const ref = stichtag ? new Date(stichtag) : new Date()
  const matches = preise.filter(p =>
    p.bundesland === bundesland
    && p.leistungsart === leistungsart
    && new Date(p.gueltig_ab) <= ref
    && (!p.gueltig_bis || new Date(p.gueltig_bis) >= ref)
  )
  if (matches.length === 0) return null
  return matches.sort((a, b) => b.gueltig_ab.localeCompare(a.gueltig_ab))[0]
}

// NOTE_CATEGORY und QUALIFICATION_LEVEL: siehe weiter unten
// (Care Notes / Qualifikationsstufe — dort mit NOTE_AUTHOR_ROLE gebündelt)

// ── Abrechnungseinheiten (service_pricing.billing_unit) ─────────
export const BILLING_UNIT: Record<string, string> = {
  stunde: 'pro Stunde',
  einsatz: 'pro Einsatz',
  pauschal: 'Pauschale',
  kilometer: 'pro Kilometer',
}

// ── KI-Leistungsnachweis-Prüfzentrale (ocr_results.status) ───────
export const OCR_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: '#999' },
  processed: { label: 'Verarbeitet', color: '#5CB882' },
  failed: { label: 'Fehlgeschlagen', color: '#D04B3B' },
  needs_review: { label: 'Prüfung nötig', color: '#E8A000' },
}

// ── Monatsabschluss-Assistent (monthly_closings.status) ─────────
export const CLOSING_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Offen', color: '#999' },
  in_review: { label: 'In Prüfung', color: '#E8A000' },
  ready: { label: 'Bereit', color: '#2196F3' },
  closed: { label: 'Abgeschlossen', color: '#5CB882' },
  sent: { label: 'Versendet', color: '#9C27B0' },
}

// ── Prüfprotokoll (review_errors.severity) ───────────────────────
export const REVIEW_SEVERITY: Record<string, { label: string; color: string }> = {
  info: { label: 'Info', color: '#999' },
  warning: { label: 'Warnung', color: '#E8A000' },
  critical: { label: 'Kritisch', color: '#D04B3B' },
}

export const REVIEW_ERROR_TYPE: Record<string, string> = {
  signature_missing: 'Unterschrift fehlt',
  time_mismatch: 'Zeit-Abweichung',
  duplicate: 'Duplikat',
  geo_mismatch: 'Geo-Abweichung',
  amount_mismatch: 'Betrags-Abweichung',
  budget_exceeded: 'Budget überschritten',
  ocr_low_confidence: 'OCR unsicher',
  other: 'Sonstige',
}

// ── Zahlungskontrolle (payment_status.status) ────────────────────
export const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#999' },
  teilbezahlt: { label: 'Teilbezahlt', color: '#E8A000' },
  bezahlt: { label: 'Bezahlt', color: '#5CB882' },
  ueberfaellig: { label: 'Überfällig', color: '#D04B3B' },
  storniert: { label: 'Storniert', color: '#777' },
}

// ── Mahnstufen ────────────────────────────────────────────────────
export const DUNNING_STATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#999' },
  erinnerung: { label: 'Zahlungserinnerung', color: '#E8A000' },
  mahnung_1: { label: '1. Mahnung', color: '#FF7043' },
  mahnung_2: { label: '2. Mahnung', color: '#E65100' },
  letzte_mahnung: { label: 'Letzte Mahnung', color: '#D04B3B' },
  inkasso_vorbereitung: { label: 'Inkasso-Vorbereitung', color: '#B71C1C' },
  bezahlt: { label: 'Bezahlt', color: '#5CB882' },
}

// ── Zahlungs-Matching ─────────────────────────────────────────────
export const MATCHING_STATUS: Record<string, { label: string; color: string }> = {
  automatisch_zugeordnet: { label: 'Automatisch zugeordnet', color: '#5CB882' },
  zuordnung_vorschlag: { label: 'Vorschlag', color: '#E8A000' },
  manuell_zugeordnet: { label: 'Manuell zugeordnet', color: '#2196F3' },
  manuelle_pruefung: { label: 'Manuelle Prüfung', color: '#FF7043' },
  nicht_zugeordnet: { label: 'Nicht zugeordnet', color: '#D04B3B' },
  teilweise_zugeordnet: { label: 'Teilweise zugeordnet', color: '#E8A000' },
}

// ── Differenzen / Widerspruch ─────────────────────────────────────
export const DIFFERENCE_STATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#999' },
  widerspruch_eingereicht: { label: 'Widerspruch eingereicht', color: '#E8A000' },
  widerspruch_anerkannt: { label: 'Widerspruch anerkannt', color: '#5CB882' },
  widerspruch_abgelehnt: { label: 'Widerspruch abgelehnt', color: '#D04B3B' },
  nachforderung: { label: 'Nachforderung', color: '#FF7043' },
  gutschrift: { label: 'Gutschrift erstellt', color: '#2196F3' },
  abschreibung: { label: 'Abgeschrieben', color: '#777' },
  erledigt: { label: 'Erledigt', color: '#5CB882' },
}

// ── Digitale Mitarbeiterakte ────────────────────────────────────
// Pflicht-Dokumente einer Betreuungskraft (Soll-Liste für die Akte)
export const DOCUMENT_TYPE: Record<string, { label: string; color: string }> = {
  arbeitsvertrag: { label: 'Arbeitsvertrag', color: '#2196F3' },
  personalausweis: { label: 'Personalausweis', color: '#26A69A' },
  steuer_id: { label: 'Steuer-ID', color: '#9C27B0' },
  sozialversicherung: { label: 'Sozialversicherungsausweis', color: '#5C6BC0' },
  krankenkasse: { label: 'Krankenkassen-Nachweis', color: '#E8A000' },
  gesundheitszeugnis: { label: 'Gesundheitszeugnis', color: '#26A69A' },
  fuehrungszeugnis: { label: 'Führungszeugnis', color: '#FF7043' },
  erste_hilfe: { label: 'Erste-Hilfe-Kurs', color: '#D04B3B' },
  bankverbindung: { label: 'Bankverbindung', color: '#5CB882' },
  arbeitserlaubnis: { label: 'Arbeitserlaubnis', color: '#7E57C2' },
  sonstige: { label: 'Sonstiges Dokument', color: '#999' },
}

// Soll-Bestand der Akte — diese Dokumente werden in der Checkliste erwartet
export const REQUIRED_DOCUMENTS: string[] = [
  'arbeitsvertrag', 'personalausweis', 'steuer_id', 'sozialversicherung',
  'gesundheitszeugnis', 'fuehrungszeugnis', 'erste_hilfe', 'bankverbindung',
]

// ── Bewerbungen ─────────────────────────────────────────────────
export const APPLICATION_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'Neu', color: '#2196F3' },
  reviewed: { label: 'Gesichtet', color: '#26A69A' },
  invited: { label: 'Eingeladen', color: '#9C27B0' },
  interview: { label: 'Vorstellungsgespräch', color: '#E8A000' },
  accepted: { label: 'Angenommen', color: '#5CB882' },
  rejected: { label: 'Abgelehnt', color: '#D04B3B' },
}

// Reihenfolge des Bewerbungs-Trichters (für Pipeline-Logik)
export const APPLICATION_FLOW = ['new', 'reviewed', 'invited', 'interview', 'accepted', 'rejected']

export const APPLICATION_SOURCE: Record<string, { label: string; emoji: string }> = {
  indeed: { label: 'Indeed', emoji: '🔎' },
  instagram: { label: 'Instagram', emoji: '📸' },
  facebook: { label: 'Facebook', emoji: '👍' },
  kleinanzeigen: { label: 'Kleinanzeigen', emoji: '🏷️' },
  arbeitsagentur: { label: 'Arbeitsagentur', emoji: '🏛️' },
  website: { label: 'Website', emoji: '🌐' },
  empfehlung: { label: 'Empfehlung', emoji: '🤝' },
  sonstige: { label: 'Sonstige', emoji: '•' },
}

// ── Bonus-System / Mitarbeiterbindung ───────────────────────────
export const BONUS_TYPE: Record<string, { label: string; color: string; emoji: string }> = {
  punctuality: { label: 'Pünktlichkeit', color: '#2196F3', emoji: '⏰' },
  reliability: { label: 'Zuverlässigkeit', color: '#5CB882', emoji: '🛡️' },
  customer_rating: { label: 'Kundenbewertung', color: '#E8A000', emoji: '⭐' },
  documentation: { label: 'Dokumentation', color: '#9C27B0', emoji: '📋' },
  training: { label: 'Fortbildung', color: '#26A69A', emoji: '🎓' },
  emergency: { label: 'Notfall-Einsatz', color: '#FF7043', emoji: '🚨' },
  other: { label: 'Sonstige', color: '#999', emoji: '✨' },
}

export const REWARD_TYPE: Record<string, { label: string; emoji: string }> = {
  tankgutschein: { label: 'Tankgutschein', emoji: '⛽' },
  shopping: { label: 'Shopping-Gutschein', emoji: '🛍️' },
  vacation_day: { label: 'Urlaubstag', emoji: '🏖️' },
  bonus_payment: { label: 'Bonuszahlung', emoji: '💶' },
  other: { label: 'Sonstige Prämie', emoji: '🎁' },
}

// ── Einsatzplanung & Vertretung ─────────────────────────────────
export const SUBSTITUTION_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Offen', color: '#E8A000' },
  searching: { label: 'Suche läuft', color: '#2196F3' },
  proposed: { label: 'Vorgeschlagen', color: '#7E57C2' },
  filled: { label: 'Besetzt', color: '#5CB882' },
  escalated: { label: 'Eskaliert', color: '#FF7043' },
  external: { label: 'Extern besetzt', color: '#9C27B0' },
  failed: { label: 'Nicht besetzt', color: '#D04B3B' },
  cancelled: { label: 'Storniert', color: '#999' },
}

// Eskalationsstufen: 0 Automatik · 1 Disposition · 2 Externe Suche
export const ESCALATION_LEVELS: Record<number, { label: string; color: string; emoji: string }> = {
  0: { label: 'Automatik', color: '#5CB882', emoji: '🤖' },
  1: { label: 'Disposition', color: '#E8A000', emoji: '☎️' },
  2: { label: 'Externe Suche', color: '#D04B3B', emoji: '🌍' },
}

// ── Qualitätsmanagement: Zufriedenheitsanrufe ───────────────────
export const CALL_TYPE: Record<string, { label: string; color: string; offsetDays: number | null }> = {
  day7: { label: '7-Tage-Anruf', color: '#2196F3', offsetDays: 7 },
  day30: { label: '30-Tage-Anruf', color: '#26A69A', offsetDays: 30 },
  day90: { label: '90-Tage-Anruf', color: '#9C27B0', offsetDays: 90 },
  recurring: { label: 'Halbjährlich', color: '#5CB882', offsetDays: 182 },
}

// Reihenfolge der Anruf-Kadenz (7 → 30 → 90 → dann alle 6 Monate)
export const CALL_SEQUENCE = ['day7', 'day30', 'day90', 'recurring']

// ── Wochentage (assignments.weekday) ────────────────────────────
// Mo=1 … Sa=6, So=0 (JS getDay-Konvention). Anzeige-Reihenfolge Mo→So.
export const WEEKDAYS: { n: number; short: string; long: string }[] = [
  { n: 1, short: 'Mo', long: 'Montag' },
  { n: 2, short: 'Di', long: 'Dienstag' },
  { n: 3, short: 'Mi', long: 'Mittwoch' },
  { n: 4, short: 'Do', long: 'Donnerstag' },
  { n: 5, short: 'Fr', long: 'Freitag' },
  { n: 6, short: 'Sa', long: 'Samstag' },
  { n: 0, short: 'So', long: 'Sonntag' },
]

// Normalisiert eine weekday-Zahl auf JS-Konvention (7 → 0 für Sonntag)
export function normalizeWeekday(w: number | null | undefined): number | null {
  if (w == null) return null
  return w === 7 ? 0 : w
}

// Sterne-Darstellung für Zufriedenheits-Rating (1..5)
export function stars(rating: number | null | undefined): string {
  const r = Math.max(0, Math.min(5, Math.round(rating ?? 0)))
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

// ── Care Notes — rollenübergreifendes Notizsystem ───────────────
export const NOTE_CATEGORY: Record<string, { label: string; color: string; emoji: string }> = {
  allgemein: { label: 'Allgemein', color: '#999', emoji: '📝' },
  gesundheit: { label: 'Gesundheit', color: '#5CB882', emoji: '🩺' },
  verhalten: { label: 'Verhalten', color: '#7E57C2', emoji: '🧠' },
  medikamente: { label: 'Medikamente', color: '#2196F3', emoji: '💊' },
  vorfall: { label: 'Vorfall', color: '#D04B3B', emoji: '⚠️' },
  uebergabe: { label: 'Übergabe', color: '#26A69A', emoji: '🔄' },
  wunsch: { label: 'Wunsch', color: '#E8A000', emoji: '⭐' },
  beschwerde: { label: 'Beschwerde', color: '#FF7043', emoji: '📣' },
}

// Autor-Rollen einer Notiz (care_notes.author_role)
export const NOTE_AUTHOR_ROLE: Record<string, { label: string; color: string }> = {
  engel: { label: 'Engel', color: '#C9963C' },
  kunde: { label: 'Kunde', color: '#2196F3' },
  buero: { label: 'Büro', color: '#26A69A' },
  pdl: { label: 'PDL', color: '#7E57C2' },
  admin: { label: 'Admin', color: '#D04B3B' },
}

// ── Mobilitätsstatus (clients.mobility_status) ──────────────────
export const MOBILITY_STATUS: Record<string, { label: string; color: string }> = {
  mobil: { label: 'Mobil', color: '#5CB882' },
  eingeschraenkt: { label: 'Eingeschränkt', color: '#E8A000' },
  rollstuhl: { label: 'Rollstuhl', color: '#2196F3' },
  bettlaegerig: { label: 'Bettlägerig', color: '#D04B3B' },
}

// ── Qualifikationsstufe (caregivers.qualification_level) ────────
export const QUALIFICATION_LEVEL: Record<string, { label: string; color: string }> = {
  betreuungskraft_45a: { label: 'Betreuungskraft §45a', color: '#C9963C' },
  pflegehelferin: { label: 'Pflegehelfer/in', color: '#26A69A' },
  pflegefachkraft: { label: 'Pflegefachkraft', color: '#7E57C2' },
  hauswirtschafterin: { label: 'Hauswirtschafter/in', color: '#2196F3' },
  alltagsbegleiterin: { label: 'Alltagsbegleiter/in', color: '#5CB882' },
  sonstige: { label: 'Sonstige', color: '#999' },
}

// Generisches Status-Lookup mit Fallback
export function statusMeta(
  map: Record<string, { label: string; color: string }>,
  status: string | null | undefined
): { label: string; color: string } {
  if (!status) return { label: '—', color: '#999' }
  return map[status] || { label: status, color: '#999' }
}

// Tage bis zu einem Datum (negativ = vergangen)
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

// ── Akten/Dokumentenmanagement (akten_dokumente.dokument_typ) ───
export const AKTEN_DOKUMENT_TYP: Record<string, { label: string; color: string }> = {
  vertrag: { label: 'Vertrag', color: '#C9963C' },
  verordnung: { label: 'Verordnung', color: '#7E57C2' },
  genehmigung: { label: 'Genehmigung', color: '#5CB882' },
  vollmacht: { label: 'Vollmacht', color: '#2196F3' },
  abtretungserklaerung: { label: 'Abtretungserklärung', color: '#26A69A' },
  pflegegradbescheid: { label: 'Pflegegradbescheid', color: '#7E57C2' },
  kostentraegerzusage: { label: 'Kostenträgerzusage', color: '#5CB882' },
  ausweis: { label: 'Ausweis', color: '#999' },
  fuehrerschein: { label: 'Führerschein', color: '#999' },
  fuehrungszeugnis: { label: 'Führungszeugnis', color: '#D04B3B' },
  erste_hilfe: { label: 'Erste Hilfe', color: '#D04B3B' },
  qualifikation: { label: 'Qualifikation', color: '#26A69A' },
  zertifikat: { label: 'Zertifikat', color: '#26A69A' },
  schulung: { label: 'Schulung', color: '#26A69A' },
  leistungsnachweis: { label: 'Leistungsnachweis', color: '#C9963C' },
  rechnung: { label: 'Rechnung', color: '#C9963C' },
  schriftverkehr: { label: 'Schriftverkehr', color: '#2196F3' },
  bescheinigung: { label: 'Bescheinigung', color: '#5CB882' },
  kuendigung: { label: 'Kündigung', color: '#D04B3B' },
  arbeitsvertrag: { label: 'Arbeitsvertrag', color: '#C9963C' },
  zusatzvereinbarung: { label: 'Zusatzvereinbarung', color: '#C9963C' },
  datenschutzerklaerung: { label: 'Datenschutzerklärung', color: '#2196F3' },
  einwilligung: { label: 'Einwilligung', color: '#2196F3' },
  foto: { label: 'Foto', color: '#999' },
  sonstiges: { label: 'Sonstiges', color: '#999' },
}

export const AKTEN_KATEGORIE: Record<string, { label: string; color: string }> = {
  stammdaten: { label: 'Stammdaten', color: '#2196F3' },
  vertrag: { label: 'Vertrag', color: '#C9963C' },
  pflege: { label: 'Pflege', color: '#5CB882' },
  abrechnung: { label: 'Abrechnung', color: '#C9963C' },
  personal: { label: 'Personal', color: '#7E57C2' },
  qualifikation: { label: 'Qualifikation', color: '#26A69A' },
  genehmigung: { label: 'Genehmigung', color: '#5CB882' },
  korrespondenz: { label: 'Korrespondenz', color: '#2196F3' },
  allgemein: { label: 'Allgemein', color: '#999' },
}

export const AKTEN_STATUS: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#999' },
  aktiv: { label: 'Aktiv', color: '#5CB882' },
  archiviert: { label: 'Archiviert', color: '#999' },
  gesperrt: { label: 'Gesperrt', color: '#D04B3B' },
  abgelaufen: { label: 'Abgelaufen', color: '#D04B3B' },
}

export const AKTEN_SICHTBARKEIT: Record<string, { label: string; color: string }> = {
  intern: { label: 'Intern', color: '#999' },
  kunde: { label: 'Kunde sichtbar', color: '#2196F3' },
  engel: { label: 'Engel sichtbar', color: '#26A69A' },
  alle: { label: 'Alle sichtbar', color: '#5CB882' },
}

// ── Verträge (akten_vertraege) ───────────────────────────────────
export const VERTRAGS_TYP: Record<string, { label: string; color: string }> = {
  dienstleistungsvertrag: { label: 'Dienstleistungsvertrag', color: '#C9963C' },
  arbeitsvertrag: { label: 'Arbeitsvertrag', color: '#7E57C2' },
  freelancer_vertrag: { label: 'Freelancer-Vertrag', color: '#7E57C2' },
  zusatzvereinbarung: { label: 'Zusatzvereinbarung', color: '#C9963C' },
  abtretungserklaerung: { label: 'Abtretungserklärung', color: '#26A69A' },
  vollmacht: { label: 'Vollmacht', color: '#2196F3' },
  datenschutzerklaerung: { label: 'Datenschutzerklärung', color: '#2196F3' },
  einwilligung: { label: 'Einwilligung', color: '#2196F3' },
  kooperationsvertrag: { label: 'Kooperationsvertrag', color: '#5CB882' },
  sonstiger: { label: 'Sonstiger', color: '#999' },
}

export const VERTRAGS_STATUS: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#999' },
  versendet: { label: 'Versendet', color: '#2196F3' },
  unterschrieben: { label: 'Unterschrieben', color: '#5CB882' },
  aktiv: { label: 'Aktiv', color: '#5CB882' },
  gekuendigt: { label: 'Gekündigt', color: '#E8A000' },
  beendet: { label: 'Beendet', color: '#999' },
  storniert: { label: 'Storniert', color: '#D04B3B' },
}

// ── Kontaktpersonen (akten_kontaktpersonen.rolle) ────────────────
export const KONTAKT_ROLLE: Record<string, { label: string; color: string }> = {
  angehoeriger: { label: 'Angehörige/r', color: '#2196F3' },
  bevollmaechtigter: { label: 'Bevollmächtigte/r', color: '#7E57C2' },
  betreuer: { label: 'Betreuer/in', color: '#7E57C2' },
  notfallkontakt: { label: 'Notfallkontakt', color: '#D04B3B' },
  hausarzt: { label: 'Hausarzt/-ärztin', color: '#26A69A' },
  facharzt: { label: 'Facharzt/-ärztin', color: '#26A69A' },
  pflegeberater: { label: 'Pflegeberater/in', color: '#5CB882' },
  sozialarbeiter: { label: 'Sozialarbeiter/in', color: '#5CB882' },
  sonstiger: { label: 'Sonstige/r', color: '#999' },
}

// Dringlichkeitsstufe (akten_ablauf_dashboard.dringlichkeit) → Ampel-Farbe/Label
export const AKTEN_DRINGLICHKEIT: Record<string, { label: string; color: string }> = {
  abgelaufen: { label: 'Abgelaufen', color: '#D04B3B' },
  '7_tage': { label: '≤ 7 Tage', color: '#D04B3B' },
  '14_tage': { label: '≤ 14 Tage', color: '#E8A000' },
  '30_tage': { label: '≤ 30 Tage', color: '#E8A000' },
  '60_tage': { label: '≤ 60 Tage', color: '#C9963C' },
  '90_tage': { label: '≤ 90 Tage', color: '#C9963C' },
  ok: { label: 'OK', color: '#5CB882' },
}

// ── Pflegedokumentation (pflege_*) ───────────────────────────────
export const PFLEGE_AUFNAHMESTATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#E8A000' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#2196F3' },
  vollstaendig: { label: 'Vollständig', color: '#5CB882' },
  abgelehnt: { label: 'Abgelehnt', color: '#D04B3B' },
  archiviert: { label: 'Archiviert', color: '#999' },
}

export const PFLEGE_AUFNAHME_STATUS: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#999' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#2196F3' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#5CB882' },
  storniert: { label: 'Storniert', color: '#D04B3B' },
}

export const PFLEGE_AUFNAHME_ORT: Record<string, { label: string; color: string }> = {
  wohnung: { label: 'In der Wohnung', color: '#5CB882' },
  buero: { label: 'Im Büro', color: '#2196F3' },
  telefonisch: { label: 'Telefonisch', color: '#C9963C' },
  video: { label: 'Video', color: '#7E57C2' },
  sonstiges: { label: 'Sonstiges', color: '#999' },
}

export const PFLEGE_DRINGLICHKEIT: Record<string, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#5CB882' },
  dringend: { label: 'Dringend', color: '#E8A000' },
  notfall: { label: 'Notfall', color: '#D04B3B' },
}

export const PFLEGE_ANAMNESE_TYP: Record<string, { label: string; color: string }> = {
  erstanamnese: { label: 'Erstanamnese', color: '#C9963C' },
  folgeanamnese: { label: 'Folgeanamnese', color: '#2196F3' },
  uebergabe: { label: 'Übergabe', color: '#26A69A' },
  wiederaufnahme: { label: 'Wiederaufnahme', color: '#7E57C2' },
}

export const PFLEGE_ANAMNESE_STATUS: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#999' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#5CB882' },
  gesperrt: { label: 'Gesperrt', color: '#D04B3B' },
}

export const PFLEGE_STURZRISIKO: Record<string, { label: string; color: string }> = {
  unbekannt: { label: 'Unbekannt', color: '#999' },
  niedrig: { label: 'Niedrig', color: '#5CB882' },
  mittel: { label: 'Mittel', color: '#E8A000' },
  hoch: { label: 'Hoch', color: '#D04B3B' },
}

export const PFLEGE_DIAGNOSE_TYP: Record<string, { label: string; color: string }> = {
  diagnose: { label: 'Diagnose', color: '#7E57C2' },
  einschraenkung: { label: 'Einschränkung', color: '#E8A000' },
  hinweis: { label: 'Hinweis', color: '#2196F3' },
  chronisch: { label: 'Chronisch', color: '#C9963C' },
  akut: { label: 'Akut', color: '#D04B3B' },
}

export const PFLEGE_SCHWEREGRAD: Record<string, { label: string; color: string }> = {
  leicht: { label: 'Leicht', color: '#5CB882' },
  niedrig: { label: 'Niedrig', color: '#5CB882' },
  mittel: { label: 'Mittel', color: '#E8A000' },
  schwer: { label: 'Schwer', color: '#D04B3B' },
  hoch: { label: 'Hoch', color: '#D04B3B' },
  kritisch: { label: 'Kritisch', color: '#D04B3B' },
}

export const PFLEGE_RISIKO_TYP: Record<string, { label: string; color: string }> = {
  allergie: { label: 'Allergie', color: '#D04B3B' },
  unvertraeglichkeit: { label: 'Unverträglichkeit', color: '#E8A000' },
  sturzrisiko: { label: 'Sturzrisiko', color: '#D04B3B' },
  dekubitusrisiko: { label: 'Dekubitusrisiko', color: '#E8A000' },
  schluckrisiko: { label: 'Schluckrisiko', color: '#D04B3B' },
  weglaufrisiko: { label: 'Weglaufrisiko', color: '#7E57C2' },
  aggressionsrisiko: { label: 'Aggressionsrisiko', color: '#7E57C2' },
  infektionsrisiko: { label: 'Infektionsrisiko', color: '#E8A000' },
  sonstiges: { label: 'Sonstiges', color: '#999' },
}

export const PFLEGE_PRUEFSTATUS: Record<string, { label: string; color: string }> = {
  keine_pruefung: { label: 'Keine Prüfung geplant', color: '#999' },
  ueberfaellig: { label: 'Überfällig', color: '#D04B3B' },
  bald_faellig: { label: 'Bald fällig', color: '#E8A000' },
  ok: { label: 'OK', color: '#5CB882' },
}

export const PFLEGE_PLAN_TYP: Record<string, { label: string; color: string }> = {
  versorgungsplan: { label: 'Versorgungsplan', color: '#C9963C' },
  betreuungsplan: { label: 'Betreuungsplan', color: '#5CB882' },
  massnahmenplan: { label: 'Maßnahmenplan', color: '#2196F3' },
  notfallplan: { label: 'Notfallplan', color: '#D04B3B' },
}

export const PFLEGE_PLAN_STATUS: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#999' },
  aktiv: { label: 'Aktiv', color: '#5CB882' },
  abgelaufen: { label: 'Abgelaufen', color: '#E8A000' },
  gesperrt: { label: 'Gesperrt', color: '#D04B3B' },
  ersetzt: { label: 'Ersetzt', color: '#999' },
}

export const PFLEGE_MASSNAHME_KATEGORIE: Record<string, { label: string; color: string }> = {
  koerperpflege: { label: 'Körperpflege', color: '#26A69A' },
  ernaehrung: { label: 'Ernährung', color: '#5CB882' },
  mobilitaet: { label: 'Mobilität', color: '#2196F3' },
  hauswirtschaft: { label: 'Hauswirtschaft', color: '#C9963C' },
  soziale_betreuung: { label: 'Soziale Betreuung', color: '#7E57C2' },
  kognitive_foerderung: { label: 'Kognitive Förderung', color: '#7E57C2' },
  medikation: { label: 'Medikation', color: '#D04B3B' },
  arztbesuche: { label: 'Arztbesuche', color: '#26A69A' },
  kommunikation: { label: 'Kommunikation', color: '#2196F3' },
  sicherheit: { label: 'Sicherheit', color: '#E8A000' },
  sonstiges: { label: 'Sonstiges', color: '#999' },
}

export const PFLEGE_PRIORITAET: Record<string, { label: string; color: string }> = {
  niedrig: { label: 'Niedrig', color: '#999' },
  normal: { label: 'Normal', color: '#5CB882' },
  hoch: { label: 'Hoch', color: '#E8A000' },
  dringend: { label: 'Dringend', color: '#D04B3B' },
}

export const PFLEGE_MASSNAHME_STATUS: Record<string, { label: string; color: string }> = {
  geplant: { label: 'Geplant', color: '#999' },
  aktiv: { label: 'Aktiv', color: '#5CB882' },
  pausiert: { label: 'Pausiert', color: '#E8A000' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#2196F3' },
  abgebrochen: { label: 'Abgebrochen', color: '#D04B3B' },
}

export const PFLEGE_VERLAUF_TYP: Record<string, { label: string; color: string }> = {
  verlauf: { label: 'Verlauf', color: '#5CB882' },
  ereignis: { label: 'Ereignis', color: '#2196F3' },
  beobachtung: { label: 'Beobachtung', color: '#26A69A' },
  uebergabe: { label: 'Übergabe', color: '#C9963C' },
  telefonat: { label: 'Telefonat', color: '#2196F3' },
  arztbesuch: { label: 'Arztbesuch', color: '#7E57C2' },
  angehoerigenkontakt: { label: 'Angehörigenkontakt', color: '#7E57C2' },
  besonderheit: { label: 'Besonderheit', color: '#E8A000' },
  sturz: { label: 'Sturz', color: '#D04B3B' },
  notfall: { label: 'Notfall', color: '#D04B3B' },
}

export const PFLEGE_VERLAUF_KATEGORIE: Record<string, { label: string; color: string }> = {
  allgemein: { label: 'Allgemein', color: '#999' },
  koerperpflege: { label: 'Körperpflege', color: '#26A69A' },
  ernaehrung: { label: 'Ernährung', color: '#5CB882' },
  mobilitaet: { label: 'Mobilität', color: '#2196F3' },
  kognition: { label: 'Kognition', color: '#7E57C2' },
  soziales: { label: 'Soziales', color: '#7E57C2' },
  medikation: { label: 'Medikation', color: '#D04B3B' },
  hauswirtschaft: { label: 'Hauswirtschaft', color: '#C9963C' },
  kommunikation: { label: 'Kommunikation', color: '#2196F3' },
  stimmung: { label: 'Stimmung', color: '#E8A000' },
  schmerz: { label: 'Schmerz', color: '#D04B3B' },
  schlaf: { label: 'Schlaf', color: '#7E57C2' },
  sonstiges: { label: 'Sonstiges', color: '#999' },
}

export const PFLEGE_SICHTBARKEIT: Record<string, { label: string; color: string }> = {
  intern: { label: 'Intern', color: '#999' },
  engel: { label: 'Engel sichtbar', color: '#26A69A' },
  kunde: { label: 'Kunde sichtbar', color: '#2196F3' },
  alle: { label: 'Alle sichtbar', color: '#5CB882' },
}

export const PFLEGE_PERIODEN_STATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#E8A000' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#5CB882' },
  wiedereroeffnet: { label: 'Wiedereröffnet', color: '#2196F3' },
}

export const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

// ── Aufgabenmanagement ─────────────────────────────────────────
export const AUFGABEN_KATEGORIE: Record<string, { label: string; color: string }> = {
  allgemein: { label: 'Allgemein', color: '#999' },
  kunde: { label: 'Kunde', color: '#26A69A' },
  mitarbeiter: { label: 'Mitarbeiter', color: '#2196F3' },
  einsatz: { label: 'Einsatz', color: '#C9963C' },
  dokument: { label: 'Dokument', color: '#7E57C2' },
  verordnung: { label: 'Verordnung', color: '#E8A000' },
  abrechnung: { label: 'Abrechnung', color: '#5CB882' },
  pflege: { label: 'Pflege', color: '#D04B3B' },
  qualifikation: { label: 'Qualifikation', color: '#26A69A' },
  dienstplan: { label: 'Dienstplan', color: '#2196F3' },
  urlaub: { label: 'Urlaub', color: '#7E57C2' },
  kommunikation: { label: 'Kommunikation', color: '#C9963C' },
  system: { label: 'System', color: '#999' },
}

export const AUFGABEN_PRIORITAET: Record<string, { label: string; color: string }> = {
  niedrig: { label: 'Niedrig', color: '#999' },
  mittel: { label: 'Mittel', color: '#2196F3' },
  hoch: { label: 'Hoch', color: '#E8A000' },
  kritisch: { label: 'Kritisch', color: '#D04B3B' },
}

export const AUFGABEN_STATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#E8A000' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#2196F3' },
  warten: { label: 'Warten', color: '#7E57C2' },
  erledigt: { label: 'Erledigt', color: '#5CB882' },
  storniert: { label: 'Storniert', color: '#D04B3B' },
  archiviert: { label: 'Archiviert', color: '#9E9E9E' },
}

export const WIEDERHOLUNG_INTERVALL: Record<string, { label: string; color: string }> = {
  taeglich: { label: 'Täglich', color: '#D04B3B' },
  woechentlich: { label: 'Wöchentlich', color: '#E8A000' },
  monatlich: { label: 'Monatlich', color: '#2196F3' },
  quartalsweise: { label: 'Quartalsweise', color: '#7E57C2' },
  jaehrlich: { label: 'Jährlich', color: '#999' },
}

export const WIEDERVORLAGE_STATUS: Record<string, { label: string; color: string }> = {
  aktiv: { label: 'Aktiv', color: '#2196F3' },
  erledigt: { label: 'Erledigt', color: '#5CB882' },
  storniert: { label: 'Storniert', color: '#D04B3B' },
}

export const WIEDERVORLAGE_DRINGLICHKEIT: Record<string, { label: string; color: string }> = {
  ueberfaellig: { label: 'Überfällig', color: '#D04B3B' },
  heute: { label: 'Heute', color: '#E8A000' },
  morgen: { label: 'Morgen', color: '#C9963C' },
  diese_woche: { label: 'Diese Woche', color: '#2196F3' },
  spaeter: { label: 'Später', color: '#999' },
}

export const NACHRICHTEN_PRIORITAET: Record<string, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#999' },
  dringend: { label: 'Dringend', color: '#D04B3B' },
}

export const NACHRICHTEN_KATEGORIE: Record<string, { label: string; color: string }> = {
  allgemein: { label: 'Allgemein', color: '#999' },
  einsatz: { label: 'Einsatz', color: '#C9963C' },
  kunde: { label: 'Kunde', color: '#26A69A' },
  mitarbeiter: { label: 'Mitarbeiter', color: '#2196F3' },
  aufgabe: { label: 'Aufgabe', color: '#E8A000' },
  dienstplan: { label: 'Dienstplan', color: '#2196F3' },
  abrechnung: { label: 'Abrechnung', color: '#5CB882' },
  pflege: { label: 'Pflege', color: '#D04B3B' },
  system: { label: 'System', color: '#999' },
}

export const BENACHRICHTIGUNG_TYP: Record<string, { label: string; color: string }> = {
  info: { label: 'Info', color: '#2196F3' },
  warnung: { label: 'Warnung', color: '#E8A000' },
  fehler: { label: 'Fehler', color: '#D04B3B' },
  erfolg: { label: 'Erfolg', color: '#5CB882' },
  erinnerung: { label: 'Erinnerung', color: '#C9963C' },
  eskalation: { label: 'Eskalation', color: '#D04B3B' },
}

export const BENACHRICHTIGUNG_KATEGORIE: Record<string, { label: string; color: string }> = {
  dienstplan: { label: 'Dienstplan', color: '#2196F3' },
  einsatz: { label: 'Einsatz', color: '#C9963C' },
  urlaub: { label: 'Urlaub', color: '#7E57C2' },
  qualifikation: { label: 'Qualifikation', color: '#26A69A' },
  dokument: { label: 'Dokument', color: '#7E57C2' },
  abrechnung: { label: 'Abrechnung', color: '#5CB882' },
  aufgabe: { label: 'Aufgabe', color: '#E8A000' },
  pflege: { label: 'Pflege', color: '#D04B3B' },
  personal: { label: 'Personal', color: '#2196F3' },
  system: { label: 'System', color: '#999' },
  kommunikation: { label: 'Kommunikation', color: '#C9963C' },
  wiedervorlage: { label: 'Wiedervorlage', color: '#26A69A' },
  eskalation: { label: 'Eskalation', color: '#D04B3B' },
}

export const ESKALATION_AN_ROLLE: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: '#2196F3' },
  pdl: { label: 'PDL', color: '#7E57C2' },
  geschaeftsfuehrung: { label: 'Geschäftsführung', color: '#D04B3B' },
}

export const AKTIVITAETSLOG_AKTION: Record<string, { label: string; color: string }> = {
  erstellt: { label: 'Erstellt', color: '#5CB882' },
  aktualisiert: { label: 'Aktualisiert', color: '#2196F3' },
  geloescht: { label: 'Gelöscht', color: '#D04B3B' },
  status_geaendert: { label: 'Status geändert', color: '#E8A000' },
  zugewiesen: { label: 'Zugewiesen', color: '#C9963C' },
  eskaliert: { label: 'Eskaliert', color: '#D04B3B' },
  erledigt: { label: 'Erledigt', color: '#5CB882' },
  storniert: { label: 'Storniert', color: '#D04B3B' },
  gelesen: { label: 'Gelesen', color: '#999' },
  gesendet: { label: 'Gesendet', color: '#2196F3' },
  genehmigt: { label: 'Genehmigt', color: '#5CB882' },
  abgelehnt: { label: 'Abgelehnt', color: '#D04B3B' },
}

export const FAELLIGKEITS_STATUS: Record<string, { label: string; color: string }> = {
  ueberfaellig: { label: 'Überfällig', color: '#D04B3B' },
  heute: { label: 'Heute fällig', color: '#E8A000' },
  diese_woche: { label: 'Diese Woche', color: '#C9963C' },
  spaeter: { label: 'Später', color: '#999' },
  ohne_datum: { label: 'Ohne Datum', color: '#999' },
}

// ── Workflow-Engine ──────────────────────────────────────────────
export const WF_MODUL: Record<string, { label: string; color: string }> = {
  dakota: { label: 'DAKOTA', color: '#7E57C2' },
  abrechnung: { label: 'Abrechnung', color: '#5CB882' },
  personal: { label: 'Personal', color: '#2196F3' },
  pflege: { label: 'Pflege', color: '#D04B3B' },
  dokumente: { label: 'Dokumente', color: '#7E57C2' },
  einsatz: { label: 'Einsatz', color: '#C9963C' },
  aufgaben: { label: 'Aufgaben', color: '#E8A000' },
  forderungen: { label: 'Forderungen', color: '#FF7043' },
  system: { label: 'System', color: '#999' },
}

export const WF_EVENT_STATUS: Record<string, { label: string; color: string }> = {
  neu: { label: 'Neu', color: '#2196F3' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#E8A000' },
  verarbeitet: { label: 'Verarbeitet', color: '#5CB882' },
  fehlgeschlagen: { label: 'Fehlgeschlagen', color: '#D04B3B' },
  uebersprungen: { label: 'Übersprungen', color: '#999' },
}

export const WF_EVENT_PRIORITAET: Record<string, { label: string; color: string }> = {
  niedrig: { label: 'Niedrig', color: '#999' },
  normal: { label: 'Normal', color: '#2196F3' },
  hoch: { label: 'Hoch', color: '#E8A000' },
  kritisch: { label: 'Kritisch', color: '#D04B3B' },
}

export const WF_AKTION_TYP: Record<string, { label: string; color: string }> = {
  aufgabe_erstellen: { label: 'Aufgabe erstellen', color: '#E8A000' },
  benachrichtigung_senden: { label: 'Benachrichtigung senden', color: '#2196F3' },
  wiedervorlage_erstellen: { label: 'Wiedervorlage erstellen', color: '#26A69A' },
  eskalation_ausloesen: { label: 'Eskalation auslösen', color: '#D04B3B' },
  status_aendern: { label: 'Status ändern', color: '#7E57C2' },
  feld_aktualisieren: { label: 'Feld aktualisieren', color: '#5CB882' },
  webhook: { label: 'Webhook', color: '#999' },
}

export const WF_AUSFUEHRUNG_STATUS: Record<string, { label: string; color: string }> = {
  ausstehend: { label: 'Ausstehend', color: '#999' },
  erfolgreich: { label: 'Erfolgreich', color: '#5CB882' },
  fehlgeschlagen: { label: 'Fehlgeschlagen', color: '#D04B3B' },
  uebersprungen: { label: 'Übersprungen', color: '#999' },
}

export const WF_QUEUE_STATUS: Record<string, { label: string; color: string }> = {
  wartend: { label: 'Wartend', color: '#E8A000' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#2196F3' },
  erledigt: { label: 'Erledigt', color: '#5CB882' },
  fehlgeschlagen: { label: 'Fehlgeschlagen', color: '#FF7043' },
  dead_letter: { label: 'Dead-Letter', color: '#D04B3B' },
}

export const WF_AUDIT_TYP: Record<string, { label: string; color: string }> = {
  event_emittiert: { label: 'Event emittiert', color: '#2196F3' },
  regel_ausgewertet: { label: 'Regel ausgewertet', color: '#7E57C2' },
  aktion_ausgefuehrt: { label: 'Aktion ausgeführt', color: '#5CB882' },
  retry: { label: 'Retry', color: '#E8A000' },
  dead_letter: { label: 'Dead-Letter', color: '#D04B3B' },
  manuell_wiederholt: { label: 'Manuell wiederholt', color: '#C9963C' },
  regel_erstellt: { label: 'Regel erstellt', color: '#5CB882' },
  regel_geaendert: { label: 'Regel geändert', color: '#2196F3' },
  regel_deaktiviert: { label: 'Regel deaktiviert', color: '#999' },
  fristen_check: { label: 'Fristen-Check', color: '#26A69A' },
  system_fehler: { label: 'System-Fehler', color: '#D04B3B' },
}

export const WF_BEDINGUNG_OPERATOR: Record<string, string> = {
  '=': 'ist gleich',
  '!=': 'ist nicht gleich',
  '>': 'größer als',
  '<': 'kleiner als',
  '>=': 'größer/gleich',
  '<=': 'kleiner/gleich',
  'enthält': 'enthält',
  'ist_leer': 'ist leer',
  'ist_nicht_leer': 'ist nicht leer',
}
