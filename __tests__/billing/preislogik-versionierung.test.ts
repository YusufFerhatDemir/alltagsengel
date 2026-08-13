/**
 * Stream 5 — Rechts- und Preislogik
 *
 * Prueft, dass Betraege, Tarife und Leistungsgrenzen nach Gueltigkeitsdatum
 * versioniert sind und bei fehlender/unverifizierter Datenlage fail-closed
 * reagieren (kein geratener Ersatzwert, kein Ausweichen auf einen anderen
 * Zeitraum).
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUDGET_VERSIONEN,
  BudgetVersionFehltError,
  budgetVersionFuerJahr,
  budgetVersionFuerJahrOderNull,
  ENTLASTUNG_MONATLICH_EUR,
  ENTLASTUNG_JAEHRLICH_EUR,
  VP_JAEHRLICH_EUR,
  KZP_JAEHRLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
} from '@/lib/config/budget-constants'
import { resolvePrice, type BillingTarif } from '@/lib/billing/core/price-resolver'

const repo = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// ═══════════════════════════════════════════════════════════════════════════
// 1. Budget-Konstanten: Versionierung nach Leistungsjahr
// ═══════════════════════════════════════════════════════════════════════════

describe('Budget-Versionierung: richtige Werte je Leistungsjahr', () => {
  it('2024 liefert die 2024er Saetze (125 EUR/Monat, 3.386 EUR VP+KZP)', () => {
    const v = budgetVersionFuerJahr(2024)
    expect(v.entlastungMonatlich).toBe(125)
    expect(v.entlastungJaehrlich).toBe(1500)
    expect(v.vpKzpKombiniert).toBe(3386)
  })

  it('2025 liefert die 2025er Saetze (131 EUR/Monat, 3.539 EUR VP+KZP)', () => {
    const v = budgetVersionFuerJahr(2025)
    expect(v.entlastungMonatlich).toBe(131)
    expect(v.entlastungJaehrlich).toBe(1572)
    expect(v.vpKzpKombiniert).toBe(3539)
  })

  it('2026 und 2027 liegen im offenen 2025er Zeitraum — keine Sonderbehandlung noetig', () => {
    for (const jahr of [2026, 2027]) {
      const v = budgetVersionFuerJahr(jahr)
      expect(v.gueltigAb).toBe('2025-01-01')
      expect(v.entlastungMonatlich).toBe(131)
    }
  })

  it('greift NICHT auf den 2025er Satz zurueck, wenn 2024 gefragt ist', () => {
    expect(budgetVersionFuerJahr(2024).entlastungMonatlich)
      .not.toBe(budgetVersionFuerJahr(2025).entlastungMonatlich)
  })
})

describe('Budget-Versionierung: Fail-Closed', () => {
  it('wirft fuer ein Jahr vor dem ersten Eintrag statt still den neuesten Satz zu liefern', () => {
    expect(() => budgetVersionFuerJahr(2023)).toThrow(BudgetVersionFehltError)
    expect(() => budgetVersionFuerJahr(2019)).toThrow(/Keine gesetzlichen Budgetwerte/)
  })

  it('nennt im Fehlertext die bekannten Zeitraeume und verlangt einen neuen Eintrag', () => {
    try {
      budgetVersionFuerJahr(2023)
      expect.fail('haette werfen muessen')
    } catch (e) {
      expect((e as Error).message).toContain('BUDGET_VERSIONEN')
      expect((e as Error).message).toContain('2024')
    }
  })

  it('wirft bei ungueltiger Jahreseingabe (NaN, Bruchzahl)', () => {
    expect(() => budgetVersionFuerJahr(Number.NaN)).toThrow(BudgetVersionFehltError)
    expect(() => budgetVersionFuerJahr(2025.5)).toThrow(BudgetVersionFehltError)
  })

  it('budgetVersionFuerJahrOderNull liefert null statt eines geratenen Werts', () => {
    expect(budgetVersionFuerJahrOderNull(2023)).toBeNull()
    expect(budgetVersionFuerJahrOderNull(2025)?.entlastungMonatlich).toBe(131)
  })

  it('ein geschlossener Zeitraum deckt kein Jahr danach ab', () => {
    const v2024 = BUDGET_VERSIONEN.find(v => v.gueltigAb === '2024-01-01')!
    expect(v2024.gueltigBis).toBe('2024-12-31')
    // 2025 darf NICHT die 2024er Version treffen
    expect(budgetVersionFuerJahr(2025).gueltigAb).toBe('2025-01-01')
  })
})

describe('Budget-Versionierung: Mechanismus fuer kuenftige Aenderungen', () => {
  it('Zeitraeume sind lueckenlos und ueberschneidungsfrei', () => {
    const sortiert = [...BUDGET_VERSIONEN].sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb))
    for (let i = 1; i < sortiert.length; i++) {
      const vorher = sortiert[i - 1]
      const jetzt = sortiert[i]
      expect(vorher.gueltigBis < jetzt.gueltigAb).toBe(true)
      // lueckenlos: der naechste Eintrag beginnt am Tag nach dem Ende
      const naechsterTag = new Date(`${vorher.gueltigBis}T00:00:00Z`)
      naechsterTag.setUTCDate(naechsterTag.getUTCDate() + 1)
      expect(jetzt.gueltigAb).toBe(naechsterTag.toISOString().slice(0, 10))
    }
  })

  it('genau ein Zeitraum ist offen (gueltigBis = 9999-12-31)', () => {
    expect(BUDGET_VERSIONEN.filter(v => v.gueltigBis === '9999-12-31')).toHaveLength(1)
  })

  it('die Datei dokumentiert, wie ein neuer Jahrgang eingetragen wird', () => {
    const src = repo('lib/config/budget-constants.ts')
    expect(src).toContain('NIEMALS überschreiben')
    expect(src).toContain('Fail-Closed')
  })

  it('Einzelkonstanten stammen aus der aktuellen Version, nicht aus Doppelpflege', () => {
    const aktuell = BUDGET_VERSIONEN[BUDGET_VERSIONEN.length - 1]
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(aktuell.entlastungMonatlich)
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(aktuell.entlastungJaehrlich)
    expect(VP_JAEHRLICH_EUR).toBe(aktuell.vpJaehrlich)
    expect(KZP_JAEHRLICH_EUR).toBe(aktuell.kzpJaehrlich)
    expect(VP_KZP_KOMBINIERT_EUR).toBe(aktuell.vpKzpKombiniert)
  })

  it('die bekannten gesetzlichen Werte 2025+ stehen unveraendert', () => {
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(131)
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(1572)
    expect(VP_KZP_KOMBINIERT_EUR).toBe(3539)
    expect(VP_JAEHRLICH_EUR + KZP_JAEHRLICH_EUR).toBe(VP_KZP_KOMBINIERT_EUR)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Tarif-Gueltigkeitsdaten in der Aufloesung
// ═══════════════════════════════════════════════════════════════════════════

function tarif(overrides: Partial<BillingTarif> = {}): BillingTarif {
  return {
    id: 'tarif-1',
    organization_id: 'org-1',
    kostentraeger_ik: null,
    leistungsart: 'alltagsbegleitung_45a',
    rechtsgrundlage: '§45b SGB XI',
    bundesland: null,
    vertragsgebiet: null,
    vertrag_referenz: null,
    qualifikation: null,
    verguetungsart: 'zeit_stunde',
    preis_cent: 2500,
    einheit: 'stunde',
    zuschlag_wochenende_prozent: 0,
    zuschlag_feiertag_prozent: 0,
    zuschlag_nacht_prozent: 0,
    nacht_von: '20:00',
    nacht_bis: '06:00',
    kombinations_abschlag_prozent: 0,
    gueltig_ab: '2025-01-01',
    gueltig_bis: null,
    tarifquelle: 'VERGUETUNGSVEREINBARUNG',
    tarif_status: 'verified',
    verifiziert_am: '2026-01-01T00:00:00Z',
    verifiziert_von: 'test',
    verifizierungs_quelle: 'Testquelle',
    ist_aktiv: true,
    ...overrides,
  }
}

/** Mock, der die Query-Filter mitprotokolliert. Die Zeilenfilterung nach
 *  gueltig_ab/gueltig_bis macht die DB — hier wird geprueft, dass sie
 *  ueberhaupt angefordert wird bzw. die Nachfilterung im Code greift. */
