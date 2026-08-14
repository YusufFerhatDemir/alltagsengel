// ═══════════════════════════════════════════════════════════════════
// Agent 2 / E2E-Nutzerworkflow — Schritt 9 „Tarif zuordnen"
// ═══════════════════════════════════════════════════════════════════
// LIVE-BEFUND 14.08.2026:
//   service_records.service_type trägt Klartext aus den Erfassungsmasken
//   ('Haushaltshilfe'), billing_tariffs.leistungsart trägt Schlüssel
//   ('hauswirtschaft'). create_invoice_draft_atomic() verband beide mit
//   LOWER(a) = LOWER(b) — deshalb waren 5 der 8 angebotenen Leistungsarten
//   strukturell nicht abrechenbar und 12 von 30 Leistungsnachweisen
//   scheiterten erst beim Rechnungslauf mit MISSING_VALID_TARIFF.
//
// Diese Tests halten drei Dinge fest:
//   1. Jede in den Masken angebotene Leistungsart löst auf einen Tarif auf.
//   2. Leistungen ohne fachlichen §45a/Privat-Tarif bleiben fail-closed
//      (kein stilles Ausweichen auf 'sonstige' zum Begleitungssatz).
//   3. TypeScript- und SQL-Zuordnung sind deckungsgleich — die Vorprüfung
//      bei der Erfassung darf nicht anders entscheiden als die Abrechnung.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  TARIF_LEISTUNGSARTEN,
  tarifLeistungsart,
  normalisiereLeistungsart,
  bekannteLeistungsarten,
} from '@/lib/billing/leistungsarten'
import { SERVICE_TYPES } from '@/lib/admin/ops'

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260908000000_leistungsart_tarif_mapping.sql',
)

/**
 * Leistungsarten, die live als billing_tariffs.leistungsart existieren
 * (Stand 2026-08-14, 23 Tarife). Weicht der kanonische Satz davon ab,
 * zeigt eine Zuordnung auf einen Tarif, den es nicht gibt.
 */
const LIVE_TARIFARTEN = [
  'alltagsbegleitung', 'begleitservice', 'betreuung_45a', 'demenzbetreuung',
  'einkaufsservice', 'hauswirtschaft', 'nachtbetreuung', 'sonstige',
  'wegepauschale', 'wochenendbetreuung',
]

describe('kanonische Leistungsarten', () => {
  it('entsprechen genau den live vorhandenen Tarifarten', () => {
    expect([...TARIF_LEISTUNGSARTEN].sort()).toEqual([...LIVE_TARIFARTEN].sort())
  })

  it('bilden auf sich selbst ab', () => {
    for (const art of TARIF_LEISTUNGSARTEN) {
      expect(tarifLeistungsart(art)).toBe(art)
    }
  })
})

describe('Erfassungsmasken — jede angebotene Leistungsart ist abrechenbar', () => {
  // Das ist der eigentliche Regressionsschutz: sobald jemand der Auswahlliste
  // eine Leistungsart hinzufügt, für die es keinen Tarif gibt, schlägt dieser
  // Test an — nicht erst der Rechnungslauf Wochen später.
  for (const st of SERVICE_TYPES) {
    it(`„${st}" löst auf einen Tarif auf`, () => {
      const art = tarifLeistungsart(st)
      expect(art, `„${st}" hat keine Tarifzuordnung`).not.toBeNull()
      expect(LIVE_TARIFARTEN).toContain(art)
    })
  }

  it('deckt die konkreten Live-Befunde ab', () => {
    expect(tarifLeistungsart('Haushaltshilfe')).toBe('hauswirtschaft')
    expect(tarifLeistungsart('Einkaufshilfe')).toBe('einkaufsservice')
    expect(tarifLeistungsart('Arztbegleitung')).toBe('begleitservice')
    expect(tarifLeistungsart('Betreuung / Gesellschaft')).toBe('betreuung_45a')
    expect(tarifLeistungsart('Spaziergang / Mobilität')).toBe('alltagsbegleitung')
  })

  it('behandelt beide Schreibweisen mit und ohne Leerzeichen gleich', () => {
    // 'Betreuung / Gesellschaft' (lib/admin/ops.ts) und 'Betreuung/Gesellschaft'
    // (Kalender, Tourenplanung, Engel-Bereich) existieren beide in den Masken.
    expect(tarifLeistungsart('Betreuung/Gesellschaft'))
      .toBe(tarifLeistungsart('Betreuung / Gesellschaft'))
    expect(tarifLeistungsart('Spaziergang/Mobilität'))
      .toBe(tarifLeistungsart('Spaziergang / Mobilität'))
  })
})

