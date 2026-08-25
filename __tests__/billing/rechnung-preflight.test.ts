// ═══════════════════════════════════════════════════════════════════════
// RECHNUNGSVERSAND-PREFLIGHT — die 16 Punkte einzeln
//
// Jeder der 16 Punkte bekommt mindestens einen Fall, der ihn AUSLÖST, und
// die Gegenprobe, dass er im Normalfall erfüllt ist. Ohne die Gegenprobe
// wäre nicht unterscheidbar, ob ein Punkt blockiert, weil er greift, oder
// weil er immer blockiert.
//
// Zusätzlich geprüft wird die Eigenschaft, die den Preflight brauchbar
// macht: dass er NICHT schreibt. Ein Preflight mit Nebenwirkung könnte man
// nicht aus einer Übersicht über hundert Rechnungen aufrufen.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  pruefeRechnungVersandbereit,
  darfVersenden,
  type PunktSchluessel,
  type RechnungPreflightErgebnis,
} from '@/lib/billing/preflight/rechnung-preflight'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000042'
const FREMDE_ORG = '00000000-0000-4000-8000-000000000099'
const INV = '00000000-0000-4000-8000-0000000000cc'

// ---------------------------------------------------------------------------
// Ausgangslage: eine Rechnung, an der alle 16 Punkte erfüllt sind
// ---------------------------------------------------------------------------

const RECHNUNG_OK = {
  id: INV,
  organization_id: ORG,
  client_id: 'client-1',
  invoice_number: 'RE-2026-0001',
  invoice_number_formatted: 'RE-2026-0001',
  status: 'freigegeben',
  correction_type: null,
  correction_of: null,
  total_amount: 150.5,
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  due_date: '2026-08-14',
  sent_at: null,
  frozen_at: '2026-08-01T10:00:00Z',
  deleted_at: null,
}

const KLIENT_OK = {
  id: 'client-1',
  organization_id: ORG,
  first_name: 'Erika',
  last_name: 'Schmidt',
  email: 'erika.schmidt@web.de',
  address: 'Hauptstraße 1',
  city: 'Frankfurt',
  zip_code: '60311',
  insurance_name: null,
  status: 'active',
}

const POSITION_OK = {
  id: 'item-1',
  invoice_id: INV,
  description: 'Alltagsbegleitung',
  date: '2026-07-05',
  duration_minutes: 120,
  amount: 150.5,
  budget_type: 'private',
  // 75,25 € je Stunde × 2 Stunden = 150,50 €
  tariff_preis_cent: 7525,
}

const ORG_OK = {
  id: ORG,
  name: 'Alltagsengel UG (haftungsbeschränkt)',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
  bank_name: 'Deutsche Kreditbank',
  settings: {},
}

const PAKET_OK = { pdf_url: 'https://storage.example/paket.pdf', page_count: 2 }

interface Lage {
  rechnung?: Record<string, unknown> | null
  klient?: Record<string, unknown> | null
  positionen?: Record<string, unknown>[]
  org?: Record<string, unknown> | null
  paket?: Record<string, unknown> | null
  /** Weitere Rechnungen mit derselben Nummer. */
  nummernDubletten?: { id: string }[]
  /** Existiert die Ursprungsrechnung zu correction_of im eigenen Haus? */
  originalVorhanden?: boolean
  /** Fehler beim Lesen des Audit-Trails. */
  auditFehler?: string
  /** Fehler beim Lesen der Positionen. */
  positionenFehler?: string
}

function db(lage: Lage = {}) {
  const rechnung = lage.rechnung === undefined ? RECHNUNG_OK : lage.rechnung
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'invoices': {
        // Drei verschiedene Zugriffe auf invoices — an den Filtern
        // unterscheidbar, genau wie live.
        const idFilter = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert
        const nrFilter = a.filter.find(f => f.methode === 'eq' && f.spalte === 'invoice_number_formatted')
        if (nrFilter) {
          return { data: lage.nummernDubletten ?? [{ id: INV }] }
        }
        if (idFilter === INV) return { data: rechnung }
        // correction_of-Nachschlag
        return { data: lage.originalVorhanden === false ? null : { id: idFilter } }
      }
      case 'clients':
        return { data: lage.klient === undefined ? KLIENT_OK : lage.klient }
      case 'organizations':
        return { data: lage.org === undefined ? ORG_OK : lage.org }
      case 'invoice_items':
        return lage.positionenFehler
          ? { error: { message: lage.positionenFehler } }
          : { data: lage.positionen ?? [POSITION_OK] }
      case 'invoice_packages':
        return { data: lage.paket === undefined ? PAKET_OK : lage.paket }
      case 'billing_audit_trail':
        return lage.auditFehler
          ? { error: { message: lage.auditFehler } }
          : { data: [], count: 3 }
      default:
        return { data: [] }
    }
  }
}

