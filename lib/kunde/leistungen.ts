// ═══════════════════════════════════════════════════════════════
// Kunden-Portal — gemeinsame Labels & Formatierung
// ═══════════════════════════════════════════════════════════════
// Wird von /kunde/budget, /kunde/rechnungen und /kunde/leistungsnachweis
// geteilt, damit Budgettöpfe und Leistungsarten überall gleich heißen.
// Kundengerichtete Langform der Labels (mit SGB-XI-Paragraf) — die
// Kurzform für das Admin-Panel lebt in lib/admin/ops.ts.
// ═══════════════════════════════════════════════════════════════

export const BUDGET_TYPE_LABEL: Record<string, string> = {
  entlastung: 'Entlastungsbetrag §45b SGB XI',
  verhinderung: 'Verhinderungspflege §39 SGB XI',
  carryover: 'Übertrag Vorjahr',
  private: 'Privat',
}

// Kurzlabels für enge Tabellen-Spalten
export const BUDGET_TYPE_SHORT: Record<string, string> = {
  entlastung: '§45b Entlastung',
  verhinderung: '§39 Verhinderung',
  carryover: 'Übertrag',
  private: 'Privat',
}

export const BUDGET_TYPE_COLOR: Record<string, string> = {
  entlastung: '#C9963C',
  verhinderung: '#2196F3',
  carryover: '#9C27B0',
  private: '#5CB882',
}

export const SERVICE_TYPE_LABEL: Record<string, string> = {
  alltagsbegleitung: 'Alltagsbegleitung',
  betreuung_45a: 'Betreuung nach §45a',
  verhinderungspflege: 'Verhinderungspflege',
  hauswirtschaft: 'Hauswirtschaftliche Unterstützung',
  einkaufsservice: 'Einkaufsservice',
  begleitservice: 'Begleitservice',
  nachtbetreuung: 'Nachtbetreuung',
  wochenendbetreuung: 'Wochenendbetreuung',
  krankenfahrt: 'Krankenfahrt',
  sonstige: 'Sonstige Leistung',
}

export function budgetTypeLabel(t: string | null | undefined): string {
  if (!t) return '—'
  return BUDGET_TYPE_LABEL[t] || t
}

export function serviceTypeLabel(t: string | null | undefined): string {
  if (!t) return 'Leistung'
  return SERVICE_TYPE_LABEL[t] || t
}

export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

// "90" → "1 Std 30 Min", "45" → "45 Min"
export function fmtDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} Min`
  if (m === 0) return `${h} Std`
  return `${h} Std ${m} Min`
}
