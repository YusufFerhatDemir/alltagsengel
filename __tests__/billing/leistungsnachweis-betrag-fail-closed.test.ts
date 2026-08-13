/**
 * Leistungsnachweis — Betragssperre bei nicht verifiziertem Kassentarif (P0)
 *
 * HINTERGRUND
 * Der Leistungsnachweis nannte bisher eine Eurosumme, die er direkt aus
 * `service_records.amount` aufaddiert hat. Diese Beträge stammen aus
 * `service_pricing` — einer dritten Preistabelle OHNE Spalte `tarif_status`,
 * die von der Tarif-Verifizierung (20260831040000/050000) nicht erfasst ist.
 *
 * Damit lief am Fail-Closed vorbei, was Rechnung, Korrektur und RPC längst
 * blockieren: der Nachweis ist ein Kassendokument (Pflegekasse, Genehmigungs-
 * nummer, §45a/§45b/§39 SGB XI als Grundlage) und trug einen Betrag, dem live
 * ein `blocked`-Tarif zugrunde liegt. Genau dieses Blatt reicht die versicherte
 * Person bei der Kostenerstattung ein.
 *
 * Diese Suite hält fest, dass:
 *   1. ein `blocked`-Tarif die Summe sperrt,
 *   2. ein `unverified`-Tarif sie ebenso sperrt,
 *   3. eine fehlende Tarifzeile sperrt (kein stiller Durchlass),
 *   4. ein Lesefehler sperrt (fail-closed statt fail-open),
 *   5. ein gesperrter Tarif NEBEN einem verifizierten ebenfalls sperrt —
 *      der Nachweis wählt keinen Tarif aus, er kann die Summe also nicht
 *      dem verifizierten zuordnen,
 *   6. ein abgelaufener Tarif nicht mehr deckt,
 *   7. Privattarife die Kassenprüfung nicht erfüllen,
 *   8. der verifizierte Fall durchgeht,
 *   9. das erzeugte HTML den Betrag tatsächlich weglässt — nicht nur das
 *      Flag im Datenmodell (Lektion aus dem Tarif-Fail-Closed-Bypass:
 *      die Sperre muss dort greifen, wo das Blatt entsteht).
 *
 * Testdaten: synthetisch.
 */

import { describe, it, expect } from 'vitest'
import {
  pruefeBetragsfreigabe,
  buildLeistungsnachweisHtml,
  LEISTUNGSERBRINGER,
  type LeistungsnachweisData,
} from '@/lib/abrechnung/leistungsnachweis-pdf'

const ORG = '00000000-0000-4000-8000-000460629986'
const STICHTAG = '2026-08-31'

type TarifZeile = {
  leistungsart: string
  tarif_status: string | null
  rechtsgrundlage: string
  gueltig_bis: string | null
}

/**
 * Minimaler PostgREST-Doppelgänger: sammelt die Filter, die
 * pruefeBetragsfreigabe() anlegt, und liefert am Ende die Zeilen.
 * Die Kettenglieder geben `this` zurück, `is()` schliesst die Kette ab.
 */
function fakeSupabase(zeilen: TarifZeile[], fehler?: string) {
  const filter: Record<string, unknown> = {}
  const kette: any = {
    select: () => kette,
    eq: (spalte: string, wert: unknown) => { filter[spalte] = wert; return kette },
    in: (spalte: string, werte: unknown[]) => { filter[`in:${spalte}`] = werte; return kette },
    neq: (spalte: string, wert: unknown) => { filter[`neq:${spalte}`] = wert; return kette },
    lte: (spalte: string, wert: unknown) => { filter[`lte:${spalte}`] = wert; return kette },
    is: () =>
      Promise.resolve(
        fehler
          ? { data: null, error: { message: fehler } }
          : { data: zeilen, error: null },
      ),
  }
  return {
    filter,
    client: { from: () => kette } as any,
  }
}

function tarif(over: Partial<TarifZeile> = {}): TarifZeile {
  return {
    leistungsart: 'alltagsbegleitung',
    tarif_status: 'verified',
    rechtsgrundlage: '§45b SGB XI',
    gueltig_bis: null,
    ...over,
  }
}