describe('fail-closed — keine Zuordnung wird geraten', () => {
  it('lehnt SGB-V-Pflegeleistungen ab, statt sie als „sonstige" abzurechnen', () => {
    // Beide existieren live als service_records. Ein Ausweichen auf 'sonstige'
    // würde sie zum Begleitungssatz (40,00 €/h) abrechnen — falscher Preis
    // und falsche Rechtsgrundlage.
    expect(tarifLeistungsart('Grosse Koerperpflege')).toBeNull()
    expect(tarifLeistungsart('Medikamentengabe')).toBeNull()
  })

  it('lehnt Unbekanntes und Leeres ab', () => {
    expect(tarifLeistungsart('Rasenmähen')).toBeNull()
    expect(tarifLeistungsart('')).toBeNull()
    expect(tarifLeistungsart(null)).toBeNull()
    expect(tarifLeistungsart(undefined)).toBeNull()
  })
})

describe('Normalisierung', () => {
  it('löst Umlaute auf und vereinheitlicht Trennzeichen', () => {
    expect(normalisiereLeistungsart('Spaziergang / Mobilität')).toBe('spaziergang/mobilitaet')
    expect(normalisiereLeistungsart('  Haushaltshilfe  ')).toBe('haushaltshilfe')
    expect(normalisiereLeistungsart('HAUSWIRTSCHAFT')).toBe('hauswirtschaft')
  })
})

describe('TypeScript und SQL entscheiden gleich', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('die Migration definiert beide Funktionen', () => {
    expect(sql).toContain('FUNCTION public.normalisiere_leistungsart')
    expect(sql).toContain('FUNCTION public.tarif_leistungsart')
  })

  it('die RPC benutzt die Zuordnung statt des reinen LOWER-Vergleichs', () => {
    expect(sql).toContain('LOWER(bt.leistungsart) = public.tarif_leistungsart(v_rec.service_type)')
    // Der alte, defekte Vergleich darf im SQL-Körper nicht mehr vorkommen.
    const koerper = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.create_invoice_draft_atomic'))
    expect(koerper).not.toContain('LOWER(bt.leistungsart) = LOWER(v_rec.service_type)')
  })

  it('jede TypeScript-Zuordnung steht auch im SQL — und umgekehrt', () => {
    // Aus der SQL-CASE-Liste die Paare 'quelle' → 'ziel' herausziehen.
    const block = sql.slice(
      sql.indexOf('FUNCTION public.tarif_leistungsart'),
      sql.indexOf('COMMENT ON FUNCTION public.tarif_leistungsart'),
    )
    const sqlPaare = new Map<string, string>()
    for (const m of block.matchAll(/WHEN\s+'([^']+)'\s+THEN\s+'([^']+)'/g)) {
      sqlPaare.set(m[1], m[2])
    }

    expect(sqlPaare.size).toBeGreaterThan(TARIF_LEISTUNGSARTEN.length)

    // SQL → TypeScript
    for (const [quelle, ziel] of sqlPaare) {
      expect(tarifLeistungsart(quelle), `SQL kennt „${quelle}", TypeScript nicht`).toBe(ziel)
    }

    // TypeScript → SQL
    for (const quelle of bekannteLeistungsarten()) {
      expect(
        sqlPaare.get(quelle),
        `TypeScript kennt „${quelle}", die SQL-Funktion nicht`,
      ).toBe(tarifLeistungsart(quelle))
    }
  })
})
