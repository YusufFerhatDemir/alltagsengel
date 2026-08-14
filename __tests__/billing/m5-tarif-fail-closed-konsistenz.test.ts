/**
 * M-5: Fail-Closed-Konsistenz über ALLE Tarif-Entscheidungsstellen
 *
 * BEFUND (Abschlussbericht):
 *   Alle 24 leistungspreise-Zeilen stehen auf 'unverified', in billing_tariffs
 *   gibt es genau einen verifizierten Kassentarif (Wegepauschale §45b).
 *   Für §39 SGB XI (Verhinderungspflege) existiert kein verwendbarer Tarif.
 *
 * Das ist ein DATEN-Zustand, kein Code-Fehler — und er wird hier bewusst
 * NICHT „repariert". Einen Tarif auf 'verified' zu setzen ist eine fachliche
 * Entscheidung mit Belegpflicht (Vergütungsvereinbarung, Anerkennungsbescheid
 * oder Rechtsverordnung); siehe docs/TARIF_VERIFIZIERUNG_ZUSTAND.md.
 *
 * Was Tests leisten können, ist die andere Hälfte: sicherstellen, dass der
 * unverifizierte Zustand ÜBERALL gleich streng blockiert. Ein Fail-Closed,
 * das nur vier von fünf Wegen kennt, ist kein Fail-Closed — genau so ist der
 * Korrektur-Bypass vom 13.08. entstanden.
 *
 * Geprüfte Entscheidungsstellen:
 *   1. resolvePrice()                   — Rechnungserstellung (TS)
 *   2. isTarifFuerKorrekturVerwendbar() — Korrekturrechnung (TS)
 *   3. bewerteAbrechenbarkeit()         — UI/Übersicht (TS)
 *   4. create_invoice_draft_atomic()    — Rechnungs-RPC (SQL)
 *   5. zaehle_kassentarife()            — Go-Live-Ampel (SQL)
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  resolvePrice,
  TarifNichtVerifiziertError,
  type TarifStatus,
} from '@/lib/billing/core/price-resolver'
import { isTarifFuerKorrekturVerwendbar } from '@/lib/billing/core/invoice-engine'
import { bewerteAbrechenbarkeit, normalisiereStatus } from '@/lib/billing/core/tarif-verifizierung'

const REPO_ROOT = join(__dirname, '..', '..')
const MIGRATIONS = join(REPO_ROOT, 'supabase', 'migrations')

// ---------------------------------------------------------------------------
// Die eine Regel, gegen die alles geprüft wird
// ---------------------------------------------------------------------------

/**
 *   'blocked'                  → nie, auch privat nicht
 *   Kassentarif (!== 'privat') → nur 'verified'
 *   Privattarif                → alles ausser 'blocked'
 *   fehlender Status           → wie 'unverified'
 */
function darfAbgerechnetWerden(status: string | null | undefined, rechtsgrundlage: string): boolean {
  const s = normalisiereStatus(status)
  if (s === 'blocked') return false
  if (rechtsgrundlage === 'privat') return true
  return s === 'verified'
}

const STATUS: Array<string | null> = ['verified', 'unverified', 'blocked', null, 'quatsch']
const GRUNDLAGEN = ['privat', '§45b SGB XI', '§39 SGB XI', '§36 SGB XI']

const MATRIX = GRUNDLAGEN.flatMap(rg => STATUS.map(st => ({ rg, st })))

// ---------------------------------------------------------------------------
// Supabase-Mock für resolvePrice
// ---------------------------------------------------------------------------

function mockSupabase(tarif: Record<string, unknown>) {
  const q: Record<string, unknown> = {}
  const weiter = () => q
  q.select = weiter
  q.eq = weiter
  q.lte = weiter
  q.is = weiter
  q.returns = async () => ({ data: [tarif], error: null })
  return { from: () => q }
}

function tarifZeile(status: string | null, rechtsgrundlage: string) {
  return {
    id: 'tarif-1',
    organization_id: 'org-1',
    kostentraeger_ik: null,
    leistungsart: 'hauswirtschaft',
    rechtsgrundlage,
    bundesland: null,
    vertragsgebiet: null,
    vertrag_referenz: null,
    qualifikation: null,
    verguetungsart: 'zeit_stunde',
    preis_cent: 3500,
    einheit: 'stunde',
    zuschlag_wochenende_prozent: 0,
    zuschlag_feiertag_prozent: 0,
    zuschlag_nacht_prozent: 0,
    nacht_von: '22:00',
    nacht_bis: '06:00',
    kombinations_abschlag_prozent: 0,
    gueltig_ab: '2025-01-01',
    gueltig_bis: null,
    tarifquelle: 'MANUELL_FREIGEGEBEN',
    tarif_status: status as TarifStatus,
    verifiziert_am: null,
    verifiziert_von: null,
    verifizierungs_quelle: null,
    ist_aktiv: true,
  }
}

async function resolvePriceErlaubt(status: string | null, rechtsgrundlage: string): Promise<boolean> {
  try {
    await resolvePrice(mockSupabase(tarifZeile(status, rechtsgrundlage)) as never, {
      organizationId: 'org-1',
      leistungsart: 'hauswirtschaft',
      rechtsgrundlage,
      datum: '2026-08-01',
    })
    return true
  } catch (e) {
    if (e instanceof TarifNichtVerifiziertError) return false
    throw e
  }
}