describe('pruefeBetragsfreigabe — Fail-Closed', () => {
  it('sperrt bei blocked-Tarif (Live-Fall: §45b 35 EUR/h)', async () => {
    const { client } = fakeSupabase([tarif({ tarif_status: 'blocked' })])
    const p = await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
    expect(p.grund).toContain('alltagsbegleitung')
    expect(p.grund).toContain('blocked')
  })

  it('sperrt bei unverified-Tarif (Live-Fall: §39 SGB XI)', async () => {
    const { client } = fakeSupabase([tarif({ tarif_status: 'unverified', rechtsgrundlage: '§39 SGB XI' })])
    const p = await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
    expect(p.grund).toContain('unverified')
  })

  it('behandelt fehlenden Status wie unverified', async () => {
    const { client } = fakeSupabase([tarif({ tarif_status: null })])
    const p = await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
  })

  it('sperrt, wenn zur Leistungsart gar kein Kassentarif existiert', async () => {
    const { client } = fakeSupabase([])
    const p = await pruefeBetragsfreigabe(client, ORG, ['nachtbetreuung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
    expect(p.grund).toContain('kein Kassentarif hinterlegt')
  })

  it('sperrt bei Lesefehler — kein fail-open', async () => {
    const { client } = fakeSupabase([], 'permission denied for table billing_tariffs')
    const p = await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
    expect(p.grund).toContain('nicht geprüft werden')
  })

  it('sperrt ohne Organisation', async () => {
    const { client } = fakeSupabase([tarif()])
    const p = await pruefeBetragsfreigabe(client, null, ['alltagsbegleitung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
  })

  it('sperrt, wenn neben dem verifizierten Tarif ein gesperrter steht', async () => {
    const { client } = fakeSupabase([
      tarif({ tarif_status: 'verified' }),
      tarif({ tarif_status: 'blocked', rechtsgrundlage: '§39 SGB XI' }),
    ])
    const p = await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
  })

  it('lässt abgelaufene Tarife nicht als Deckung gelten', async () => {
    const { client } = fakeSupabase([tarif({ gueltig_bis: '2026-07-31' })])
    const p = await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung'], STICHTAG)
    expect(p.freigegeben).toBe(false)
    expect(p.grund).toContain('kein Kassentarif hinterlegt')
  })

  it('filtert Privattarife aus der Kassenprüfung heraus', async () => {
    const { client, filter } = fakeSupabase([tarif()])
    await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung'], STICHTAG)
    expect(filter['neq:rechtsgrundlage']).toBe('privat')
    expect(filter['organization_id']).toBe(ORG)
    expect(filter['lte:gueltig_ab']).toBe(STICHTAG)
  })

  it('gibt frei, wenn jede Leistungsart einen verifizierten Kassentarif hat', async () => {
    const { client } = fakeSupabase([
      tarif({ leistungsart: 'alltagsbegleitung' }),
      tarif({ leistungsart: 'hauswirtschaft' }),
    ])
    const p = await pruefeBetragsfreigabe(client, ORG, ['alltagsbegleitung', 'hauswirtschaft'], STICHTAG)
    expect(p.freigegeben).toBe(true)
    expect(p.grund).toBeNull()
  })

  it('gibt frei, wenn es gar keine Einsätze gibt (nichts zu decken)', async () => {
    const { client } = fakeSupabase([])
    const p = await pruefeBetragsfreigabe(client, ORG, [], STICHTAG)
    expect(p.freigegeben).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────
// Das Blatt selbst — die Sperre muss im HTML ankommen
// ───────────────────────────────────────────────────────────────

function nachweis(over: Partial<LeistungsnachweisData> = {}): LeistungsnachweisData {
  return {
    monat: '2026-08',
    monat_label: 'August 2026',
    erstellt_am: '31.08.2026',
    leistungserbringer_ik: '460629986',
    leistungserbringer: { ...LEISTUNGSERBRINGER },
    verordnung: {
      id: 'v-1',
      typ: 'entlastung',
      genehmigungsnummer: 'AZ-4711',
      genehmigt_bis: '2026-12-31',
      kostentraeger_name: 'Musterkasse',
      kostentraeger_ik: '999999999',
      leistungsart: 'alltagsbegleitung',
    },
    klient: {
      name: 'Erika Muster',
      geburtsdatum: '1940-01-01',
      versichertennummer: 'A123456789',
      pflegekasse: 'Musterkasse',
      pflegekasse_ik: '999999999',
      pflegegrad: '2',
      anschrift: 'Musterweg 1, 60311 Frankfurt am Main',
    },
    pflegekraefte: [],
    einsaetze: [
      {
        datum: '2026-08-03',
        von: '09:00',
        bis: '11:00',
        dauer_minuten: 120,
        leistungsart: 'alltagsbegleitung',
        betrag_euro: 70,
        handzeichen_pflegekraft: 'AB',
        handzeichen_klient: true,
      },
    ],
    summe: { anzahl: 1, minuten: 120, betrag_euro: 70 },
    betraege_freigegeben: true,
    betrag_sperrgrund: null,
    warnungen: [],
    ...over,
  }
}

describe('buildLeistungsnachweisHtml — Betrag nur bei Freigabe', () => {
  it('druckt die Summe, wenn die Tarife verifiziert sind', () => {
    const html = buildLeistungsnachweisHtml(nachweis())
    expect(html).toContain('70,00')
    expect(html).not.toContain('Ohne Betragsangabe')
  })

  it('lässt die Summe weg, wenn die Freigabe fehlt', () => {
    const html = buildLeistungsnachweisHtml(
      nachweis({ betraege_freigegeben: false, betrag_sperrgrund: 'blocked' }),
    )
    expect(html).not.toContain('70,00')
    expect(html).toContain('Ohne Betragsangabe')
  })

  it('druckt Einsatz, Zeiten und Handzeichen auch ohne Betragsfreigabe weiter', () => {
    const html = buildLeistungsnachweisHtml(nachweis({ betraege_freigegeben: false }))
    expect(html).toContain('03.08.2026')
    expect(html).toContain('09:00')
    expect(html).toContain('AB')
    expect(html).toContain('120 Min')
  })

  it('nennt den Entlastungsbetrag mit 131 EUR — nicht mit dem alten Wert 125', () => {
    const html = buildLeistungsnachweisHtml(nachweis())
    expect(html).toContain('131 €')
    expect(html).not.toContain('125 €')
  })
})
