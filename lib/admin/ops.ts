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
