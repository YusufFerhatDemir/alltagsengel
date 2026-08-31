/**
 * Verworfene Abfragefehler an Entscheidungsstellen
 * ================================================
 *
 * `scripts/lint-leerzustand.ts --bericht` zaehlt in lib/ und app/api 41
 * Stellen, an denen nur `data` destrukturiert wird und der Fehler damit
 * verfaellt. In einer Renderdatei erzeugt das einen falschen Leerzustand;
 * hier, an einer Entscheidungsstelle, kippt es das Ergebnis der
 * Entscheidung — und zwar in die freigebende Richtung, weil „leere Liste"
 * bei jeder Negativ-Pruefung („keine unsignierten Nachweise", „kein
 * bestehender Lauf") den Beweis der Unbedenklichkeit ersetzt.
 *
 * Jeder Test hier stellt genau EINE Abfrage auf Fehler und prueft, dass
 * der Pruefling das als „nicht feststellbar" behandelt statt als „nichts
 * gefunden". Die Gegenprobe — dieselbe Abfrage sauber und leer — steht
 * jeweils daneben, sonst wuerde ein Pruefling durchkommen, der einfach
 * IMMER blockiert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf } from './helpers/supabase-fake'

const ORG = '22222222-2222-4222-8222-222222222222'
const ACTOR = '33333333-3333-4333-8333-333333333333'
const MONAT = '2026-07-01'

const FEHLER = { message: 'Verbindung unterbrochen', code: '08006' }

// ════════════════════════════════════════════════════════════════════
// Pre-Flight der Kassenabrechnung
// ════════════════════════════════════════════════════════════════════

/**
 * Baut einen Pre-Flight-Durchlauf, bei dem ALLES gesund ist, ausser der
 * einen Tabelle in `kaputt`. So misst jeder Test genau eine Abfrage.
 */
function preFlightFake(kaputt: { tabelle: string; head?: boolean } | null) {
  const stoert = (a: FakeAufruf) =>
    kaputt !== null
    && a.tabelle === kaputt.tabelle
    && (kaputt.head === undefined || a.head === kaputt.head)

  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (stoert(a)) return { error: FEHLER, data: null, count: null }

    switch (a.tabelle) {
      case 'state_settings':
        return { data: {
          status: 'ANERKANNT', insurance_enabled: true,
          kassenrechnung_enabled: true, dakota_export_enabled: true,
          approval_document: 'bescheid.pdf',
        } }
      case 'billing_tariffs':
        return { data: [], count: 3 }
      case 'invoices':
        return {
          data: [{
            id: 'inv-1', status: 'freigegeben', client_id: 'client-1',
            total_amount: 100, invoice_number_formatted: 'RE-1',
            frozen_at: '2026-07-31T00:00:00Z',
          }],
          count: 1,
        }
      case 'clients':
        return { data: [{
          id: 'client-1', versichertennummer: 'A123456789',
          geburtsdatum: '1940-01-01', first_name: 'Erika',
          last_name: 'Mustermann', care_level: 3, pflegegrad: null,
        }] }
      case 'service_records':
        // Zaehlabfrage: 0 unsignierte Nachweise.
        return { data: null, count: 0 }
      case 'abrechnungslaeufe':
        return { data: [] }
      case 'abrechnung_zertifikate':
        return { data: { gueltig_bis: '2099-12-31' } }
      case 'datenannahmestellen':
        return {
          data: [{
            id: 'das-1', name: 'ITSCare', sftp_host: 'sftp.example',
            sftp_user: 'u', sftp_key_url: 'k', zustaendig_fuer: [],
          }],
          count: 1,
        }
      default:
        return { data: [] }
    }
  })
}

async function preFlight(kaputt: { tabelle: string; head?: boolean } | null) {
  const { preFlightValidierung } = await import('@/lib/abrechnung/kassenabrechnung-engine')
  const fake = preFlightFake(kaputt)
  return preFlightValidierung(fake.client as never, {
    organizationId: ORG, abrechnungsmonat: MONAT, bundesland: 'Hessen',
  })
}

const punkt = (e: { alle: Array<{ id: string; bestanden: boolean; details: string }> }, id: string) =>
  e.alle.find(p => p.id === id)