async function pruefe(lage: Lage = {}, erneutSenden = false) {
  const fake = erstelleFakeSupabase(db(lage))
  const ergebnis = await pruefeRechnungVersandbereit(fake.client, {
    invoiceId: INV, organizationId: ORG, erneutSenden,
  })
  return { ergebnis, fake }
}

function punkt(e: RechnungPreflightErgebnis, schluessel: PunktSchluessel) {
  return e.punkte.find(p => p.schluessel === schluessel)!
}

// ---------------------------------------------------------------------------

describe('Grundlage', () => {
  it('eine vollständige Rechnung ist READY_FOR_SEND', async () => {
    const { ergebnis } = await pruefe()
    // Wenn dieser Test fällt, blockiert irgendein Punkt grundlos — dann
    // sind alle folgenden Auslöse-Tests wertlos.
    expect(ergebnis.blocker).toEqual([])
    expect(ergebnis.zuPruefen).toEqual([])
    expect(ergebnis.status).toBe('READY_FOR_SEND')
  })

  it('liefert immer alle 16 Punkte, auch die erfüllten', async () => {
    const { ergebnis } = await pruefe()
    expect(ergebnis.punkte).toHaveLength(16)
    expect(ergebnis.punkte.map(p => p.nummer)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1))
  })

  it('schreibt nichts', async () => {
    const { fake } = await pruefe()
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('liest die Rechnung org-gefenced', async () => {
    const { fake } = await pruefe()
    const lesen = fake.ersterAuf('invoices')
    expect(hatFilter(lesen, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('eine Rechnung eines fremden Mandanten ist vollständig blockiert', async () => {
    const { ergebnis } = await pruefe({ rechnung: null })
    expect(ergebnis.status).toBe('BLOCKED')
    // Nicht ein Punkt offen, sondern alle — sonst sähe die Antwort aus,
    // als fehle nur eine Kleinigkeit.
    expect(ergebnis.punkte.every(p => p.stand === 'blockiert')).toBe(true)
  })
})

describe('1. Kunde vorhanden', () => {
  it('blockiert ohne client_id', async () => {
    const { ergebnis } = await pruefe({ rechnung: { ...RECHNUNG_OK, client_id: null } })
    expect(punkt(ergebnis, 'kunde').stand).toBe('blockiert')
  })

  it('blockiert, wenn der Klient nicht mehr existiert', async () => {
    const { ergebnis } = await pruefe({ klient: null })
    expect(punkt(ergebnis, 'kunde').stand).toBe('blockiert')
  })

  // `clients` hat kein deleted_at (Baseline 20260101000000) — der Zustand
  // heisst dort `status`. Ein inaktiver Klient kann eine offene Rechnung aus
  // der Zeit davor haben, deshalb Sichtung statt Sperre.
  it('stellt einen inaktiven Klienten zur Sichtung', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, status: 'inactive' } })
    expect(punkt(ergebnis, 'kunde').stand).toBe('pruefen')
  })

  // Ein Lesefehler ist nicht dasselbe wie „gibt es nicht" — sonst schickt
  // die Begruendung jemanden in die falsche Richtung.
  it('unterscheidet einen Lesefehler von „existiert nicht"', async () => {
    const fake = erstelleFakeSupabase((a) =>
      a.tabelle === 'clients'
        ? { error: { message: 'column clients.irgendwas does not exist', code: '42703' } }
        : db()(a))
    const ergebnis = await pruefeRechnungVersandbereit(fake.client, {
      invoiceId: INV, organizationId: ORG,
    })
    const p = ergebnis.punkte.find(x => x.schluessel === 'kunde')!
    expect(p.stand).toBe('blockiert')
    expect(p.befund).toContain('nicht lesbar')
    expect(p.befund).not.toContain('existiert nicht mehr')
  })
})

describe('2. Korrekte Organisation', () => {
  it('blockiert, wenn die Organisation fehlt', async () => {
    const { ergebnis } = await pruefe({ org: null })
    expect(punkt(ergebnis, 'mandant').stand).toBe('blockiert')
  })

  it('blockiert ohne Organisationsnamen — er ist der Absender', async () => {
    const { ergebnis } = await pruefe({ org: { ...ORG_OK, name: null } })
    expect(punkt(ergebnis, 'mandant').stand).toBe('blockiert')
  })
})

describe('3. Empfängeradresse', () => {
  it('blockiert ohne E-Mail', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, email: null } })
    expect(punkt(ergebnis, 'empfaengeradresse').stand).toBe('blockiert')
  })

  it('blockiert bei einer Zeichenkette, die keine Adresse ist', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, email: 'erika at web punkt de' } })
    expect(punkt(ergebnis, 'empfaengeradresse').stand).toBe('blockiert')
  })

  // Nicht falsch, aber nicht vollständig: die Anschrift des
  // Leistungsempfängers ist Pflichtangabe. Ein Mensch darf das
  // verantworten, ein Automat nicht.
  it('verlangt eine Sichtung bei unvollständiger Postanschrift', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, zip_code: null } })
    expect(punkt(ergebnis, 'empfaengeradresse').stand).toBe('pruefen')
    expect(ergebnis.status).toBe('NEEDS_REVIEW')
  })
})