function mockDb(rows: BillingTarif[]) {
  const eqCalls: Array<[string, unknown]> = []
  const lteCalls: Array<[string, unknown]> = []
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return chain })
  chain.lte = vi.fn((col: string, val: unknown) => { lteCalls.push([col, val]); return chain })
  chain.is = vi.fn().mockReturnValue(chain)
  chain.returns = vi.fn().mockResolvedValue({ data: rows, error: null })
  return { db: chain as never, eqCalls, lteCalls }
}

const PARAMS = {
  organizationId: 'org-1',
  leistungsart: 'alltagsbegleitung_45a',
  rechtsgrundlage: '§45b SGB XI',
  datum: '2026-06-15',
}

describe('Tarifaufloesung: Gueltigkeitszeitraum', () => {
  it('prueft das Leistungsdatum gegen gueltig_ab in der DB-Query', async () => {
    const { db, lteCalls } = mockDb([tarif()])
    await resolvePrice(db, PARAMS)
    expect(lteCalls).toContainEqual(['gueltig_ab', '2026-06-15'])
  })

  it('fenced auf die Organisation — kein Tarifwerk fremder Mandanten', async () => {
    const { db, eqCalls } = mockDb([tarif()])
    await resolvePrice(db, PARAMS)
    expect(eqCalls).toContainEqual(['organization_id', 'org-1'])
  })

  it('ohne organizationId wird gar nicht erst gesucht', async () => {
    const { db } = mockDb([tarif()])
    await expect(resolvePrice(db, { ...PARAMS, organizationId: '' }))
      .rejects.toThrow(/organizationId fehlt/)
  })

  it('abgelaufener Tarif (gueltig_bis vor Leistungsdatum) wird nicht verwendet', async () => {
    const { db } = mockDb([tarif({ gueltig_bis: '2026-05-31' })])
    await expect(resolvePrice(db, PARAMS))
      .rejects.toThrow(/Kein gültiger Tarif zum Datum 2026-06-15/)
  })

  it('kein Ausweichen auf einen Tarif aus einem anderen Zeitraum', async () => {
    // Ein alter, guenstigerer Tarif ist abgelaufen; ein neuer existiert nicht.
    const { db } = mockDb([
      tarif({ id: 'alt', preis_cent: 2000, gueltig_ab: '2025-01-01', gueltig_bis: '2025-12-31' }),
    ])
    await expect(resolvePrice(db, PARAMS)).rejects.toThrow(/Kein gültiger Tarif/)
  })

  it('am letzten Gueltigkeitstag gilt der Tarif noch', async () => {
    const { db } = mockDb([tarif({ gueltig_bis: '2026-06-15' })])
    const t = await resolvePrice(db, PARAMS)
    expect(t.id).toBe('tarif-1')
  })

  it('bei zwei gleich spezifischen Tarifen gewinnt der mit dem spaeteren gueltig_ab', async () => {
    const { db } = mockDb([
      tarif({ id: 'alt', preis_cent: 2000, gueltig_ab: '2025-01-01' }),
      tarif({ id: 'neu', preis_cent: 2500, gueltig_ab: '2026-01-01' }),
    ])
    const t = await resolvePrice(db, PARAMS)
    expect(t.id).toBe('neu')
  })

  it('ein unbrauchbares Leistungsdatum blockiert die Aufloesung', async () => {
    const { db } = mockDb([tarif()])
    await expect(resolvePrice(db, { ...PARAMS, datum: '15.06.2026' }))
      .rejects.toThrow(/kein ISO-Datum/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Fail-Closed-Vollstaendigkeit — Quellcode-Ebene
// ═══════════════════════════════════════════════════════════════════════════

describe('Fail-Closed: alle Preisquellen respektieren tarif_status', () => {
  it('price-resolver blockiert nicht-verifizierte Kassentarife', () => {
    const src = repo('lib/billing/core/price-resolver.ts')
    expect(src).toContain('TarifNichtVerifiziertError')
    expect(src).toContain("tarif_status !== 'verified'")
  })

  it('create_invoice_draft_atomic filtert auf verified (RPC-Migration)', () => {
    const src = repo('supabase/migrations/20260831050000_fail_closed_tarif_status_rpcs.sql')
    expect(src).toContain("bt.tarif_status = 'verified'")
  })

  it('correctInvoice prueft den Tarifstatus vor der Korrektur', () => {
    const src = repo('lib/billing/core/invoice-engine.ts')
    expect(src).toContain('tarif_status')
  })

  it('monatsabschluss verwendet nur verifizierte leistungspreise', () => {
    const src = repo('lib/abrechnung/monatsabschluss.ts')
    expect(src).toContain("p.tarif_status === 'verified'")
    expect(src).toContain('nicht_verifiziert')
  })

  it('monatsabschluss laedt leistungspreise mandantengefenced', () => {
    const src = repo('lib/abrechnung/monatsabschluss.ts')
    const abschnitt = src.slice(src.indexOf("from('leistungspreise')"))
    expect(abschnitt.slice(0, 400)).toContain("eq('organization_id', organizationId)")
  })

  it('monatsabschluss faellt NICHT auf service_records.amount zurueck', () => {
    const src = repo('lib/abrechnung/monatsabschluss.ts')
    expect(src).toContain('KEIN Ersatzpreis')
  })

  it('POST /api/billing/tariffs kann keinen Tarif direkt verifizieren', () => {
    const src = repo('app/api/billing/tariffs/route.ts')
    expect(src).toContain("tarif_status: 'unverified'")
  })

  it('Verifizierung verlangt eine Rechtsquelle', () => {
    const src = repo('app/api/billing/tariffs/[id]/verifizierung/route.ts')
    expect(src).toContain('Rechtsquelle')
    expect(src).toContain('quelle.length < 5')
  })
})

describe('Fail-Closed: Verifizierung verfaellt bei Preisaenderung', () => {
  const migration = repo('supabase/migrations/20260902000000_preislogik_versionierung_fail_closed.sql')

  it('Trigger setzt verifizierte Tarife bei Preisaenderung zurueck', () => {
    expect(migration).toContain('trg_verifizierung_verfaellt')
    expect(migration).toContain("NEW.tarif_status          := 'unverified'")
    expect(migration).toContain('NEW.preis_cent IS DISTINCT FROM OLD.preis_cent')
  })

  it('Trigger reagiert auch auf verschobene Gueltigkeitszeitraeume', () => {
    expect(migration).toContain('NEW.gueltig_ab  IS DISTINCT FROM OLD.gueltig_ab')
    expect(migration).toContain('NEW.gueltig_bis IS DISTINCT FROM OLD.gueltig_bis')
  })

  it('Trigger haengt an beiden Preistabellen', () => {
    expect(migration).toContain('BEFORE UPDATE ON public.billing_tariffs')
    expect(migration).toContain('BEFORE UPDATE ON public.leistungspreise')
  })

  it('Trigger-Funktion hat einen festen search_path', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.trg_verifizierung_verfaellt'))
    expect(fn.slice(0, 400)).toContain('SET search_path = public')
  })

  it('leistungspreise startet fail-closed auf unverified', () => {
    expect(migration).toContain("tarif_status TEXT NOT NULL DEFAULT 'unverified'")
    expect(migration).toContain("CHECK (tarif_status IN ('verified', 'unverified', 'blocked'))")
  })

  it('die Migration erfindet keine PfluV-Tarife', () => {
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.billing_tariffs/i)
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.leistungspreise/i)
    // Kein Preis wird gesetzt — nur Statusfelder und Begruendungstexte.
    expect(migration).not.toMatch(/SET\s+preis_cent/i)
    expect(migration).not.toMatch(/SET\s+tarif_status\s*=/i)
  })

  it('35-EUR-Tarife bleiben unangetastet', () => {
    expect(migration).not.toContain('3500')
  })

  it('hat eine Rollback-Datei', () => {
    const rb = repo('supabase/migrations/20260902000001_rollback_preislogik_versionierung_fail_closed.sql')
    expect(rb).toContain('DROP COLUMN IF EXISTS tarif_status')
    expect(rb).toContain('DROP FUNCTION IF EXISTS public.trg_verifizierung_verfaellt')
  })
})
