/**
 * Tarif-Import auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `importTariffs()` ist der einzige Weg, auf dem Verguetungssaetze in
 * `billing_tariffs` gelangen — und `billing_tariffs` ist laut
 * Modulkopf von lib/abrechnung/monatsabschluss.ts die VERBINDLICHE
 * Preisquelle fuer echte Rechnungen. Was hier hineinkommt, steht spaeter
 * auf einer Rechnung.
 *
 * Der Import war ungeprueft. Gefahren wird gegen PGlite, weil die Haelfte
 * der Absicherung in der Datenbank liegt: die Fremdschluessel auf die
 * kontrollierten Kataloge, `positive_price`, `valid_period`, der
 * CHECK auf `verguetungsart` — und der Default `tarif_status =
 * 'unverified'`, an dem die Fail-Closed-Sperre des Rechnungswegs haengt.
 *
 * ── EINE GRENZE, DIE BENANNT GEHOERT ───────────────────────────────────
 * Der Ueberschneidungs-Constraint `no_overlapping_tariffs` ist live ein
 * EXCLUDE USING gist und braucht btree_gist. Die Erweiterung gibt es in
 * PGlite nicht. Der Schemaaufbau setzt an seine Stelle einen
 * Stellvertreter-Trigger (siehe baueTarifStammdaten). Geprueft wird
 * damit die REAKTION der Anwendung auf eine abgewiesene Ueberschneidung
 * — NICHT, ob der echte Constraint richtig greift.
 *
 * PREISE: alle `preis_cent`-Werte sind Testwerte innerhalb der
 * In-Memory-Instanz. Kein Verguetungssatz und kein Kassentarif wird
 * behauptet — der Test prueft die Eingangspruefung, nicht die Hoehe.
 * Die IK-Nummern sind konstruiert und nur auf ihre Pruefziffer hin
 * gewaehlt.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueTarifStammdaten } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { importTariffs, type TariffImportRow } from '@/lib/billing/core/tariff-import'

const ORG_A = 'aaaaaaaa-0000-4000-8000-0000000071a1'
const ORG_B = 'bbbbbbbb-0000-4000-8000-0000000071a1'
const ADMIN_A = '11111111-0000-4000-8000-0000000071a1'

/**
 * IK mit gueltiger Pruefziffer nach §293 SGB V.
 * 460629986 ist die IK der Stamm-Organisation aus dem Repo — sie wird
 * hier ausschliesslich als pruefziffer-gueltiges Muster verwendet.
 */
const IK_GUELTIG = '460629986'
/** Dieselbe Nummer mit verdrehter letzter Stelle — muss abgewiesen werden. */
const IK_UNGUELTIG = '460629985'

let db: PGlite
let admin: SupabaseClient

async function zeilen<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query<T>(sql)
  return r.rows
}

async function zaehle(bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.billing_tariffs WHERE ${bedingung}`,
  )
  return r.rows[0]?.n ?? 0
}

/** Vollstaendige, gueltige Zeile — Abweichungen je Test per Overlay. */
function zeile(ueber: Partial<TariffImportRow> = {}): TariffImportRow {
  return {
    bundesland: 'hessen',
    kostentraeger_ik: null,
    leistungsart: 'alltagsbegleitung',
    rechtsgrundlage: 'privat',
    bezeichnung: 'Alltagsbegleitung (Privatzahler)',
    preis_cent: 3000,
    einheit: 'stunde',
    verguetungsart: 'zeit_stunde',
    gueltig_ab: '2026-01-01',
    gueltig_bis: null,
    tarifquelle: 'PRIVATE_PREISLISTE',
    quellen_referenz: 'Interne Preisliste 2026, Ziffer 1',
    ...ueber,
  }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueTarifStammdaten(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN_A}', 'admin-a@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active');
  `)
}, 120000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM public.billing_tariffs;')
})