describe('4. Rechnungsnummer eindeutig', () => {
  it('blockiert ohne Nummer', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, invoice_number: null, invoice_number_formatted: null },
    })
    expect(punkt(ergebnis, 'rechnungsnummer').stand).toBe('blockiert')
  })

  it('blockiert bei doppelt vergebener Nummer', async () => {
    const { ergebnis } = await pruefe({
      nummernDubletten: [{ id: INV }, { id: 'inv-andere' }],
    })
    const p = punkt(ergebnis, 'rechnungsnummer')
    expect(p.stand).toBe('blockiert')
    expect(p.befund).toContain('2×')
  })

  it('die eigene Rechnung zählt nicht als Dublette ihrer selbst', async () => {
    const { ergebnis } = await pruefe({ nummernDubletten: [{ id: INV }] })
    expect(punkt(ergebnis, 'rechnungsnummer').stand).toBe('erfuellt')
  })
})

describe('5. Leistungszeitraum', () => {
  it('blockiert, wenn er fehlt', async () => {
    const { ergebnis } = await pruefe({ rechnung: { ...RECHNUNG_OK, period_end: null } })
    expect(punkt(ergebnis, 'leistungszeitraum').stand).toBe('blockiert')
  })

  it('blockiert, wenn er rückwärts läuft', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, period_start: '2026-07-31', period_end: '2026-07-01' },
    })
    expect(punkt(ergebnis, 'leistungszeitraum').stand).toBe('blockiert')
  })
})

describe('6. Positionen', () => {
  it('blockiert ohne Positionen', async () => {
    const { ergebnis } = await pruefe({ positionen: [], rechnung: { ...RECHNUNG_OK, total_amount: 0, correction_type: 'storno' } })
    expect(punkt(ergebnis, 'positionen').stand).toBe('blockiert')
  })

  it('verlangt eine Sichtung, wenn die Positionen nicht lesbar sind', async () => {
    const { ergebnis } = await pruefe({ positionenFehler: 'timeout' })
    expect(punkt(ergebnis, 'positionen').stand).toBe('pruefen')
  })
})

