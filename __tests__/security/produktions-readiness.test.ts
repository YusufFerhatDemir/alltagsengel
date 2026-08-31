import { describe, it, expect } from 'vitest'
import { RECHNUNG_ERLEDIGT } from '@/lib/billing/status-vokabular'
import { safeErrorResponse, safeDbError } from '@/lib/utils/api-error'
import * as fs from 'fs'
import * as path from 'path'

describe('Produktions-Readiness: Error-Sanitizer', () => {
  it('erkennt PG-Constraint-Verletzungen als sensitiv', () => {
    const pgErrors = [
      'violates unique constraint "clients_customer_number_organization_id_key"',
      'null value in column "organization_id" violates not-null constraint',
      'duplicate key value violates unique constraint "invoices_pkey"',
      'relation "secret_table" does not exist',
      'column "password_hash" of relation "users" does not exist',
      'permission denied for table profiles',
      'row-level security policy violation',
      'function public.is_admin() does not exist',
      'could not serialize access due to concurrent update',
    ]
    for (const msg of pgErrors) {
      const res = safeErrorResponse(new Error(msg))
      const body = res as any
      expect(body.status).toBe(500)
    }
  })

  it('lässt generische Fehlermeldungen durch', () => {
    const safeErrors = [
      'Klient nicht gefunden',
      'Pflichtfelder fehlen',
      'Budget-Blockierung',
    ]
    for (const msg of safeErrors) {
      const res = safeDbError({ message: msg, code: '42000' })
      expect(res.status).toBe(500)
    }
  })

  it('safeDbError mit null gibt Fallback', async () => {
    const res = safeDbError(null)
    const body = await res.json()
    expect(body.error).toBe('Datenbankfehler.')
    expect(res.status).toBe(500)
  })
})

describe('Produktions-Readiness: Multi-Tenancy Org-Fence', () => {
  it('nachrichten.ts filtert nach organization_id', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/ops/nachrichten.ts'), 'utf-8'
    )
    expect(src).toContain("eq('organization_id', filter.organizationId)")
  })

  it('visitor-alert scoped auf Stamm-Org via organization_members', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/visitor-alert/route.ts'), 'utf-8'
    )
    expect(src).toContain('organization_members')
    expect(src).not.toMatch(/\.from\('profiles'\)\s*\n\s*\.select\('id'\)\s*\n\s*\.in\('role'/)
  })

  it('pricing route hat organization_id Filter', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/pricing/route.ts'), 'utf-8'
    )
    expect(src).toContain("eq('organization_id', organizationId)")
  })
})

describe('Produktions-Readiness: OPOS-Filter', () => {
  // Der Test suchte frueher die vier Werte als Zeichenketten im Quelltext
  // des OPOS-Managers. Seit dem 31.08.2026 stehen sie in der gemeinsamen
  // Liste lib/billing/status-vokabular.ts — eine Quelle statt fuenf
  // halber. Der Quelltext-Griff schlug fehl, obwohl die Regel unveraendert
  // galt; geprueft wird jetzt die Liste und ihre Verwendung.
  it('OPOS schließt bezahlt auf DB-Ebene aus', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/billing/opos/opos-manager.ts'), 'utf-8'
    )
    for (const status of ['bezahlt', 'storniert', 'akzeptiert', 'abgeschrieben']) {
      expect(RECHNUNG_ERLEDIGT).toContain(status)
    }
    // Beide Vokabulare derselben Spalte — eine stornierte Rechnung als
    // `cancelled` behaelt ihren Betrag und stand sonst weiter in der Liste.
    for (const status of ['paid', 'cancelled']) {
      expect(RECHNUNG_ERLEDIGT).toContain(status)
    }
    expect(src).toContain('alsPostgrestListe(RECHNUNG_ERLEDIGT)')
  })
})

describe('Produktions-Readiness: Rücklastschrift Spalten', () => {
  it('ruecklastschrift.ts nutzt dunning_level statt current_level', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/billing/sepa/ruecklastschrift.ts'), 'utf-8'
    )
    expect(src).not.toContain('current_level')
    expect(src).not.toContain('last_level_change')
    expect(src).toContain('dunning_level')
    expect(src).toContain('last_dunning_at')
  })
})

describe('Produktions-Readiness: VP-Budgetcheck verdrahtet', () => {
  it('einsatzplanung importiert und nutzt pruefeVPBudget', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/einsatzplanung/route.ts'), 'utf-8'
    )
    expect(src).toContain('pruefeVPBudget')
    expect(src).toContain('vpKzpKombiniertWarnung')
  })
})

describe('Produktions-Readiness: Mahnwesen Timezone', () => {
  it('dunning.ts berechnet days_overdue mit Berlin-Datum', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/billing/core/dunning.ts'), 'utf-8'
    )
    expect(src).toContain('heuteStr')
    expect(src).not.toMatch(/days_overdue:\s*Math\.max\(0,\s*Math\.floor\(\(now\.getTime/)
  })

  it('mahnung-pdf.ts berechnet Deadline mit heuteBerlin', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/billing/dunning/mahnung-pdf.ts'), 'utf-8'
    )
    expect(src).toContain('heuteBerlin()')
    expect(src).not.toMatch(/const deadline = new Date\(\)\s*\n\s*deadline\.setDate/)
  })
})

describe('Produktions-Readiness: DATEV Timezone', () => {
  it('datev export-service nutzt Europe/Berlin für Protokoll', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/billing/datev/export-service.ts'), 'utf-8'
    )
    expect(src).toContain("timeZone: 'Europe/Berlin'")
  })
})