describe('Pre-Flight Kassenabrechnung: eine gescheiterte Abfrage ist kein bestandener Pruefpunkt', () => {
  it('Gegenprobe: bei gesunden Abfragen bestehen die vier Negativ-Pruefpunkte', async () => {
    const e = await preFlight(null)
    for (const id of ['festschreibung', 'kundendaten', 'signaturen', 'doppelabrechnung']) {
      expect(punkt(e, id)?.bestanden, `${id} muss im Gutfall bestehen`).toBe(true)
    }
  })

  it('Doppelabrechnung: nicht lesbare Laeufe duerfen nicht als "kein Erstlauf" gelten', async () => {
    // Der teuerste Fall: der Punkt meldete "Kein aktiver Erstlauf fuer
    // diesen Zeitraum" und derselbe Monat ging ein zweites Mal an dieselbe
    // Kasse — nicht zurueckholbar, nur stornierbar.
    const e = await preFlight({ tabelle: 'abrechnungslaeufe' })
    const p = punkt(e, 'doppelabrechnung')
    expect(p?.bestanden).toBe(false)
    expect(p?.details).toContain('NICHT PRUEFBAR')
    expect(e.bestanden).toBe(false)
  })

  it('Signaturen: ein nicht ermittelter Zaehler ist keine Null', async () => {
    // `count` ist bei Fehlern null, und `(null ?? 0) === 0` meldete
    // "Alle Leistungsnachweise signiert".
    const e = await preFlight({ tabelle: 'service_records' })
    const p = punkt(e, 'signaturen')
    expect(p?.bestanden).toBe(false)
    expect(p?.details).toContain('NICHT PRUEFBAR')
  })

  it('Kundendaten: nicht lesbare Klienten sind keine vollstaendigen Klienten', async () => {
    const e = await preFlight({ tabelle: 'clients' })
    const p = punkt(e, 'kundendaten')
    expect(p?.bestanden).toBe(false)
    expect(p?.details).toContain('NICHT PRUEFBAR')
  })

  it('Kundendaten: auch eine unvollzaehlige Antwort ohne Fehler zaehlt nicht als geprueft', async () => {
    // Zu jeder Rechnung MUSS ein Klient gehoeren. Kommen weniger Zeilen
    // zurueck als angefragt, ist mindestens einer ungeprueft geblieben —
    // ohne dass PostgREST das als Fehler meldet.
    const { preFlightValidierung } = await import('@/lib/abrechnung/kassenabrechnung-engine')
    const fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'clients') return { data: [] }
      const basis = preFlightFake(null)
      void basis
      switch (a.tabelle) {
        case 'state_settings':
          return { data: {
            status: 'ANERKANNT', insurance_enabled: true,
            kassenrechnung_enabled: true, dakota_export_enabled: true,
            approval_document: 'bescheid.pdf',
          } }
        case 'billing_tariffs': return { data: [], count: 3 }
        case 'invoices': return {
          data: [{
            id: 'inv-1', status: 'freigegeben', client_id: 'client-1',
            total_amount: 100, invoice_number_formatted: 'RE-1',
            frozen_at: '2026-07-31T00:00:00Z',
          }],
          count: 1,
        }
        case 'service_records': return { data: null, count: 0 }
        case 'abrechnungslaeufe': return { data: [] }
        case 'abrechnung_zertifikate': return { data: { gueltig_bis: '2099-12-31' } }
        case 'datenannahmestellen': return {
          data: [{
            id: 'das-1', name: 'ITSCare', sftp_host: 'sftp.example',
            sftp_user: 'u', sftp_key_url: 'k', zustaendig_fuer: [],
          }],
          count: 1,
        }
        default: return { data: [] }
      }
    })
    const e = await preFlightValidierung(fake.client as never, {
      organizationId: ORG, abrechnungsmonat: MONAT, bundesland: 'Hessen',
    })
    const p = punkt(e, 'kundendaten')
    expect(p?.bestanden).toBe(false)
    expect(p?.details).toContain('NICHT PRUEFBAR')
  })
})