describe('7. Preise verifiziert', () => {
  it('blockiert, wenn der berechnete Betrag vom Tarifpreis abweicht', async () => {
    // Tarif 75,25 €/h × 2 h ergäbe 150,50 € — berechnet sind 200,00 €.
    const { ergebnis } = await pruefe({
      positionen: [{ ...POSITION_OK, amount: 200 }],
      rechnung: { ...RECHNUNG_OK, total_amount: 200 },
    })
    const p = punkt(ergebnis, 'preise')
    expect(p.stand).toBe('blockiert')
    expect(p.befund).toContain('weichen vom hinterlegten Tarifpreis ab')
  })

  it('verlangt eine Sichtung, wenn kein Tarifpreis hinterlegt ist', async () => {
    const { ergebnis } = await pruefe({
      positionen: [{ ...POSITION_OK, tariff_preis_cent: null }],
    })
    expect(punkt(ergebnis, 'preise').stand).toBe('pruefen')
  })

  it('duldet einen Cent Rundungsabweichung', async () => {
    // 33,33 €/h × 1,5 h = 49,995 € → 50,00 € auf der Position.
    const { ergebnis } = await pruefe({
      positionen: [{ ...POSITION_OK, duration_minutes: 90, tariff_preis_cent: 3333, amount: 50 }],
      rechnung: { ...RECHNUNG_OK, total_amount: 50 },
    })
    expect(punkt(ergebnis, 'preise').stand).toBe('erfuellt')
  })
})

describe('8. Steuern', () => {
  // Der Fall, den ein Empfänger als Erstes nachrechnet.
  it('blockiert, wenn die Positionssumme vom Rechnungsbetrag abweicht', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, total_amount: 200 },
      positionen: [{ ...POSITION_OK, amount: 150.5 }],
    })
    const p = punkt(ergebnis, 'steuern')
    expect(p.stand).toBe('blockiert')
    expect(p.befund).toContain('§ 4 Nr. 16 UStG')
  })

  it('ist erfüllt, wenn beide übereinstimmen', async () => {
    const { ergebnis } = await pruefe()
    expect(punkt(ergebnis, 'steuern').stand).toBe('erfuellt')
  })
})

describe('9. Betrag', () => {
  it('blockiert bei 0,00 € ohne Kennzeichnung', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, total_amount: 0 },
      positionen: [{ ...POSITION_OK, amount: 0, tariff_preis_cent: 0 }],
    })
    expect(punkt(ergebnis, 'betrag').stand).toBe('blockiert')
  })

  it('blockiert bei negativem Betrag ohne Kennzeichnung', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, total_amount: -50 },
      positionen: [{ ...POSITION_OK, amount: -50, tariff_preis_cent: null }],
    })
    expect(punkt(ergebnis, 'betrag').stand).toBe('blockiert')
  })

  it('lässt einen negativen Betrag zu, wenn er als Gutschrift gekennzeichnet ist', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, total_amount: -50, correction_type: 'gutschrift' },
      positionen: [{ ...POSITION_OK, amount: -50, tariff_preis_cent: null }],
    })
    expect(punkt(ergebnis, 'betrag').stand).toBe('erfuellt')
  })
})

describe('10. Bankdaten', () => {
  it('blockiert ohne IBAN', async () => {
    const { ergebnis } = await pruefe({ org: { ...ORG_OK, iban: null } })
    expect(punkt(ergebnis, 'bankdaten').stand).toBe('blockiert')
  })

  it('blockiert bei einer IBAN, die die Prüfsumme nicht besteht', async () => {
    const { ergebnis } = await pruefe({ org: { ...ORG_OK, iban: 'DE03120300000000202051' } })
    expect(punkt(ergebnis, 'bankdaten').stand).toBe('blockiert')
  })

  it('verlangt eine Sichtung ohne BIC', async () => {
    const { ergebnis } = await pruefe({ org: { ...ORG_OK, bic: null } })
    expect(punkt(ergebnis, 'bankdaten').stand).toBe('pruefen')
  })

  // Auf einer Gutschrift steht keine Zahlungsaufforderung.
  it('ist bei einer Gutschrift nicht anwendbar', async () => {
    const { ergebnis } = await pruefe({
      org: { ...ORG_OK, iban: null },
      rechnung: { ...RECHNUNG_OK, correction_type: 'gutschrift' },
    })
    expect(punkt(ergebnis, 'bankdaten').stand).toBe('nicht_anwendbar')
  })
})

