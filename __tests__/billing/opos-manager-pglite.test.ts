/**
 * Offene-Posten-Verwaltung (OPOS) auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `getOposListe()` ist die Antwort auf „wer schuldet uns wieviel, seit
 * wann". Aus ihr speisen sich die Altersstruktur, die Klientensalden und
 * — mittelbar — die Entscheidung, wen der Mahnlauf anfasst. Ein Fehler
 * hier ist teuer in BEIDE Richtungen: eine zu viel gelistete Rechnung
 * mahnt jemanden, der bezahlt hat; eine zu wenig gelistete verjaehrt
 * still.
 *
 * Gefahren wird gegen PGlite statt gegen eine Attrappe, weil die Auswahl
 * fast vollstaendig aus Datenbank-Semantik besteht: der
 * `NOT IN`-Ausschluss der Endstatus, `deleted_at IS NULL`, der
 * eingebettete Klienten-Join und die Frage, ob `due_date` als `date`
 * oder als Zeichenkette zurueckkommt (siehe pglite-supabase.ts,
 * Abschnitt DATUMSWERTE — genau daran ist der Mahnlauf schon einmal
 * still gescheitert).
 *
 * ZEITBEZUG: alle Faelligkeiten werden relativ zu `heuteBerlin()`
 * gesetzt, nie als festes Datum. Ein Test mit hartem Datum wird still
 * falsch, sobald genug Zeit vergangen ist.
 *
 * BETRAEGE: Testwerte innerhalb der In-Memory-Instanz. Kein Tarif, kein
 * Kassensatz wird behauptet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { getOposListe, getKlientSalden } from '@/lib/billing/opos/opos-manager'
import { heuteBerlin } from '@/lib/utils/timezone'

const ORG_A = 'aaaaaaaa-0000-4000-8000-0000000000f1'
const ORG_B = 'bbbbbbbb-0000-4000-8000-0000000000f1'

const KLIENT_A = 'c1111111-0000-4000-8000-0000000000f1'
const KLIENT_A2 = 'c1111111-0000-4000-8000-0000000000f2'
const KLIENT_B = 'c2222222-0000-4000-8000-0000000000f1'

let db: PGlite
let admin: SupabaseClient

/** Datum vor `tage` Tagen, in derselben Zeitzone wie heuteBerlin(). */
function vorTagen(tage: number): string {
  const heute = new Date(`${heuteBerlin()}T12:00:00Z`)
  heute.setUTCDate(heute.getUTCDate() - tage)
  return heute.toISOString().slice(0, 10)
}

let zaehler = 0
async function legeRechnung(opts: {
  org: string
  klient: string
  nummer: string
  betragEuro: number
  bezahltEuro?: number
  status?: string
  faelligVorTagen?: number | null
  erstelltVorTagen?: number
  dunningLevel?: string
  geloescht?: boolean
}): Promise<string> {
  zaehler++
  const id = `f0000000-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
  const faellig = opts.faelligVorTagen === null ? null : vorTagen(opts.faelligVorTagen ?? 10)
  await db.query(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, paid_amount, status,
        due_date, created_at, dunning_level, deleted_at)
     VALUES ($1, $2, $3, $4, $4, '2026-07-01', '2026-07-31', $5, $6, $7,
             $8, $9, $10, $11)`,
    [
      id, opts.org, opts.klient, opts.nummer,
      opts.betragEuro, opts.bezahltEuro ?? 0, opts.status ?? 'freigegeben',
      faellig,
      `${vorTagen(opts.erstelltVorTagen ?? 20)}T09:00:00Z`,
      opts.dunningLevel ?? 'offen',
      opts.geloescht ? new Date().toISOString() : null,
    ] as never[],
  )
  return id
}

async function leere(): Promise<void> {
  await db.exec('DELETE FROM public.invoices;')
}

