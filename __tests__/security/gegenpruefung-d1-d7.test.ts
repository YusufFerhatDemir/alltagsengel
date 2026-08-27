import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { handlerRumpfOderFehler } from '../helpers/route-quelle'

function src(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf-8')
}

// ═══════════════════════════════════════════════════════════════════
// Gegenprüfung D1-D7: Regressionstests für gefundene & gefixte Mängel
// ═══════════════════════════════════════════════════════════════════

describe('D1: force_override Audit-Trail', () => {
  test('PATCH /einsatzplanung hat Audit-Trail für force_override', () => {
    const code = src('app/api/einsatzplanung/route.ts')
    const patchHandler = handlerRumpfOderFehler(code, 'PATCH', 'app/api/einsatzplanung/route.ts')
    expect(patchHandler).toContain('logBillingAction')
    expect(patchHandler).toContain('force_override')
    expect(patchHandler).toContain('overridden_checks')
  })

  test('POST /tours hat Audit-Trail für force_override', () => {
    const code = src('app/api/tours/route.ts')
    expect(code).toContain('logBillingAction')
    expect(code).toContain('force_override')
    expect(code).toContain('overridden_checks')
  })

  test('POST /tours/[id]/vertretung hat Audit-Trail für force_override', () => {
    const code = src('app/api/tours/[id]/vertretung/route.ts')
    expect(code).toContain('logBillingAction')
    expect(code).toContain('force_override')
    expect(code).toContain('overridden_checks')
  })
})

describe('D3: CAS-Guard RPC Fallback', () => {
  test('createCreditNote hat RPC-Fallback bei nicht-existierender Funktion', () => {
    const code = src('lib/billing/core/invoice-engine.ts')
    const creditSection = code.slice(code.indexOf('createCreditNote'))
    expect(creditSection).toContain('create_credit_note_atomic')
    expect(creditSection).toContain('Could not find')
    expect(creditSection).toContain('does not exist')
    expect(creditSection).toContain('rpcValidated')
  })

  test('correctInvoice hat RPC-Fallback bei nicht-existierender Funktion', () => {
    const code = src('lib/billing/core/invoice-engine.ts')
    const correctionSection = code.slice(code.indexOf('correctInvoice'))
    expect(correctionSection).toContain('validate_correction_atomic')
    expect(correctionSection).toContain('Could not find')
    expect(correctionSection).toContain('does not exist')
  })

  test('Post-Insert CAS-Guard bleibt als Safety-Net', () => {
    const code = src('lib/billing/core/invoice-engine.ts')
    expect(code).toContain('totalCreditedAfter > originalAmountCents')
    expect(code).toContain('Paralleler Zugriff')
  })
})

describe('D5: Timezone berlinParts() Nutzung', () => {
  test('timezone.ts exportiert berlinParts', () => {
    const code = src('lib/utils/timezone.ts')
    expect(code).toContain('export function berlinParts')
    expect(code).toContain('Europe/Berlin')
    expect(code).toContain('formatToParts')
  })

  test('EDIFACT-Segments nutzt berlinParts statt getFullYear/getMonth', () => {
    const code = src('lib/abrechnung/edifact-segments.ts')
    expect(code).toContain("import { berlinParts } from '@/lib/utils/timezone'")
    expect(code).not.toMatch(/d\.getFullYear\(\)/)
    expect(code).not.toMatch(/d\.getMonth\(\)/)
    expect(code).not.toMatch(/d\.getDate\(\)/)
    expect(code).not.toMatch(/erstelldatum\.getHours\(\)/)
  })

  test('Auftragsdatei nutzt berlinParts statt getFullYear/getMonth', () => {
    const code = src('lib/abrechnung/auftragsdatei.ts')
    expect(code).toContain("import { berlinParts } from '@/lib/utils/timezone'")
    expect(code).not.toMatch(/d\.getFullYear\(\)/)
    expect(code).not.toMatch(/d\.getMonth\(\)/)
    expect(code).not.toMatch(/d\.getDate\(\)/)
  })

  test('DATEV-Format nutzt berlinParts', () => {
    const code = src('lib/billing/datev/datev-format.ts')
    expect(code).toContain("import { berlinParts } from '@/lib/utils/timezone'")
    expect(code).not.toMatch(/d\.getFullYear\(\)/)
    expect(code).not.toMatch(/d\.getMonth\(\)/)
    expect(code).not.toMatch(/d\.getDate\(\)/)
    expect(code).not.toMatch(/d\.getHours\(\)/)
  })

  test('Mahnung-PDF nutzt berlinParts für Datumsformatierung', () => {
    const code = src('lib/billing/dunning/mahnung-pdf.ts')
    expect(code).toContain('berlinParts')
  })

  test('KPI nutzt berlinParts statt getFullYear/getMonth', () => {
    const code = src('lib/analytics/kpi.ts')
    expect(code).toContain("import { berlinParts } from '@/lib/utils/timezone'")
    expect(code).not.toMatch(/d\.getFullYear\(\)/)
    expect(code).not.toMatch(/d\.getMonth\(\)/)
  })

  test('Client-Kundennummer nutzt berlinParts', () => {
    const code = src('app/api/admin/clients/route.ts')
    expect(code).toContain("import { berlinParts } from '@/lib/utils/timezone'")
    expect(code).not.toMatch(/now\.getFullYear\(\)/)
    expect(code).not.toMatch(/now\.getMonth\(\)/)
  })

  test('FHIR-Import-Kundennummer nutzt berlinParts', () => {
    const code = src('app/api/fhir/import/route.ts')
    expect(code).toContain("import { berlinParts } from '@/lib/utils/timezone'")
    expect(code).not.toMatch(/now\.getFullYear\(\)/)
    expect(code).not.toMatch(/now\.getMonth\(\)/)
  })
})

describe('D2: VP-Budget Migration', () => {
  test('Migration für budget_type Alignment existiert', () => {
    const code = src('supabase/migrations/20260831030000_d2_fix_budget_type_trigger.sql')
    expect(code).toContain('verhinderungspflege')
    expect(code).toContain("UPDATE service_records")
    expect(code).toContain("SET budget_type = 'verhinderungspflege'")
  })

  test('Trigger-Update behandelt beide Budget-Typen', () => {
    const code = src('supabase/migrations/20260831030000_d2_fix_budget_type_trigger.sql')
    expect(code).toContain("IN ('entlastung', 'verhinderungspflege')")
    expect(code).toContain('combined_used_amount')
    expect(code).toContain('update_budget_used_amount')
  })
})