// ---------------------------------------------------------------------------
// 1–3) TypeScript-Entscheidungsstellen
// ---------------------------------------------------------------------------

describe('M-5: alle TS-Pfade entscheiden identisch', () => {
  it.each(MATRIX)('resolvePrice: $rg / $st', async ({ rg, st }) => {
    expect(await resolvePriceErlaubt(st, rg)).toBe(darfAbgerechnetWerden(st, rg))
  })

  it.each(MATRIX)('isTarifFuerKorrekturVerwendbar: $rg / $st', ({ rg, st }) => {
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: st, rechtsgrundlage: rg }))
      .toBe(darfAbgerechnetWerden(st, rg))
  })

  it.each(MATRIX)('bewerteAbrechenbarkeit (billing_tariffs): $rg / $st', ({ rg, st }) => {
    expect(
      bewerteAbrechenbarkeit({ quellTabelle: 'billing_tariffs', tarifStatus: st, rechtsgrundlage: rg })
        .abrechenbar,
    ).toBe(darfAbgerechnetWerden(st, rg))
  })
})

// ---------------------------------------------------------------------------
// leistungspreise: IMMER Kassenlogik, es gibt dort keinen Privatweg
// ---------------------------------------------------------------------------

describe('M-5: leistungspreise sind nie privat', () => {
  it.each(STATUS)('Status %s → abrechenbar nur bei verified', (st) => {
    const { abrechenbar } = bewerteAbrechenbarkeit({
      quellTabelle: 'leistungspreise',
      tarifStatus: st,
    })
    expect(abrechenbar).toBe(normalisiereStatus(st) === 'verified')
  })

  it('eine rechtsgrundlage an leistungspreise oeffnet keinen Privatweg', () => {
    // leistungspreise hat die Spalte gar nicht — ein durchgereichtes
    // 'privat' darf die Sperre trotzdem nicht aushebeln.
    const { abrechenbar } = bewerteAbrechenbarkeit({
      quellTabelle: 'leistungspreise',
      tarifStatus: 'unverified',
      rechtsgrundlage: 'privat',
    })
    expect(abrechenbar).toBe(false)
  })

  it('der reale Live-Zustand (alle 24 unverified) ist damit vollstaendig gesperrt', () => {
    const live = Array.from({ length: 24 }, () => ({
      quellTabelle: 'leistungspreise' as const,
      tarifStatus: 'unverified',
    }))
    expect(live.filter(z => bewerteAbrechenbarkeit(z).abrechenbar)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4–5) SQL-Entscheidungsstellen
// ---------------------------------------------------------------------------

describe('M-5: die RPC-Pfade tragen dieselbe Regel', () => {
  const failClosed = readFileSync(
    join(MIGRATIONS, '20260831050000_fail_closed_tarif_status_rpcs.sql'),
    'utf-8',
  )

  it('create_invoice_draft_atomic filtert Kassentarife auf verified', () => {
    const bedingung =
      /\(v_rechtsgrundlage <> 'privat' AND bt\.tarif_status = 'verified'\)\s*\n?\s*OR \(v_rechtsgrundlage = 'privat' AND bt\.tarif_status <> 'blocked'\)/
    const treffer = failClosed.match(new RegExp(bedingung, 'g'))
    // Zwei Vorkommen: Haupt- und Fallback-Aufloesung. Beide muessen die
    // Bedingung tragen — ein ungefilterter Fallback waere der Bypass.
    expect(treffer?.length).toBeGreaterThanOrEqual(2)
  })

  it('zaehle_kassentarife zaehlt nur verifizierte Tarife', () => {
    expect(failClosed).toMatch(/t\.tarif_status = 'verified'/)
  })

  it('keine spaetere Migration definiert zaehle_kassentarife ohne den Filter neu', () => {
    // Regressionsschutz: 20260808130000 enthaelt noch die alte, ungefilterte
    // Fassung. Wird sie (oder eine Kopie davon) nach dem Fail-Closed-Fix
    // erneut angewendet, steht die Sperre still wieder offen.
    const spaeter = readdirSync(MIGRATIONS)
      .filter(f => f.endsWith('.sql'))
      .filter(f => !f.includes('rollback'))
      .filter(f => f > '20260831050000')

    const oeffner = spaeter.filter(f => {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf-8')
      if (!/CREATE OR REPLACE FUNCTION public\.zaehle_kassentarife/.test(sql)) return false
      return !/tarif_status = 'verified'/.test(sql)
    })

    expect(oeffner).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Der Daten-Zustand selbst ist dokumentiert, nicht geheilt
// ---------------------------------------------------------------------------

describe('M-5: Zustandsdokumentation', () => {
  const doku = readFileSync(join(REPO_ROOT, 'docs', 'TARIF_VERIFIZIERUNG_ZUSTAND.md'), 'utf-8')

  it('benennt, wer welchen Tarif verifizieren muss', () => {
    expect(doku).toContain('§39 SGB XI')
    expect(doku).toContain('leistungspreise')
    expect(doku).toContain('billing_tariffs')
  })

  it('macht keine Preisangabe zur Freigabe (keine erfundenen Tarife)', () => {
    expect(doku).not.toMatch(/UPDATE\s+(public\.)?(billing_tariffs|leistungspreise)\s+SET\s+tarif_status\s*=\s*'verified'/i)
  })
})