describe('11. PDF', () => {
  it('blockiert, wenn die Rechnung nicht festgeschrieben ist', async () => {
    const { ergebnis } = await pruefe({ rechnung: { ...RECHNUNG_OK, frozen_at: null } })
    expect(punkt(ergebnis, 'pdf').stand).toBe('blockiert')
  })

  // Der Fall, der diesen Punkt fast unbrauchbar gemacht hätte: beim ERSTEN
  // Versand existiert nie ein Belegpaket — es entsteht erst im Versand.
  // Ein 'pruefen' hier hätte jeden automatischen Erstversand dauerhaft
  // blockiert, mit einer plausibel klingenden Begründung.
  it('ein fehlendes Belegpaket blockiert den Erstversand NICHT', async () => {
    const { ergebnis } = await pruefe({ paket: null })
    const p = punkt(ergebnis, 'pdf')
    expect(p.stand).toBe('erfuellt')
    expect(ergebnis.status).toBe('READY_FOR_SEND')
    // Die Grenze wird trotzdem benannt, statt Sicherheit zu behaupten.
    expect(p.befund).toContain('erzeugt keines')
  })
})

describe('12. XRechnung', () => {
  it('ist beim Selbstzahler nicht anwendbar', async () => {
    const { ergebnis } = await pruefe()
    expect(punkt(ergebnis, 'xrechnung').stand).toBe('nicht_anwendbar')
  })

  it('greift, sobald der Beleg an einen Kostenträger geht', async () => {
    const { ergebnis } = await pruefe({
      klient: { ...KLIENT_OK, insurance_name: 'AOK Hessen' },
      positionen: [{ ...POSITION_OK, budget_type: 'entlastung' }],
    })
    // Der Fake liefert für loadInvoiceXRechnungData nicht alles, was sie
    // braucht — genau deshalb muss der Punkt blockieren statt zu schweigen.
    expect(punkt(ergebnis, 'xrechnung').stand).not.toBe('nicht_anwendbar')
  })

  it('eine Kasse ohne Kassen-Position bleibt Selbstzahler-Fall', async () => {
    const { ergebnis } = await pruefe({
      klient: { ...KLIENT_OK, insurance_name: 'AOK Hessen' },
      positionen: [{ ...POSITION_OK, budget_type: 'private' }],
    })
    expect(punkt(ergebnis, 'xrechnung').stand).toBe('nicht_anwendbar')
  })
})

describe('13. Keine Testdaten', () => {
  it('blockiert bei einem Testmandanten', async () => {
    const { ergebnis } = await pruefe({ org: { ...ORG_OK, name: 'Test GmbH' } })
    expect(punkt(ergebnis, 'testdaten').stand).toBe('blockiert')
  })

  // „Mustermann" ist der Regelfall, nicht „Muster" als eigenes Wort — ein
  // \b hinter dem Stamm liesse ihn durch.
  it('erkennt „Mustermann" und verlangt eine Sichtung', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, last_name: 'Mustermann' } })
    expect(punkt(ergebnis, 'testdaten').stand).toBe('pruefen')
  })

  it('erkennt „Testkunde" ebenso', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, first_name: 'Testkunde' } })
    expect(punkt(ergebnis, 'testdaten').stand).toBe('pruefen')
  })

  // Ein Name ist eine Heuristik und blockiert deshalb nicht: „Testa" und
  // „Demopoulos" sind echte Nachnamen. Die Rechnung eines echten Kunden
  // zurueckzuhalten waere der schwerere Fehler.
  it('ein verdächtiger Name blockiert NICHT, er wird nur zur Sichtung gestellt', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, last_name: 'Testa' } })
    expect(punkt(ergebnis, 'testdaten').stand).toBe('pruefen')
    expect(ergebnis.status).toBe('NEEDS_REVIEW')
    expect(ergebnis.blocker).toEqual([])
  })

  // Eine reservierte Domain ist dagegen ein Beweis: dort empfängt per Norm
  // niemand.
  it('blockiert bei einer für Tests reservierten Domain', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, email: 'kunde@example.org' } })
    expect(punkt(ergebnis, 'testdaten').stand).toBe('blockiert')
  })

  it('ein unauffälliger Name ist erfüllt', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, last_name: 'Demirci' } })
    expect(punkt(ergebnis, 'testdaten').stand).toBe('erfuellt')
  })
})