// ════════════════════════════════════════════════════════════════════
// Fristen — eine Eskalation, die still ausfaellt
// ════════════════════════════════════════════════════════════════════

describe('Fristen: ein nicht gelesener Bestand ist kein leerer Bestand', () => {
  it('pruefeUeberfaelligeFristen meldet nicht "0 ueberfaellig", wenn sie nicht lesen konnte', async () => {
    const { pruefeUeberfaelligeFristen } = await import('@/lib/abrechnung/fristen-manager')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    await expect(pruefeUeberfaelligeFristen(fake.client as never, ORG))
      .rejects.toThrow(/nicht lesbar/i)
  })

  it('escaliereUeberfaellige meldet den Ausfall statt eines sauberen Laufs ohne Eskalation', async () => {
    const { escaliereUeberfaellige } = await import('@/lib/abrechnung/fristen-manager')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    const e = await escaliereUeberfaellige(fake.client as never, ORG, ACTOR)
    expect(e.eskaliert).toBe(0)
    // Der Unterschied zum Gutfall: die Fehlerliste ist NICHT leer.
    expect(e.fehler.length).toBeGreaterThan(0)
    expect(e.fehler[0]).toMatch(/nicht lesbar/i)
  })

  it('Gegenprobe: ein Tag ohne ueberfaellige Fristen bleibt ein Lauf ohne Fehler', async () => {
    const { escaliereUeberfaellige } = await import('@/lib/abrechnung/fristen-manager')
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    const e = await escaliereUeberfaellige(fake.client as never, ORG, ACTOR)
    expect(e.eskaliert).toBe(0)
    expect(e.fehler).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════
// Warteschlangen — „0 offen" ist eine Aussage, keine Fehlermeldung
// ════════════════════════════════════════════════════════════════════

describe('Fehlerqueues melden nicht "leer", wenn sie nicht lesbar sind', () => {
  it('deadLetterUebersicht bricht ab statt lauter Nullen zu melden', async () => {
    const { deadLetterUebersicht } = await import('@/lib/abrechnung/dead-letter')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    await expect(deadLetterUebersicht(fake.client as never, ORG))
      .rejects.toThrow(/nicht lesbar/i)
  })

  it('wiedervorlageUebersicht ebenso', async () => {
    const { wiedervorlageUebersicht } = await import('@/lib/abrechnung/wiedervorlage')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    await expect(wiedervorlageUebersicht(fake.client as never, ORG))
      .rejects.toThrow(/nicht lesbar/i)
  })

  it('getDunningOverview meldet nicht "0 offen, 0 EUR ueberfaellig", wenn sie nicht lesen konnte', async () => {
    const { getDunningOverview } = await import('@/lib/billing/core/dunning')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    await expect(getDunningOverview(fake.client as never, ORG))
      .rejects.toThrow(/nicht lesbar/i)
  })

  it('Gegenprobe: eine wirklich leere Queue meldet 0 und wirft nicht', async () => {
    const { deadLetterUebersicht } = await import('@/lib/abrechnung/dead-letter')
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    const e = await deadLetterUebersicht(fake.client as never, ORG)
    expect(e.gesamt).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════════
// XRechnung — ein Dokument, das an einen Kostentraeger geht
// ════════════════════════════════════════════════════════════════════

describe('XRechnung: keine Datei ohne Positionen', () => {
  const RECHNUNG = 'inv-xr-1'

  function xrFake(positionen: { data?: unknown; error?: typeof FEHLER } ) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      switch (a.tabelle) {
        case 'invoices':
          return { data: {
            id: RECHNUNG, organization_id: ORG, client_id: 'client-1',
            invoice_number_formatted: 'RE-1', invoice_date: '2026-07-31',
            period_start: '2026-07-01', period_end: '2026-07-31',
            total_amount: 100, status: 'freigegeben', correction_of: null,
          } }
        case 'clients':
          return { data: {
            first_name: 'Erika', last_name: 'Mustermann', address: 'Weg 1',
            city: 'Frankfurt', zip_code: '60311',
            insurance_name: 'AOK', insurance_number: 'A1',
          } }
        case 'organizations':
          return { data: { name: 'Alltagsengel', iban: 'DE00', bic: 'X', bank_name: 'B', settings: {} } }
        case 'invoice_items':
          return positionen
        default:
          return { data: [] }
      }
    })
  }

  it('bricht ab, wenn die Positionen nicht lesbar sind', async () => {
    const { loadInvoiceXRechnungData } = await import('@/lib/billing/xrechnung/invoice-to-xrechnung')
    const fake = xrFake({ error: FEHLER })
    await expect(loadInvoiceXRechnungData(fake.client as never, RECHNUNG, ORG))
      .rejects.toThrow(/Positionen nicht lesbar/i)
  })

  it('der Lader laesst eine positionslose Rechnung durch — das ist ein zulaessiger Zustand', async () => {
    // Gegenstueck zum Test darunter: die Grenze ist die ausgehende DATEI,
    // nicht das Laden. Anzeige- und Pruefwege duerfen eine noch leere
    // Rechnung sehen (siehe __tests__/billing/xrechnung-laden-pglite).
    const { loadInvoiceXRechnungData } = await import('@/lib/billing/xrechnung/invoice-to-xrechnung')
    const fake = xrFake({ data: [] })
    const d = await loadInvoiceXRechnungData(fake.client as never, RECHNUNG, ORG)
    expect(d.lineItems).toEqual([])
  })

  it('verweigert die ausgehende Datei, wenn die Rechnung keine Positionen hat', async () => {
    // Sonst entsteht eine gueltig aussehende XRechnung mit Rechnungsbetrag
    // im Kopf und ohne die Leistungen, die ihn begruenden — an einen
    // Kostentraeger.
    const { generateXRechnungXml } = await import('@/lib/billing/xrechnung/invoice-to-xrechnung')
    const fake = xrFake({ data: [] })
    await expect(generateXRechnungXml(fake.client as never, RECHNUNG, ORG))
      .rejects.toThrow(/keine Positionen/i)
  })
})

// ════════════════════════════════════════════════════════════════════
// Gutschriftdeckel — die Zahl, die der Bearbeiter sieht
// ════════════════════════════════════════════════════════════════════

describe('Gutschriften: der Restbetrag wird nicht geschaetzt', () => {
  it('bricht ab, statt den vollen Rechnungsbetrag als noch gutschreibbar zu melden', async () => {
    const { getRemainingCreditableCents } = await import('@/lib/billing/core/credit-notes')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    await expect(getRemainingCreditableCents(fake.client as never, 'inv-1', 50_000))
      .rejects.toThrow(/nicht lesbar/i)
  })

  it('Gegenprobe: ohne bestehende Gutschriften ist der volle Betrag offen', async () => {
    const { getRemainingCreditableCents } = await import('@/lib/billing/core/credit-notes')
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    expect(await getRemainingCreditableCents(fake.client as never, 'inv-1', 50_000)).toBe(50_000)
  })
})

// ════════════════════════════════════════════════════════════════════
// Terminerinnerungen — der Lauf, der niemanden erreicht
// ════════════════════════════════════════════════════════════════════

describe('Terminerinnerung: kein stiller Lauf ohne Empfaenger', () => {
  beforeEach(() => vi.clearAllMocks())

  it('traegt einen Ausfall der Klientenabfrage in die Fehlerliste ein', async () => {
    const { erinnereAnKommendeTermine } = await import('@/lib/automation/termin-erinnerung')
    const fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'assignments') {
        return { data: [{
          id: 'a-1', assignment_date: '2026-07-02', start_time: '09:00:00',
          end_time: '10:00:00', status: 'confirmed',
          service_type: 'Begleitung', client_id: 'client-1',
        }] }
      }
      if (a.tabelle === 'clients') return { error: FEHLER, data: null }
      return { data: [] }
    })
    const e = await erinnereAnKommendeTermine(
      fake.client as never, ORG, new Date('2026-07-01T08:00:00Z'),
    )
    // Der Lauf meldete vorher `erinnert: 0` neben `fehler: []` und galt
    // damit als sauber durchgelaufen.
    expect(e.fehler.some(f => /nicht lesbar/i.test(f))).toBe(true)
  })
})
