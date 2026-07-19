// ═══════════════════════════════════════════════════════════════
// Alltagsengel Betriebssystem — gemeinsame Helfer für /admin
// ═══════════════════════════════════════════════════════════════
// Formatierung, Budget-Ampel-Logik und Status-Maps. Wird von allen
// operativen Admin-Seiten (clients, records, budgets, invoices,
// caregivers, partners) geteilt, damit Logik & Optik konsistent
// bleiben.
// ═══════════════════════════════════════════════════════════════

// Entlastungsbetrag nach §45b SGB XI — 131 € pro Monat (NICHT 125!)
export const ENTLASTUNGSBETRAG_MONAT = 131
export const ENTLASTUNGSBETRAG_JAHR = ENTLASTUNGSBETRAG_MONAT * 12 // 1572 €

// ── Formatierung ────────────────────────────────────────────────
export function euro(value: number | null | undefined): string {
  const n = typeof value === 'number' ? value : 0
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
  other: { label: 'Sonstige', color: '#999' },
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
  sonstige: { label: 'Sonstige', color: '#999' },
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