// ═════════════════════════════════════════════════════════════════════
describe('Der gute Fall', () => {
  it('importiert eine vollstaendige Zeile mit allen Feldern', async () => {
    const r = await importTariffs(admin, ORG_A, [zeile()], ADMIN_A)

    // warnungen (T-9, gesetzliche Obergrenze) gehoert seit der PfluV-Pruefung
    // zum Rueckgabewert. Leer, weil die Testzeile keine Obergrenze reisst —
    // dass das Feld ueberhaupt kommt, ist Teil der Zusage an die Aufrufer.
    expect(r).toEqual({ imported: 1, skipped: 0, errors: [], warnungen: [] })

    const [t] = await zeilen<{
      organization_id: string; bundesland: string; leistungsart: string
      rechtsgrundlage: string; preis_cent: number; einheit: string
      verguetungsart: string; gueltig_ab: string; gueltig_bis: string | null
      tarifquelle: string; vertrag_referenz: string; created_by: string
      tarif_status: string; ist_aktiv: boolean
    }>('SELECT * FROM public.billing_tariffs')

    expect(t.organization_id).toBe(ORG_A)
    expect(t.leistungsart).toBe('alltagsbegleitung')
    expect(t.rechtsgrundlage).toBe('privat')
    expect(t.preis_cent).toBe(3000)
    expect(t.einheit).toBe('stunde')
    expect(t.verguetungsart).toBe('zeit_stunde')
    expect(t.tarifquelle).toBe('PRIVATE_PREISLISTE')
    expect(t.vertrag_referenz).toBe('Interne Preisliste 2026, Ziffer 1')
    expect(t.created_by).toBe(ADMIN_A)
  })

  /**
   * Der wichtigste Einzelpunkt dieser Suite: ein frisch importierter
   * Tarif ist NICHT freigegeben. Der Rechnungsweg blockiert auf
   * `tarif_status <> 'verified'` (20260831040000). Wuerde der Import
   * hier 'verified' setzen, waere die gesamte Belegpflicht umgangen —
   * ein importierter Preis koennte sofort abgerechnet werden, ohne dass
   * ihn jemand gegen das Originaldokument geprueft hat.
   */
  it('legt Tarife als NICHT verifiziert an', async () => {
    await importTariffs(admin, ORG_A, [zeile()], ADMIN_A)
    const [t] = await zeilen<{ tarif_status: string }>(
      'SELECT tarif_status FROM public.billing_tariffs',
    )
    expect(t.tarif_status).toBe('unverified')
  })

  it('uebernimmt Zuschlagssaetze und Qualifikation', async () => {
    await importTariffs(admin, ORG_A, [zeile({
      qualifikation: 'Betreuungskraft §43b',
      zuschlag_wochenende_prozent: 25,
      zuschlag_feiertag_prozent: 50,
      zuschlag_nacht_prozent: 15,
    })], ADMIN_A)

    const [t] = await zeilen<{
      qualifikation: string; zuschlag_wochenende_prozent: string
      zuschlag_feiertag_prozent: string; zuschlag_nacht_prozent: string
    }>('SELECT * FROM public.billing_tariffs')

    expect(t.qualifikation).toBe('Betreuungskraft §43b')
    expect(Number(t.zuschlag_wochenende_prozent)).toBe(25)
    expect(Number(t.zuschlag_feiertag_prozent)).toBe(50)
    expect(Number(t.zuschlag_nacht_prozent)).toBe(15)
  })

  it('setzt Zuschlaege ohne Angabe auf 0, nicht auf NULL', async () => {
    await importTariffs(admin, ORG_A, [zeile()], ADMIN_A)
    const [t] = await zeilen<{ zuschlag_nacht_prozent: string | null }>(
      'SELECT zuschlag_nacht_prozent FROM public.billing_tariffs',
    )
    expect(Number(t.zuschlag_nacht_prozent)).toBe(0)
  })

  it('trennt die Tarife zweier Mandanten', async () => {
    await importTariffs(admin, ORG_A, [zeile()], ADMIN_A)
    await importTariffs(admin, ORG_B, [zeile({ bundesland: 'bayern' })], ADMIN_A)

    expect(await zaehle(`organization_id = '${ORG_A}'`)).toBe(1)
    expect(await zaehle(`organization_id = '${ORG_B}'`)).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Eingangspruefung — alles oder nichts', () => {
  /**
   * Der Import validiert ALLE Zeilen, BEVOR er die erste schreibt. Eine
   * halb importierte Preisliste waere schlimmer als gar keine: niemand
   * saehe, welche Haelfte fehlt.
   */
  it('schreibt keine einzige Zeile, wenn eine Zeile fehlerhaft ist', async () => {
    const r = await importTariffs(admin, ORG_A, [
      zeile(),
      zeile({ preis_cent: -1, leistungsart: 'hauswirtschaft' }),
      zeile({ leistungsart: 'begleitservice' }),
    ], ADMIN_A)

    expect(r.imported).toBe(0)
    expect(r.skipped).toBe(3)
    expect(await zaehle()).toBe(0)
  })

  it('benennt Zeilennummer und Feld je Fehler', async () => {
    const r = await importTariffs(admin, ORG_A, [
      zeile(),
      zeile({ einheit: 'lichtjahr' }),
    ], ADMIN_A)

    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].row).toBe(2)
    expect(r.errors[0].field).toBe('einheit')
    expect(r.errors[0].message).toContain('lichtjahr')
  })

  const pflichtfelder: Array<[string, Partial<TariffImportRow>]> = [
    ['bundesland', { bundesland: '   ' }],
    ['leistungsart', { leistungsart: '' }],
    ['rechtsgrundlage', { rechtsgrundlage: '' }],
    ['tarifquelle', { tarifquelle: '' }],
    ['quellen_referenz', { quellen_referenz: '  ' }],
  ]
  for (const [feld, ueber] of pflichtfelder) {
    it(`weist eine Zeile ohne ${feld} ab`, async () => {
      const r = await importTariffs(admin, ORG_A, [zeile(ueber)], ADMIN_A)
      expect(r.imported).toBe(0)
      expect(r.errors.some(e => e.field === feld)).toBe(true)
    })
  }

  const preisFaelle: Array<[string, unknown]> = [
    ['negativ', -1],
    ['gebrochen', 30.5],
    ['keine Zahl', '3000'],
  ]
  for (const [was, wert] of preisFaelle) {
    it(`weist einen Preis ab, der ${was} ist`, async () => {
      const r = await importTariffs(
        admin, ORG_A,
        [zeile({ preis_cent: wert as number })], ADMIN_A,
      )
      expect(r.imported).toBe(0)
      expect(r.errors.some(e => e.field === 'preis_cent')).toBe(true)
    })
  }

  it('laesst den Preis 0 zu (unentgeltliche Leistung)', async () => {
    const r = await importTariffs(admin, ORG_A, [zeile({ preis_cent: 0 })], ADMIN_A)
    expect(r.imported).toBe(1)
  })

  it('weist eine unbekannte Verguetungsart ab', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile({ verguetungsart: 'nach_gefuehl' })], ADMIN_A,
    )
    expect(r.errors.some(e => e.field === 'verguetungsart')).toBe(true)
  })

  it('weist ein falsches Datumsformat ab', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile({ gueltig_ab: '01.01.2026' })], ADMIN_A,
    )
    expect(r.errors.some(e => e.field === 'gueltig_ab')).toBe(true)
  })

  it('weist ein Ende vor dem Beginn ab', async () => {
    const r = await importTariffs(
      admin, ORG_A,
      [zeile({ gueltig_ab: '2026-06-01', gueltig_bis: '2026-01-31' })], ADMIN_A,
    )
    expect(r.errors.some(e => e.field === 'gueltig_bis')).toBe(true)
    expect(await zaehle()).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('IK-Pruefziffer (§293 SGB V)', () => {
  it('nimmt eine IK mit gueltiger Pruefziffer an', async () => {
    const r = await importTariffs(admin, ORG_A, [zeile({
      kostentraeger_ik: IK_GUELTIG,
      rechtsgrundlage: '§45b SGB XI',
      tarifquelle: 'VERGUETUNGSVEREINBARUNG',
      quellen_referenz: 'Vereinbarung 2026/AZ-77',
    })], ADMIN_A)
    expect(r.imported).toBe(1)
  })

  it('weist eine IK mit falscher Pruefziffer ab', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile({ kostentraeger_ik: IK_UNGUELTIG })], ADMIN_A,
    )
    expect(r.errors.some(e => e.field === 'kostentraeger_ik')).toBe(true)
    expect(await zaehle()).toBe(0)
  })

  it('weist eine IK mit falscher Laenge ab', async () => {
    for (const ik of ['12345', '4606299860']) {
      const r = await importTariffs(admin, ORG_A, [zeile({ kostentraeger_ik: ik })], ADMIN_A)
      expect(r.errors.some(e => e.field === 'kostentraeger_ik'), ik).toBe(true)
    }
  })

  it('laesst eine leere IK zu (Privatzahler ohne Kostentraeger)', async () => {
    const r = await importTariffs(admin, ORG_A, [zeile({ kostentraeger_ik: null })], ADMIN_A)
    expect(r.imported).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Kontrollierte Kataloge', () => {
  it('weist eine unbekannte Leistungsart ab, bevor sie den Fremdschluessel erreicht', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile({ leistungsart: 'gedankenlesen' })], ADMIN_A,
    )
    expect(r.imported).toBe(0)
    expect(r.errors.some(e =>
      e.field === 'leistungsart' && /Unbekannte Leistungsart/.test(e.message))).toBe(true)
    expect(await zaehle()).toBe(0)
  })

  it('weist eine unbekannte Rechtsgrundlage ab', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile({ rechtsgrundlage: '§999 SGB XI' })], ADMIN_A,
    )
    expect(r.errors.some(e => /Unbekannte Rechtsgrundlage/.test(e.message))).toBe(true)
  })

  it('weist eine unbekannte Tarifquelle ab', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile({ tarifquelle: 'HOERENSAGEN' })], ADMIN_A,
    )
    expect(r.errors.some(e => /Unbekannte Tarifquelle/.test(e.message))).toBe(true)
  })

  it('sammelt mehrere Katalogfehler derselben Zeile', async () => {
    const r = await importTariffs(admin, ORG_A, [zeile({
      leistungsart: 'gedankenlesen',
      rechtsgrundlage: '§999 SGB XI',
      tarifquelle: 'HOERENSAGEN',
    })], ADMIN_A)
    expect(r.errors).toHaveLength(3)
    expect(r.errors.every(e => e.row === 1)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Probelauf', () => {
  it('prueft alles, schreibt aber nichts', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile(), zeile({ leistungsart: 'hauswirtschaft' })],
      ADMIN_A, { dryRun: true },
    )
    expect(r.imported).toBe(0)
    expect(r.skipped).toBe(2)
    expect(r.errors).toEqual([])
    expect(await zaehle()).toBe(0)
  })

  it('meldet die Fehler eines Probelaufs genauso wie ein echter Lauf', async () => {
    const r = await importTariffs(
      admin, ORG_A, [zeile({ leistungsart: 'gedankenlesen' })],
      ADMIN_A, { dryRun: true },
    )
    expect(r.errors).toHaveLength(1)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Zeitliche Ueberschneidung', () => {
  /**
   * ACHTUNG: hier greift der STELLVERTRETER-Trigger, nicht der echte
   * EXCLUDE-Constraint (btree_gist fehlt in PGlite, siehe Dateikopf).
   * Bewiesen wird ausschliesslich, dass die Anwendung eine abgewiesene
   * Ueberschneidung als benannten Zeilenfehler meldet, statt sie
   * durchzulassen oder mit einer rohen Datenbankmeldung abzubrechen.
   */
  it('meldet eine Ueberschneidung als Zeilenfehler und importiert sie nicht', async () => {
    await importTariffs(admin, ORG_A, [zeile({
      gueltig_ab: '2026-01-01', gueltig_bis: '2026-12-31',
    })], ADMIN_A)

    const r = await importTariffs(admin, ORG_A, [zeile({
      gueltig_ab: '2026-06-01', gueltig_bis: '2027-05-31', preis_cent: 3200,
    })], ADMIN_A)

    expect(r.imported).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.errors[0].field).toBe('gueltig_ab')
    expect(r.errors[0].message).toMatch(/Ueberschneidung/)
    expect(await zaehle()).toBe(1)
  })

  it('laesst einen luecklos anschliessenden Folgezeitraum zu', async () => {
    await importTariffs(admin, ORG_A, [zeile({
      gueltig_ab: '2026-01-01', gueltig_bis: '2026-06-30',
    })], ADMIN_A)

    const r = await importTariffs(admin, ORG_A, [zeile({
      gueltig_ab: '2026-07-01', gueltig_bis: '2026-12-31', preis_cent: 3200,
    })], ADMIN_A)

    expect(r.imported).toBe(1)
    expect(await zaehle()).toBe(2)
  })

  it('sieht denselben Zeitraum bei einem anderen Mandanten nicht als Konflikt', async () => {
    await importTariffs(admin, ORG_A, [zeile()], ADMIN_A)
    const r = await importTariffs(admin, ORG_B, [zeile()], ADMIN_A)
    expect(r.imported).toBe(1)
  })

  it('importiert die uebrigen Zeilen weiter, wenn eine kollidiert', async () => {
    await importTariffs(admin, ORG_A, [zeile()], ADMIN_A)

    const r = await importTariffs(admin, ORG_A, [
      zeile({ preis_cent: 3200 }),                       // kollidiert
      zeile({ leistungsart: 'hauswirtschaft' }),         // frei
    ], ADMIN_A)

    expect(r.imported).toBe(1)
    expect(r.skipped).toBe(1)
    expect(await zaehle()).toBe(2)
  })
})
