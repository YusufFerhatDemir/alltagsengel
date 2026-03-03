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
  { href: '/', label: 'Dashboard', icon: 'gauge', module: 'dashboard' },
  { href: '/documents', label: 'Dokumente', icon: 'files', module: 'documents' },
  { href: '/dataroom', label: 'Data Room', icon: 'lock', module: 'dataroom' },
  { href: '/finance', label: 'Finanzen', icon: 'banknote', module: 'finance' },
  { href: '/supply-chain', label: 'Lieferkette', icon: 'truck', module: 'supply-chain' },
  { href: '/quality', label: 'Qualität', icon: 'shield', module: 'quality' },
  { href: '/market', label: 'Marktanalyse', icon: 'trending', module: 'market' },
  { href: '/team', label: 'Team', icon: 'users', module: 'team' },
  { href: '/ai-assistant', label: 'KI-Assistent', icon: 'sparkles', module: 'ai-assistant' },
  { href: '/settings', label: 'Einstellungen', icon: 'settings', module: 'settings' },
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

// Financial Data (matching data room)
export const FINANCIAL_PROJECTIONS = {
  years: ['2026', '2027', '2028', '2029', '2030'],
  revenue: [180000, 960000, 3200000, 8400000, 18000000],
  costs: [380000, 720000, 1600000, 3400000, 6200000],
  profit: [-200000, 240000, 1600000, 5000000, 11800000],
  users: [500, 2800, 9500, 25000, 50000],
  bookings: [2400, 16800, 57000, 150000, 360000],
}

export const UNIT_ECONOMICS = {
  avgBookingValue: 45,
  platformFee: 0.18,
  cac: 35,
  ltv: 810,
  ltvCacRatio: 23.1,
  paybackMonths: 2.5,
  monthlyChurn: 0.03,
  entlastungsbetrag: 131,
}

export const MARKET_DATA = {
  tam: 24.6e9,
  sam: 7.84e9,
  som5yr: 52e6,
  pflegebeduerftige: 4.96e6,
  entlastungsbetrag: 131,
  unusedRate: 0.60,
  unusedVolume: 4.7e9,
}
