// ========================================
// AlltagsEngel MIS - Constants & Brand
// ========================================

export const BRAND = {
  coal: '#1A1612',
  gold: '#C9963C',
  cream: '#F7F2EA',
  white: '#FFFFFF',
  light: '#F8F6F2',
  border: '#E8E2D8',
  muted: '#8A8278',
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
  billingRatePerHour: 40,      // Abrechnungssatz an Pflegekasse
  helperPayPerHour: 20,        // Feste Vergütung an Engel
  marginPerHour: 20,           // Plattform-Marge pro Stunde
  marginPercent: 0.50,         // ~50% Bruttomarge
  avgHoursPerCustomerMonth: 3, // Ø Stunden pro Kunde/Monat
  marginPerCustomerMonth: 65,  // €65 Marge pro Kunde/Monat
  cac: 35,
  ltv: 1560,                   // €65 × 24 Monate Retention
  ltvCacRatio: 44.6,
  paybackMonths: 0.5,
  monthlyChurn: 0.03,
  entlastungsbetrag: 125,      // §45b Budget pro Person/Monat
}

export const MARKET_DATA = {
  tam: 50e9,
  sam: 7.44e9,
  som5yr: 400e6,
  pflegebeduerftige: 4.96e6,
  entlastungsbetrag: 125,
  unusedRate: 0.60,
  unusedVolume: 4.46e9,
  krankentransportMarket: 3e9,  // Krankentransport-Vermittlung Markt
}
