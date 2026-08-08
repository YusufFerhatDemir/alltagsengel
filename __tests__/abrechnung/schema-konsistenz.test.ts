// ═══════════════════════════════════════════════════════════════
// Schema-Konsistenz: TypeScript-Unions vs. Postgres-CHECK-Constraints
// ═══════════════════════════════════════════════════════════════
// Hintergrund: Ein Wert, den TypeScript erlaubt und Postgres ablehnt, ist
// kein Typfehler — er ist ein Laufzeitausfall, der erst in Produktion
// auftritt. Genau das war zweimal der Fall:
//
//   1) billing_audit_trail.entity_type — die Werte 'ruecklaeufer',
//      'fehlerprotokoll', 'korrekturlauf', 'dta_export' und 'dta_freigabe'
//      standen NICHT im Constraint. logBillingAction() wirft bei 23514, und
//      weil der Audit-Aufruf mitten in importiereRuecklaeufer(),
//      erstelleFehler() und fuehreKorrekturAus() steht, riss er die
//      komplette Verarbeitung mit. Live gegen Produktion nachgewiesen.
//
//   2) ops_ereignis_regeln.ereignis_typ — 11 von 22 TypeScript-Werten waren
//      in der DB unzulaessig, 11 DB-Werte im Code unerreichbar.
//
// Diese Tests lesen die Constraints aus den Migrationsdateien und
// vergleichen sie mit den TypeScript-Listen.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT_ENTITY_TYPES } from '@/lib/billing/core/audit'
import { EREIGNIS_TYP_WERTE } from '@/lib/ops/types'

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

/**
 * Liest die zuletzt definierte Werteliste eines CHECK-Constraints aus den
 * Migrationen. "Zuletzt" = groesster Dateiname, da die Migrationen
 * zeitstempel-praefixiert sind und spaetere Dateien den Constraint neu setzen.
 * Rollback-Dateien werden ignoriert — sie stellen den Vorzustand her.
 */
function letzteConstraintWerte(constraintName: string, spalte: string): string[] | null {
  const dateien = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
    .sort()

  let treffer: string[] | null = null

  for (const datei of dateien) {
    const inhalt = readFileSync(join(MIGRATIONS, datei), 'utf8')
    if (!inhalt.includes(constraintName)) continue

    // ADD CONSTRAINT <name> CHECK (<spalte> IN ( 'a', 'b', ... ))
    const muster = new RegExp(
      `CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(\\s*${spalte}\\s+IN\\s*\\(([\\s\\S]*?)\\)\\s*\\)`,
      'g',
    )
    let m: RegExpExecArray | null
    while ((m = muster.exec(inhalt)) !== null) {
      const werte = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
      if (werte.length > 0) treffer = werte
    }
  }

  return treffer
}

describe('billing_audit_trail.entity_type', () => {
  const dbWerte = letzteConstraintWerte('billing_audit_trail_entity_type_check', 'entity_type')

  it('findet den Constraint in den Migrationen', () => {
    expect(dbWerte).not.toBeNull()
    expect(dbWerte!.length).toBeGreaterThan(10)
  })

  it('kennt jeden TypeScript-Wert auch in der Datenbank', () => {
    const unbekannt = AUDIT_ENTITY_TYPES.filter(t => !dbWerte!.includes(t))
    expect(
      unbekannt,
      `Diese entity_type-Werte wuerden zur Laufzeit mit 23514 scheitern: ${unbekannt.join(', ')}`,
    ).toEqual([])
  })

  it('enthaelt die im DTA-Pfad tatsaechlich genutzten Werte', () => {
    for (const wert of ['dta_lauf', 'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf', 'dta_validierung']) {
      expect(dbWerte).toContain(wert)
      expect(AUDIT_ENTITY_TYPES as readonly string[]).toContain(wert)
    }
  })

  it('enthaelt die frueher genutzten, ungueltigen Werte NICHT mehr im Code', () => {
    for (const alt of ['ruecklaeufer', 'fehlerprotokoll', 'korrekturlauf', 'dta_export', 'dta_freigabe', 'dakota_auftrag']) {
      expect(AUDIT_ENTITY_TYPES as readonly string[]).not.toContain(alt)
    }
  })
})

describe('ops_ereignis_regeln.ereignis_typ', () => {
  const dbWerte = letzteConstraintWerte('ops_ereignis_typ_check', 'ereignis_typ')

  it('findet den Constraint in den Migrationen', () => {
    expect(dbWerte).not.toBeNull()
  })

  it('ist deckungsgleich mit EREIGNIS_TYP_WERTE', () => {
    const nurCode = EREIGNIS_TYP_WERTE.filter(t => !dbWerte!.includes(t))
    const nurDb = dbWerte!.filter(t => !(EREIGNIS_TYP_WERTE as string[]).includes(t))
    expect(nurCode, `Nur in TypeScript (INSERT scheitert mit 23514): ${nurCode.join(', ')}`).toEqual([])
    expect(nurDb, `Nur in der DB (aus dem Code nicht erreichbar): ${nurDb.join(', ')}`).toEqual([])
  })

  it('kennt den Rueckläufer-Ereignistyp, den die Aufgaben-Automatik nutzt', () => {
    expect(dbWerte).toContain('abrechnung_ruecklaefer')
    expect(EREIGNIS_TYP_WERTE as string[]).toContain('abrechnung_ruecklaefer')
  })

  it('hat keine Duplikate in der TypeScript-Liste', () => {
    expect(new Set(EREIGNIS_TYP_WERTE).size).toBe(EREIGNIS_TYP_WERTE.length)
  })
})
