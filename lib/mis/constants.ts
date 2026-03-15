// ========================================
// AlltagsEngel MIS - Constants & Brand
// ========================================

export const BRAND = {
  coal: '#1A1612',        // original dark color (sidebar, dark backgrounds)
  gold: '#C9963C',
  cream: '#F7F2EA',
  text: '#F7F2EA',        // primary text on dark backgrounds
  white: '#1E1B17',       // card background (dark)
  light: '#141210',       // page background (dark)
  border: 'rgba(201,150,60,0.15)',
  muted: 'rgba(255,255,255,0.5)',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const

export const NAV_ITEMS = [
  { href: '/mis', label: 'Dashboard', icon: 'gauge', module: 'dashboard' },
  { href: '/mis/documents', label: 'Dokumente', icon: 'files', module: 'documents' },
  { href: '/mis/dataroom', label: 'Data Room', icon: 'lock', module: 'dataroom' },
  { href: '/mis/finance', label: 'Finanzen', icon: 'banknote', module: 'finance' },
  { href: '/mis/supply-chain', label: 'Lieferkette', icon: 'truck', module: 'supply-chain' },
  { href: '/mis/quality', label: 'Qualität', icon: 'shield', module: 'quality' },
  { href: '/mis/market', label: 'Marktanalyse', icon: 'trending', module: 'market' },
  { href: '/mis/team', label: 'Team', icon: 'users', module: 'team' },
  { href: '/mis/krankenfahrten', label: 'KF-Aufträge', icon: 'truck', module: 'krankenfahrten' },
  { href: '/mis/krankenfahrt-pricing', label: 'KF-Preise', icon: 'banknote', module: 'krankenfahrt-pricing' },
  { href: '/mis/analytics', label: 'Analytics', icon: 'activity', module: 'analytics' },
  { href: '/mis/ai-assistant', label: 'KI-Assistent', icon: 'sparkles', module: 'ai-assistant' },
  { href: '/mis/settings', label: 'Einstellungen', icon: 'settings', module: 'settings' },
] as const

export const DOC_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: '#8A8278' },
  review: { label: 'Prüfung', color: '#F59E0B' },
  approved: { label: 'Genehmigt', color: '#22C55E' },
  archived: { label: 'Archiviert', color: '#3B82F6' },
  obsolete: { label: 'Veraltet', color: '#EF4444' },
}

export const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: '#22C55E' },
  medium: { label: 'Mittel', color: '#F59E0B' },
  high: { label: 'Hoch', color: '#F97316' },
  critical: { label: 'Kritisch', color: '#EF4444' },
}

export const RISK_COLORS: Record<string, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#F97316',
  critical: '#EF4444',
}

export const CLASSIFICATION_LABELS: Record<string, string> = {
  public: 'Öffentlich',
  internal: 'Intern',
  confidential: 'Vertraulich',
  restricted: 'Eingeschränkt',
}

// Financial Data (matching data room) — Festmarge-Modell
// Direktabrechnung mit Pflegekassen, feste €20/Std an Engel, Marge ~€65/Kunde/Monat
export const FINANCIAL_PROJECTIONS = {
  years: ['2026', '2027', '2028', '2029', '2030'],
  // Alltagsbegleitung: Nutzer × €65/Monat × 12 + Krankentransport ab Jahr 2
  revenue: [390000, 1957500, 7890000, 28080000, 58500000],
  costs: [420000, 960000, 3200000, 9800000, 19500000],
  profit: [-30000, 997500, 4690000, 18280000, 39000000],
  users: [500, 2500, 10000, 36000, 75000],
  bookings: [18000, 90000, 360000, 1296000, 2700000],
}

export const UNIT_ECONOMICS = {
  billingRatePerHour: 35,      // Abrechnungssatz an Pflegekasse (Kundenpreis 32-35€)
  helperPayPerHour: 20,        // Feste Vergütung an Engel
  marginPerHour: 15,           // Plattform-Marge pro Stunde (35-20)
  marginPercent: 0.43,         // ~43% Bruttomarge
  avgHoursPerCustomerMonth: 3, // Ø Stunden pro Kunde/Monat
  marginPerCustomerMonth: 45,  // €15 × 3 Std = €45 Marge pro Kunde/Monat
  cac: 35,
  ltv: 1080,                   // €45 × 24 Monate Retention
  ltvCacRatio: 30.9,
  paybackMonths: 0.8,
  monthlyChurn: 0.03,
  entlastungsbetrag: 131,      // §45b Budget pro Person/Monat (2026)
}

export const MARKET_DATA = {
  tam: 50e9,
  sam: 7.80e9,                  // 4,96M × €131 × 12
  som5yr: 400e6,
  pflegebeduerftige: 4.96e6,
  entlastungsbetrag: 131,       // §45b 2026
  unusedRate: 0.60,
  unusedVolume: 4.68e9,         // 7,80 Mrd × 60%
  krankentransportMarket: 3e9,  // Krankentransport-Vermittlung Markt
}
