/**
 * Monatsabschluss (Vorschau) auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `erstelleMonatsabschluss()` beantwortet einmal im Monat die Frage, was
 * gegenueber den Kostentraegern abrechenbar ist — und schreibt das
 * Ergebnis je Klient in `monthly_closings`. Es ist ausdruecklich eine
 * VORSCHAU (der Modulkopf sagt das deutlich), aber es ist die Vorschau,
 * auf deren Ampel jemand seine Monatsplanung stuetzt.
 *
 * Ungeprueft war der ganze Durchlauf. Gefahren wird gegen PGlite, weil
 * die harten Punkte in der Datenbank sitzen: die CHECK-Constraints auf
 * `monthly_closings.status`/`ampel`, der `onConflict`-Upsert auf
 * (client_id, year, month), die Fail-Closed-Preissuche in
 * `leistungspreise` — und der Spalten-Default `current_org_id()`, an dem
 * der Befund unten haengt.
 *
 * ── BEFUND, DEN DIESE SUITE AUSGELOEST HAT ─────────────────────────────
 *   M-1  Der Upsert auf `monthly_closings` schrieb KEIN
 *        `organization_id`. Damit griff der Spalten-Default
 *        `current_org_id()` (Phase 3, 20260801) — und der faellt bei
 *        einem service-role-Client ohne JWT auf die Stamm-Organisation
 *        zurueck. Der Monatsabschluss JEDES Mandanten landete in der
 *        Stamm-Org; der Mandant selbst sah ihn wegen der RESTRICTIVE
 *        org_fence-Policy nie. Genau dieser Fehler ist in
 *        lib/billing/core/audit.ts schon einmal beschrieben worden.
 *
 * PREISE: alle `preis_cent`-Werte sind Testwerte innerhalb der
 * In-Memory-Instanz. Es wird kein Landesvertragssatz behauptet — der
 * Test prueft die MECHANIK der Preissuche, nicht die Hoehe.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  baueMonatsabschlussTabellen,
  STAMM_ORG,
} from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { erstelleMonatsabschluss } from '@/lib/abrechnung/monatsabschluss'

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000ab01'
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000ab01'

const KLIENT_A = 'c1111111-0000-4000-8000-00000000ab01'
const KLIENT_A2 = 'c1111111-0000-4000-8000-00000000ab02'
const KLIENT_B = 'c2222222-0000-4000-8000-00000000ab01'
const ENGEL = 'e1111111-0000-4000-8000-00000000ab01'

const MONAT = '2026-07'
const LEISTUNGSART = 'alltagsbegleitung'

let db: PGlite
let admin: SupabaseClient

async function zeilen<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query<T>(sql)
  return r.rows
}

let zaehler = 0
function neueId(praefix: string): string {
  zaehler++
  return `${praefix}-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
}

async function legeVerordnung(opts: {
  org: string
  klient: string
  status?: string
  aktenzeichen?: string | null
  genehmigungBis?: string | null
  abtretung?: boolean
  kostentraegerName?: string
  kostentraegerTyp?: string
  ik?: string | null
  leistungsart?: string
}): Promise<string> {
  const id = neueId('40000000')
  await db.query(
    `INSERT INTO public.verordnungen
       (id, organization_id, client_id, verordnung_type, ausstellungsdatum,
        genehmigung_status, genehmigung_aktenzeichen, genehmigung_bis,
        abtretungserklaerung_vorhanden, kostentraeger_typ, kostentraeger_name,
        kostentraeger_ik_nummer, leistungsart)
     VALUES ($1, $2, $3, 'entlastung_45b', '2026-06-01', $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id, opts.org, opts.klient,
      opts.status ?? 'genehmigt',
      opts.aktenzeichen === undefined ? 'AZ-2026-0001' : opts.aktenzeichen,
      opts.genehmigungBis ?? '2026-12-31',
      opts.abtretung ?? true,
      opts.kostentraegerTyp ?? 'krankenkasse',
      opts.kostentraegerName ?? 'Testkasse',
      opts.ik ?? '109999999',
      opts.leistungsart ?? LEISTUNGSART,
    ] as never[],
  )
  return id
}

async function legeEinsatz(opts: {
  org: string
  klient: string
  verordnung: string
  datum: string
  minuten: number
  status?: string
  unterschrift?: string | null
  serviceType?: string
}): Promise<string> {
  const id = neueId('50000000')
  await db.query(
    `INSERT INTO public.service_records
       (id, organization_id, client_id, caregiver_id, date, start_time, end_time,
        duration_minutes, service_type, budget_type, amount, client_signature,
        caregiver_initials, status, verordnung_id)
     VALUES ($1, $2, $3, $4, $5, '09:00', '10:00', $6, $7, 'entlastung', 0, $8,
             'AB', $9, $10)`,
    [
      id, opts.org, opts.klient, ENGEL, opts.datum, opts.minuten,
      opts.serviceType ?? LEISTUNGSART,
      opts.unterschrift === undefined ? 'sig-data' : opts.unterschrift,
      opts.status ?? 'complete',
      opts.verordnung,
    ] as never[],
  )
  return id
}

async function legePreis(opts: {
  org: string
  bundesland?: string
  leistungsart?: string
  preisCent: number
  gueltigAb?: string
  gueltigBis?: string | null
  status?: string
  quelle?: string | null
}): Promise<void> {
  await db.query(
    `INSERT INTO public.leistungspreise
       (organization_id, bundesland, leistungsart, preis_cent, gueltig_ab,
        gueltig_bis, tarif_status, verifizierungs_quelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opts.org, opts.bundesland ?? 'hessen', opts.leistungsart ?? LEISTUNGSART,
      opts.preisCent, opts.gueltigAb ?? '2026-01-01', opts.gueltigBis ?? null,
      opts.status ?? 'verified', opts.quelle ?? null,
    ] as never[],
  )
}

async function leere(): Promise<void> {
  await db.exec(`
    DELETE FROM public.monthly_closings;
    DELETE FROM public.service_signatures;
    DELETE FROM public.service_records;
    DELETE FROM public.verordnungen;
    DELETE FROM public.leistungspreise;
  `)
}

/** Kurzform fuer den Standard-Lauf auf Mandant A. */
function lauf(opts: Partial<Parameters<typeof erstelleMonatsabschluss>[2]> = {}) {
  return erstelleMonatsabschluss(MONAT, admin, {
    bundesland: 'hessen',
    organizationId: ORG_A,
    ...opts,
  })
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueMonatsabschlussTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${STAMM_ORG}', 'Alltagsengel', 'hessen', 'active'),
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active');

    INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name, zip_code) VALUES
      ('${KLIENT_A}',  '${ORG_A}', 'A-0001', 'Erika', 'Mustermann', '60311'),
      ('${KLIENT_A2}', '${ORG_A}', 'A-0002', 'Hans',  'Zweitkunde', '60311'),
      ('${KLIENT_B}',  '${ORG_B}', 'B-0001', 'Berta', 'Fremdorg',   '80331');

    INSERT INTO public.caregivers (id, organization_id, first_name, last_name, initials, status)
      VALUES ('${ENGEL}', '${ORG_A}', 'Anna', 'Engel', 'AE', 'active');
  `)
}, 120000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await leere()
})

// ═════════════════════════════════════════════════════════════════════
describe('Eingaben', () => {
  it('weist ein falsches Monatsformat ab', async () => {
    await expect(lauf().then(() => erstelleMonatsabschluss('2026-7', admin, {
      bundesland: 'hessen', organizationId: ORG_A,
    }))).rejects.toThrow(/YYYY-MM/)
  })

  it('verlangt ein Bundesland — kein stiller Hessen-Rueckfall', async () => {
    await expect(
      erstelleMonatsabschluss(MONAT, admin, { bundesland: '', organizationId: ORG_A }),
    ).rejects.toThrow(/Bundesland fehlt/)
  })

  it('verlangt einen Mandanten', async () => {
    await expect(
      erstelleMonatsabschluss(MONAT, admin, { bundesland: 'hessen', organizationId: '' }),
    ).rejects.toThrow(/organizationId fehlt/)
  })

  it('berechnet den Zeitraum bis zum echten Monatsletzten', async () => {
    const feb = await erstelleMonatsabschluss('2026-02', admin, {
      bundesland: 'hessen', organizationId: ORG_A,
    })
    expect(feb.zeitraum).toEqual({ von: '2026-02-01', bis: '2026-02-28' })

    const jul = await lauf()
    expect(jul.zeitraum).toEqual({ von: '2026-07-01', bis: '2026-07-31' })
  })

  it('meldet ohne genehmigte Verordnungen einen Hinweis statt eines Fehlers', async () => {
    const r = await lauf()
    expect(r.verordnungen_geprueft).toBe(0)
    expect(r.gruppen).toEqual([])
    expect(r.warnungen[0].schwere).toBe('hinweis')
    expect(r.closings_geschrieben).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Auswahl der Einsaetze', () => {
  let verordnung: string

  beforeEach(async () => {
    verordnung = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legePreis({ org: ORG_A, preisCent: 3000 })
  })

  it('rechnet nur Einsaetze INNERHALB des Monats', async () => {
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-06-30', minuten: 60 })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-07-01', minuten: 60 })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-07-31', minuten: 60 })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-08-01', minuten: 60 })

    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].einsaetze).toBe(2)
    expect(r.gruppen[0].positionen[0].minuten).toBe(120)
  })

  it('nimmt nur abschlussreife Status auf', async () => {
    for (const status of ['draft', 'incomplete']) {
      await legeEinsatz({
        org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-07-05',
        minuten: 60, status,
      })
    }
    for (const status of ['complete', 'signed', 'invoiced']) {
      await legeEinsatz({
        org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-07-06',
        minuten: 60, status,
      })
    }

    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].einsaetze).toBe(3)
  })

  it('laesst eine Verordnung ohne Einsaetze im Monat ganz weg', async () => {
    const r = await lauf({ dryRun: true })
    expect(r.verordnungen_geprueft).toBe(1)
    expect(r.gruppen).toEqual([])
    expect(r.positionen_abrechenbar).toBe(0)
  })

  it('greift nicht auf Verordnungen anderer Mandanten zu', async () => {
    const fremd = await legeVerordnung({ org: ORG_B, klient: KLIENT_B })
    await legeEinsatz({ org: ORG_B, klient: KLIENT_B, verordnung: fremd, datum: '2026-07-05', minuten: 60 })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-07-05', minuten: 60 })

    const r = await lauf({ dryRun: true })
    expect(r.verordnungen_geprueft).toBe(1)
    expect(r.gruppen[0].positionen.map(p => p.client_id)).toEqual([KLIENT_A])
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Preisermittlung — fail closed', () => {
  let verordnung: string

  beforeEach(async () => {
    verordnung = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung, datum: '2026-07-10', minuten: 90 })
  })

  it('rechnet Minuten anteilig auf den Stundenpreis', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const r = await lauf({ dryRun: true })
    // 90 Minuten × 30,00 EUR/h = 45,00 EUR
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(4500)
    expect(r.gesamt_cent).toBe(4500)
  })

  it('setzt ohne Preiseintrag KEINEN Ersatzbetrag an', async () => {
    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(0)
    expect(r.warnungen.some(w => /Kein gueltiger Eintrag in leistungspreise/.test(w.text))).toBe(true)
  })

  it('setzt bei nicht verifiziertem Preis KEINEN Betrag an und benennt den Status', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000, status: 'unverified', quelle: 'Beleg fehlt' })

    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(0)
    // Die Meldung JE POSITION — nicht die allgemeine Bestandswarnung
    // („Alle N Leistungspreise …"), die daneben ebenfalls steht.
    const w = r.warnungen.find(x => x.verordnung_id !== undefined && /nicht verifiziert/.test(x.text))
    expect(w).toBeDefined()
    expect(w!.text).toContain('unverified')
    expect(w!.text).toContain('Beleg fehlt')
  })

  it('setzt bei gesperrtem Preis KEINEN Betrag an', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000, status: 'blocked' })
    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(0)
  })

  it('weicht NICHT auf einen Preis aus einem anderen Zeitraum aus', async () => {
    await legePreis({
      org: ORG_A, preisCent: 3000, gueltigAb: '2026-01-01', gueltigBis: '2026-06-30',
    })
    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(0)
  })

  it('nimmt den Preis eines anderen Bundeslands nicht', async () => {
    await legePreis({ org: ORG_A, bundesland: 'bayern', preisCent: 3000 })
    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(0)
    expect(r.warnungen.some(w => /Keine Leistungspreise/.test(w.text))).toBe(true)
  })

  it('nimmt den Preis eines anderen Mandanten nicht', async () => {
    await legePreis({ org: ORG_B, preisCent: 3000 })
    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(0)
  })

  it('waehlt bei mehreren gueltigen Eintraegen den verifizierten', async () => {
    await legePreis({ org: ORG_A, preisCent: 9900, gueltigAb: '2026-05-01', status: 'unverified' })
    await legePreis({ org: ORG_A, preisCent: 3000, gueltigAb: '2026-04-01', status: 'verified' })

    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].betrag_cent).toBe(4500)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Abrechenbarkeit — Unterschrift und Abtretung', () => {
  it('blockiert eine Position ohne Klientenunterschrift', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({
      org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10',
      minuten: 60, unterschrift: null,
    })

    const r = await lauf({ dryRun: true })
    const p = r.gruppen[0].positionen[0]
    expect(p.unterschrieben).toBe(false)
    expect(p.abrechenbar).toBe(false)
    expect(r.positionen_blockiert).toBe(1)
    // Nicht abrechenbare Positionen zaehlen NICHT in die Gruppensumme.
    expect(r.gruppen[0].summe_cent).toBe(0)
    expect(r.gesamt_cent).toBe(0)
  })

  it('erkennt eine digitale Unterschrift aus service_signatures an', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    const einsatz = await legeEinsatz({
      org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10',
      minuten: 60, unterschrift: null,
    })
    await db.query(
      `INSERT INTO public.service_signatures
         (organization_id, service_record_id, signer_role, signer_name,
          signature_image, signed_at)
       VALUES ($1, $2, 'client', 'Erika Mustermann', 'sig', now())`,
      [ORG_A, einsatz] as never[],
    )

    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].unterschrieben).toBe(true)
    expect(r.gruppen[0].positionen[0].abrechenbar).toBe(true)
  })

  it('blockiert eine Position ohne Abtretungserklaerung', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A, abtretung: false })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    const r = await lauf({ dryRun: true })
    expect(r.gruppen[0].positionen[0].abrechenbar).toBe(false)
    expect(r.warnungen.some(w => w.schwere === 'fehler' && /Abtretungserklärung/.test(w.text))).toBe(true)
  })

  it('meldet eine abgelaufene Genehmigung als Fehler', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const v = await legeVerordnung({
      org: ORG_A, klient: KLIENT_A, genehmigungBis: '2026-06-15',
    })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    const r = await lauf({ dryRun: true })
    expect(r.warnungen.some(w => w.schwere === 'fehler' && /abgelaufen/.test(w.text))).toBe(true)
  })

  it('meldet ein fehlendes Aktenzeichen als Warnung', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A, aktenzeichen: null })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    const r = await lauf({ dryRun: true })
    expect(r.warnungen.some(w => /Genehmigungsnummer/.test(w.text))).toBe(true)
    // Fehlt nur das Aktenzeichen, bleibt die Position abrechenbar.
    expect(r.gruppen[0].positionen[0].abrechenbar).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Gruppierung nach Kostentraeger', () => {
  it('fasst gleiche Kostentraeger zusammen und sortiert nach Namen', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })

    const v1 = await legeVerordnung({
      org: ORG_A, klient: KLIENT_A, kostentraegerName: 'Zeta-Kasse', ik: '109999991',
    })
    const v2 = await legeVerordnung({
      org: ORG_A, klient: KLIENT_A2, kostentraegerName: 'Alpha-Kasse', ik: '109999992',
    })
    const v3 = await legeVerordnung({
      org: ORG_A, klient: KLIENT_A2, kostentraegerName: 'Alpha-Kasse', ik: '109999992',
    })

    for (const v of [v1, v2, v3]) {
      await legeEinsatz({
        org: ORG_A, klient: v === v1 ? KLIENT_A : KLIENT_A2,
        verordnung: v, datum: '2026-07-10', minuten: 60,
      })
    }

    const r = await lauf({ dryRun: true })
    expect(r.gruppen.map(g => g.kostentraeger_name)).toEqual(['Alpha-Kasse', 'Zeta-Kasse'])
    expect(r.gruppen[0].positionen).toHaveLength(2)
    expect(r.gruppen[0].summe_cent).toBe(6000)
    expect(r.gruppen[0].ik_nummer).toBe('109999992')
    expect(r.gruppen[1].summe_cent).toBe(3000)
  })

  it('reicht einen Fehler des EDIFACT-Generators als Warnung durch, statt abzubrechen', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    const r = await lauf({
      dryRun: true,
      edifactGenerator: () => { throw new Error('TA1 fehlt') },
    })

    expect(r.gruppen[0].edifact).toBeUndefined()
    expect(r.warnungen.some(w => /EDIFACT-Erzeugung.*TA1 fehlt/.test(w.text))).toBe(true)
  })

  it('haengt die EDIFACT-Nachricht an die Gruppe, wenn der Generator liefert', async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    const r = await lauf({
      dryRun: true,
      edifactGenerator: (g, monat) => `NACHRICHT:${g.kostentraeger_name}:${monat}`,
    })
    expect(r.gruppen[0].edifact).toBe(`NACHRICHT:Testkasse:${MONAT}`)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Abschlusszeilen in monthly_closings', () => {
  beforeEach(async () => {
    await legePreis({ org: ORG_A, preisCent: 3000 })
  })

  it('schreibt im dryRun nichts', async () => {
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    const r = await lauf({ dryRun: true })
    expect(r.closings_geschrieben).toBe(0)
    expect(await zeilen('SELECT 1 FROM public.monthly_closings')).toHaveLength(0)
  })

  /**
   * BEFUND M-1 — Regressionstest.
   *
   * Ohne explizites `organization_id` griff der Spalten-Default
   * `current_org_id()`, der ohne JWT auf die Stamm-Org zurueckfaellt. Die
   * Pruefung auf STAMM_ORG ist deshalb der eigentliche Kern: sie schlaegt
   * an, sobald jemand das Feld wieder weglaesst.
   */
  it('schreibt die Zeile beim RICHTIGEN Mandanten, nicht in der Stamm-Org', async () => {
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    const r = await lauf()
    expect(r.closings_geschrieben).toBe(1)

    const [zeile] = await zeilen<{
      organization_id: string; client_id: string; year: number; month: number
      status: string; ampel: string; total_records: number; total_amount: string
    }>('SELECT * FROM public.monthly_closings')

    expect(zeile.organization_id).toBe(ORG_A)
    expect(zeile.organization_id).not.toBe(STAMM_ORG)
    expect(zeile.client_id).toBe(KLIENT_A)
    expect(zeile.year).toBe(2026)
    expect(zeile.month).toBe(7)
    expect(zeile.status).toBe('ready')
    expect(zeile.ampel).toBe('gruen')
    expect(zeile.total_records).toBe(1)
    expect(Number(zeile.total_amount)).toBeCloseTo(30, 2)
  })

  it('setzt die Ampel auf gelb, sobald eine Position blockiert ist', async () => {
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A, abtretung: false })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    await lauf()
    const [zeile] = await zeilen<{ status: string; ampel: string }>(
      'SELECT status, ampel FROM public.monthly_closings',
    )
    expect(zeile.status).toBe('in_review')
    expect(zeile.ampel).toBe('gelb')
  })

  it('ist wiederholbar — der zweite Lauf ueberschreibt, statt zu verdoppeln', async () => {
    const v = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-10', minuten: 60 })

    await lauf()
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: v, datum: '2026-07-11', minuten: 60 })
    const zweiter = await lauf()

    expect(zweiter.closings_geschrieben).toBe(1)
    const zeilenNachher = await zeilen<{ total_records: number }>(
      'SELECT total_records FROM public.monthly_closings',
    )
    expect(zeilenNachher).toHaveLength(1)
    expect(zeilenNachher[0].total_records).toBe(2)
  })

  it('legt je Klient genau eine Zeile an', async () => {
    for (const klient of [KLIENT_A, KLIENT_A2]) {
      const v = await legeVerordnung({ org: ORG_A, klient })
      await legeEinsatz({ org: ORG_A, klient, verordnung: v, datum: '2026-07-10', minuten: 60 })
    }

    const r = await lauf()
    expect(r.closings_geschrieben).toBe(2)
    const alle = await zeilen<{ client_id: string }>(
      'SELECT client_id FROM public.monthly_closings ORDER BY client_id',
    )
    expect(alle.map(z => z.client_id).sort()).toEqual([KLIENT_A, KLIENT_A2].sort())
  })

  it('trennt die Abschlusszeilen zweier Mandanten', async () => {
    await legePreis({ org: ORG_B, bundesland: 'bayern', preisCent: 3000 })

    const vA = await legeVerordnung({ org: ORG_A, klient: KLIENT_A })
    await legeEinsatz({ org: ORG_A, klient: KLIENT_A, verordnung: vA, datum: '2026-07-10', minuten: 60 })
    const vB = await legeVerordnung({ org: ORG_B, klient: KLIENT_B })
    await legeEinsatz({ org: ORG_B, klient: KLIENT_B, verordnung: vB, datum: '2026-07-10', minuten: 60 })

    await lauf()
    await erstelleMonatsabschluss(MONAT, admin, {
      bundesland: 'bayern', organizationId: ORG_B,
    })

    const verteilung = await zeilen<{ organization_id: string; client_id: string }>(
      'SELECT organization_id, client_id FROM public.monthly_closings ORDER BY organization_id',
    )
    expect(verteilung).toEqual([
      { organization_id: ORG_A, client_id: KLIENT_A },
      { organization_id: ORG_B, client_id: KLIENT_B },
    ])
  })
})