beforeAll(async () => {
  db = await baueKettenSchema()
  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active');

    INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name, zip_code) VALUES
      ('${KLIENT_A}',  '${ORG_A}', 'A-0001', 'Erika', 'Mustermann', '60311'),
      ('${KLIENT_A2}', '${ORG_A}', 'A-0002', 'Hans',  'Zweitkunde', '60311'),
      ('${KLIENT_B}',  '${ORG_B}', 'B-0001', 'Berta', 'Fremdorg',   '80331');
  `)
}, 120000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await leere()
})

// ═════════════════════════════════════════════════════════════════════
describe('Was in die Liste gehoert — und was nicht', () => {
  it('listet eine offene Rechnung mit Betrag, Name und Alter', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0001',
      betragEuro: 150.5, faelligVorTagen: 12,
    })

    const { offenePosten, gesamtOffen, gesamtAnzahl } = await getOposListe(admin, ORG_A)

    expect(gesamtAnzahl).toBe(1)
    expect(gesamtOffen).toBe(15050)
    const p = offenePosten[0]
    expect(p.invoiceId).toBe(id)
    expect(p.invoiceNumber).toBe('RE-OPOS-0001')
    expect(p.sollCent).toBe(15050)
    expect(p.bezahltCent).toBe(0)
    expect(p.offenCent).toBe(15050)
    expect(p.status).toBe('offen')
    expect(p.clientName).toBe('Erika Mustermann')
    expect(p.faelligkeitsdatum).toBe(vorTagen(12))
    expect(p.alterTage).toBe(12)
    expect(p.altersKlasse).toBe('0-30')
  })

  it('weist eine teilbezahlte Rechnung mit dem Restbetrag aus', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0002',
      betragEuro: 200, bezahltEuro: 75.5, status: 'teilweise_bezahlt',
    })

    const { offenePosten } = await getOposListe(admin, ORG_A)
    expect(offenePosten).toHaveLength(1)
    expect(offenePosten[0].offenCent).toBe(12450)
    expect(offenePosten[0].status).toBe('teilweise_bezahlt')
  })

  it('laesst die Endstatus aussen vor', async () => {
    for (const [i, status] of ['storniert', 'akzeptiert', 'abgeschrieben', 'bezahlt'].entries()) {
      await legeRechnung({
        org: ORG_A, klient: KLIENT_A, nummer: `RE-OPOS-01${i}`,
        betragEuro: 100, status,
      })
    }
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0199', betragEuro: 100,
    })

    const { offenePosten } = await getOposListe(admin, ORG_A)
    expect(offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-OPOS-0199'])
  })

  it('laesst eine ausgeglichene Rechnung aussen vor, auch ohne Statuswechsel', async () => {
    // Zahlungseingang gebucht, Statuslauf noch nicht durch — die Rechnung
    // ist trotzdem keine Forderung mehr.
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0003',
      betragEuro: 100, bezahltEuro: 100, status: 'teilweise_bezahlt',
    })

    const { offenePosten, gesamtAnzahl } = await getOposListe(admin, ORG_A)
    expect(offenePosten).toHaveLength(0)
    expect(gesamtAnzahl).toBe(0)
  })

  it('laesst soft-geloeschte Rechnungen aussen vor', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0004',
      betragEuro: 100, geloescht: true,
    })

    expect((await getOposListe(admin, ORG_A)).offenePosten).toHaveLength(0)
  })

  /**
   * FESTGEHALTEN, NICHT GEAENDERT.
   *
   * Der Ausschluss nennt nur die Endstatus. Ein ENTWURF ist damit Teil der
   * Offene-Posten-Liste und der Altersstruktur — obwohl er weder
   * festgeschrieben noch versandt ist und damit fachlich keine Forderung
   * darstellt. Wer die Altersstruktur als Forderungsbestand liest,
   * ueberschaetzt ihn um die Summe aller Entwuerfe.
   *
   * Der Mahnlauf ist davon NICHT betroffen: er waehlt selbst
   * (lib/billing/core/dunning.ts) und faehrt nicht ueber diese Liste. Die
   * Frage, ob Entwuerfe hier sichtbar bleiben sollen, ist deshalb eine
   * fachliche Entscheidung und keine, die dieser Test einseitig trifft —
   * er haelt nur fest, was heute gilt, damit eine Aenderung auffaellt.
   */
  it('nimmt Entwuerfe heute MIT in die Liste auf (Ist-Zustand)', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-ENTWURF',
      betragEuro: 100, status: 'entwurf',
    })

    const { offenePosten, gesamtOffen } = await getOposListe(admin, ORG_A)
    expect(offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-OPOS-ENTWURF'])
    expect(gesamtOffen).toBe(10000)
  })

  it('zeigt keine Rechnung eines anderen Mandanten', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-A-0001', betragEuro: 100,
    })
    await legeRechnung({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-0001', betragEuro: 999,
    })

    const a = await getOposListe(admin, ORG_A)
    const b = await getOposListe(admin, ORG_B)
    expect(a.offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-A-0001'])
    expect(b.offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-B-0001'])
    expect(a.gesamtOffen).toBe(10000)
    expect(b.gesamtOffen).toBe(99900)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Alter und Altersstruktur', () => {
  it('rechnet ab der Faelligkeit, nicht ab dem Rechnungsdatum', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0201',
      betragEuro: 100, erstelltVorTagen: 90, faelligVorTagen: 5,
    })

    const { offenePosten } = await getOposListe(admin, ORG_A)
    expect(offenePosten[0].alterTage).toBe(5)
    expect(offenePosten[0].altersKlasse).toBe('0-30')
  })

  it('faellt ohne Faelligkeit auf das Rechnungsdatum zurueck', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0202',
      betragEuro: 100, erstelltVorTagen: 40, faelligVorTagen: null,
    })

    const { offenePosten } = await getOposListe(admin, ORG_A)
    expect(offenePosten[0].faelligkeitsdatum).toBeNull()
    expect(offenePosten[0].alterTage).toBe(40)
    expect(offenePosten[0].altersKlasse).toBe('30-60')
  })

  it('meldet ein noch nicht faelliges Papier mit Alter 0, nicht negativ', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-OPOS-0203',
      betragEuro: 100, faelligVorTagen: -14, // faellig in 14 Tagen
    })

    const { offenePosten } = await getOposListe(admin, ORG_A)
    expect(offenePosten[0].alterTage).toBe(0)
    expect(offenePosten[0].altersKlasse).toBe('0-30')
  })

  it('trennt die vier Altersklassen an den richtigen Grenzen', async () => {
    const faelle: Array<[number, string]> = [
      [29, '0-30'], [30, '30-60'], [59, '30-60'],
      [60, '60-90'], [89, '60-90'], [90, '90+'], [200, '90+'],
    ]
    for (const [tage] of faelle) {
      await legeRechnung({
        org: ORG_A, klient: KLIENT_A, nummer: `RE-ALT-${tage}`,
        betragEuro: 10, faelligVorTagen: tage, erstelltVorTagen: tage + 14,
      })
    }

    const { offenePosten, altersstruktur } = await getOposListe(admin, ORG_A)

    for (const [tage, klasse] of faelle) {
      const p = offenePosten.find(x => x.invoiceNumber === `RE-ALT-${tage}`)
      expect(p, `RE-ALT-${tage}`).toBeDefined()
      expect(p!.altersKlasse, `RE-ALT-${tage}`).toBe(klasse)
    }

    expect(altersstruktur.klasse0_30).toEqual({ anzahl: 1, summe: 1000 })
    expect(altersstruktur.klasse30_60).toEqual({ anzahl: 2, summe: 2000 })
    expect(altersstruktur.klasse60_90).toEqual({ anzahl: 2, summe: 2000 })
    expect(altersstruktur.klasse90plus).toEqual({ anzahl: 2, summe: 2000 })
  })

  it('sortiert die aelteste Forderung nach oben', async () => {
    for (const tage of [5, 120, 45]) {
      await legeRechnung({
        org: ORG_A, klient: KLIENT_A, nummer: `RE-SORT-${tage}`,
        betragEuro: 10, faelligVorTagen: tage, erstelltVorTagen: tage + 14,
      })
    }

    const { offenePosten } = await getOposListe(admin, ORG_A)
    expect(offenePosten.map(p => p.invoiceNumber)).toEqual([
      'RE-SORT-120', 'RE-SORT-45', 'RE-SORT-5',
    ])
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Filter', () => {
  beforeEach(async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-F-OFFEN',
      betragEuro: 100, faelligVorTagen: 10,
    })
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A2, nummer: 'RE-F-TEIL',
      betragEuro: 100, bezahltEuro: 40, status: 'teilweise_bezahlt',
      faelligVorTagen: 70, erstelltVorTagen: 84,
    })
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A2, nummer: 'RE-F-GEMAHNT',
      betragEuro: 100, faelligVorTagen: 100, erstelltVorTagen: 114,
      dunningLevel: 'mahnung_1',
    })
  })

  it('filtert auf vollstaendig offene Posten', async () => {
    const { offenePosten } = await getOposListe(admin, ORG_A, { status: 'offen' })
    expect(offenePosten.map(p => p.invoiceNumber).sort())
      .toEqual(['RE-F-GEMAHNT', 'RE-F-OFFEN'])
  })

  it('filtert auf teilbezahlte Posten', async () => {
    const { offenePosten } = await getOposListe(admin, ORG_A, { status: 'teilweise_bezahlt' })
    expect(offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-F-TEIL'])
  })

  it('filtert auf einen Klienten', async () => {
    const { offenePosten } = await getOposListe(admin, ORG_A, { clientId: KLIENT_A })
    expect(offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-F-OFFEN'])
  })

  it('filtert auf eine Mahnstufe', async () => {
    const { offenePosten } = await getOposListe(admin, ORG_A, { dunningLevel: 'mahnung_1' })
    expect(offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-F-GEMAHNT'])
  })

  it('filtert auf ein Altersfenster', async () => {
    const { offenePosten } = await getOposListe(admin, ORG_A, {
      minAlterTage: 60, maxAlterTage: 90,
    })
    expect(offenePosten.map(p => p.invoiceNumber)).toEqual(['RE-F-TEIL'])
  })

  it('rechnet Summe und Altersstruktur NUR ueber die gefilterte Menge', async () => {
    const { gesamtOffen, gesamtAnzahl, altersstruktur } =
      await getOposListe(admin, ORG_A, { clientId: KLIENT_A })
    expect(gesamtAnzahl).toBe(1)
    expect(gesamtOffen).toBe(10000)
    expect(altersstruktur.klasse90plus.anzahl).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Klientensalden', () => {
  it('fasst je Klient zusammen und nennt die aelteste Faelligkeit', async () => {
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-S-0001',
      betragEuro: 100, faelligVorTagen: 10,
    })
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-S-0002',
      betragEuro: 50, faelligVorTagen: 95, erstelltVorTagen: 109,
    })
    await legeRechnung({
      org: ORG_A, klient: KLIENT_A2, nummer: 'RE-S-0003',
      betragEuro: 400, faelligVorTagen: 20,
    })

    const salden = await getKlientSalden(admin, ORG_A)

    // Groesster Saldo zuerst.
    expect(salden.map(s => s.clientId)).toEqual([KLIENT_A2, KLIENT_A])

    const a = salden.find(s => s.clientId === KLIENT_A)!
    expect(a.offenGesamt).toBe(15000)
    expect(a.rechnungenOffen).toBe(2)
    expect(a.aeltesteFaelligkeit).toBe(vorTagen(95))
    expect(a.clientName).toBe('Erika Mustermann')
  })

  it('liefert eine leere Liste, wenn nichts offen ist', async () => {
    expect(await getKlientSalden(admin, ORG_A)).toEqual([])
  })
})