describe('14. Kein Cross-Tenant-Zugriff', () => {
  it('blockiert, wenn der Klient einem anderen Mandanten gehört', async () => {
    const { ergebnis } = await pruefe({ klient: { ...KLIENT_OK, organization_id: FREMDE_ORG } })
    const p = punkt(ergebnis, 'mandantengrenze')
    expect(p.stand).toBe('blockiert')
    expect(p.befund).toContain('Klient')
  })

  it('blockiert, wenn die korrigierte Ursprungsrechnung fremd ist', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, correction_of: 'inv-fremd', correction_type: 'korrektur' },
      originalVorhanden: false,
    })
    expect(punkt(ergebnis, 'mandantengrenze').stand).toBe('blockiert')
  })

  it('blockiert bei einer Position, die zu einer anderen Rechnung gehört', async () => {
    const { ergebnis } = await pruefe({
      positionen: [{ ...POSITION_OK, invoice_id: 'inv-andere' }],
    })
    expect(punkt(ergebnis, 'mandantengrenze').stand).toBe('blockiert')
  })
})

describe('15. Kein bereits erfolgter Versand', () => {
  it('blockiert eine bereits versendete Rechnung', async () => {
    const { ergebnis } = await pruefe({
      rechnung: { ...RECHNUNG_OK, sent_at: '2026-08-05T09:00:00Z' },
    })
    expect(punkt(ergebnis, 'kein_doppelversand').stand).toBe('blockiert')
  })

  it('lässt den ausdrücklichen Nachversand zu', async () => {
    const { ergebnis } = await pruefe(
      { rechnung: { ...RECHNUNG_OK, sent_at: '2026-08-05T09:00:00Z' } }, true)
    expect(punkt(ergebnis, 'kein_doppelversand').stand).toBe('nicht_anwendbar')
    expect(ergebnis.status).toBe('READY_FOR_SEND')
  })
})

describe('16. Audit-Datensatz erzeugbar', () => {
  it('blockiert, wenn der Audit-Trail nicht erreichbar ist', async () => {
    const { ergebnis } = await pruefe({ auditFehler: 'permission denied for table billing_audit_trail' })
    const p = punkt(ergebnis, 'audit')
    expect(p.stand).toBe('blockiert')
    expect(p.befund).toContain('ohne Nachweis')
  })

  it('fragt den Trail org-gefenced ab', async () => {
    const { fake } = await pruefe()
    const audit = fake.ersterAuf('billing_audit_trail')
    expect(hatFilter(audit, 'eq', 'organization_id', ORG)).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('darfVersenden', () => {
  const bau = (status: RechnungPreflightErgebnis['status'], blocker: string[] = [], zuPruefen: string[] = []) =>
    ({ status, blocker, zuPruefen, invoiceId: INV } as RechnungPreflightErgebnis)

  it('BLOCKED geht für niemanden raus', () => {
    expect(darfVersenden(bau('BLOCKED', ['x']), 'manuell').erlaubt).toBe(false)
    expect(darfVersenden(bau('BLOCKED', ['x']), 'automatisch').erlaubt).toBe(false)
  })

  // Der ganze Sinn der Unterscheidung: ein Automat, der nachts läuft,
  // kann einen Zweifelsfall nicht verantworten. Ein Mensch schon.
  it('NEEDS_REVIEW geht manuell raus, automatisch nicht', () => {
    expect(darfVersenden(bau('NEEDS_REVIEW', [], ['y']), 'manuell').erlaubt).toBe(true)
    expect(darfVersenden(bau('NEEDS_REVIEW', [], ['y']), 'automatisch').erlaubt).toBe(false)
  })

  it('READY_FOR_SEND geht immer raus', () => {
    expect(darfVersenden(bau('READY_FOR_SEND'), 'automatisch').erlaubt).toBe(true)
    expect(darfVersenden(bau('READY_FOR_SEND'), 'manuell').erlaubt).toBe(true)
  })

  it('nennt beim Ablehnen den Grund', () => {
    const u = darfVersenden(bau('BLOCKED', ['4. Rechnungsnummer eindeutig: doppelt']), 'manuell')
    expect(u.grund).toContain('Rechnungsnummer')
  })
})
