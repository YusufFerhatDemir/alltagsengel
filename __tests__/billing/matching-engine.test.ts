/**
 * Zahlungs-Matching-Engine (lib/billing/matching/matching-engine.ts)
 *
 * Diese Schicht entscheidet ohne Menschen, welche Rechnung als bezahlt gilt.
 * Ein Fehler hier ist kein Anzeigefehler: eine Zahlung landet auf der
 * falschen Rechnung, ein Kunde wird faelschlich gemahnt, oder ein
 * Zahlungseingang bleibt still liegen.
 *
 * Geprueft wird deshalb nicht „laeuft durch", sondern:
 *   - was das Scoring aus einzelnen Belegen macht (Schwellwert 70),
 *   - dass der Mandanten-Fence auf JEDER Abfrage sitzt (Service-Role-Client,
 *     RLS greift hier nicht),
 *   - was bei einem fehlgeschlagenen Schreibvorgang passiert,
 *   - welche Belege NICHT zusammen fuer eine Auto-Zuordnung reichen duerfen.
 *
 * Der Doppelgaenger aus __tests__/helpers/supabase-fake.ts protokolliert
 * jeden Filter — genau darin liegen die Fehler, die ein Stub verschluckt.
 */
import { describe, test, expect } from 'vitest'
import { matchBuchung, type MatchingConfig } from '@/lib/billing/matching/matching-engine'
import type { CamtBuchung } from '@/lib/billing/camt/camt-parser'
import {
  erstelleFakeSupabase,
  hatOrgFence,
  hatFilter,
  type FakeAufruf,
  type FakeAntwort,
} from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '11111111-1111-4111-8111-111111111111'
const EINGANG = 'ze-0001'

function buchung(teil: Partial<CamtBuchung> = {}): CamtBuchung {
  return {
    betragCent: 12_500,
    waehrung: 'EUR',
    richtung: 'CRDT',
    buchungsdatum: '2026-08-14',
    valutadatum: '2026-08-14',
    status: 'BOOK',
    debitorName: null,
    debitorIban: null,
    kreditorName: null,
    kreditorIban: null,
    verwendungszweck: null,
    endToEndId: null,
    mandateId: null,
    buchungsreferenz: 'REF-1',
    istRuecklastschrift: false,
    ruecklastschriftGrund: null,
    istGebucht: true,
    ...teil,
  } as CamtBuchung
}

/**
 * Rechnung wie sie aus dem select() der Engine kommt.
 * `total_amount` ist EURO, nicht Cent — die Engine rechnet selbst um.
 */
function rechnung(teil: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoice_number: 'RE-2026-0042',
    invoice_number_formatted: 'RE-2026-0042',
    total_amount: 125,
    paid_amount: 0,
    client_id: 'kunde-1',
    client: { first_name: 'Anna', last_name: 'Musterfrau' },
    ...teil,
  }
}

/**
 * Baut einen Antwortgeber aus einer Tabellen-Landkarte. Nicht belegte
 * Tabellen liefern eine leere Liste — so faellt auf, wenn die Engine eine
 * Tabelle liest, an die hier niemand gedacht hat.
 */
function antworten(karte: Record<string, (a: FakeAufruf) => FakeAntwort>) {
  return (a: FakeAufruf): FakeAntwort => karte[a.tabelle]?.(a) ?? { data: [] }
}

/** Gutfall-Landkarte: Zahlung wird angelegt und zugeordnet. */
function schreibwegOk(rechnungen: Array<ReturnType<typeof rechnung>>) {
  return antworten({
    invoices: a => {
      // allocatePayment liest die Rechnung einzeln nach (maybeSingle).
      if (a.terminal === 'maybeSingle') {
        const id = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert
        const treffer = rechnungen.find(r => r.id === id)
        return { data: treffer ? { ...treffer, status: 'offen' } : null }
      }
      // Der OCC-Schreibvorgang in allocatePayment prueft, ob Zeilen
      // zurueckkamen — `null` bedeutet dort „konkurrierender Zugriff".
      if (a.operation === 'update') {
        const id = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert
        return { data: [{ id }] }
      }
      return { data: rechnungen }
    },
    payments: a => {
      if (a.operation === 'insert') return { data: { id: 'pay-1' } }
      // Zweiter OCC-Schreibvorgang: allocated_cents auf der Zahlung.
      if (a.operation === 'update') return { data: [{ id: 'pay-1' }] }
      // allocatePayment liest die Zahlung per .single() nach.
      return { data: { id: 'pay-1', amount_cents: 12_500, allocated_cents: 0, organization_id: ORG } }
    },
    payment_allocations: () => ({ data: { id: 'alloc-1' } }),
    dunning_entries: () => ({ data: [] }),
    zahlungseingaenge: () => ({ data: null }),
    billing_audit_trail: () => ({ data: null }),
    invoice_status_history: () => ({ data: null }),
  })
}

// ───────────────────────────────────────────────────────────────
// Vorfilter
// ───────────────────────────────────────────────────────────────

describe('Vorfilter', () => {
  test('eine Soll-Buchung wird gar nicht erst gematcht', async () => {
    const fake = erstelleFakeSupabase(antworten({}))
    const ergebnis = await matchBuchung(fake.client, buchung({ richtung: 'DBIT' }), EINGANG, ORG)

    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.klaerfallGrund).toMatch(/Soll-Buchung/)
    expect(
      fake.aufrufe.length,
      'Eine Ausgangsbuchung darf keine einzige Abfrage ausloesen — sonst laeuft '
      + 'die teure Kandidatensuche fuer jede Abbuchung des Kontoauszugs mit.',
    ).toBe(0)
  })

  test('ohne offene Rechnungen entsteht ein Klaerfall, keine Zahlung', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [] }) }))
    const ergebnis = await matchBuchung(fake.client, buchung(), EINGANG, ORG)

    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.paymentId).toBeNull()
    expect(ergebnis.klaerfallGrund).toMatch(/Keine offenen Rechnungen/)
    expect(fake.auf('payments')).toHaveLength(0)
  })

  test('eine bereits voll bezahlte Rechnung ist kein Kandidat', async () => {
    const fake = erstelleFakeSupabase(antworten({
      invoices: () => ({ data: [rechnung({ total_amount: 125, paid_amount: 125 })] }),
    }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'RE-2026-0042' }),
      EINGANG, ORG,
    )

    expect(ergebnis.status).toBe('klaerfall')
    expect(
      ergebnis.kandidaten,
      'Offener Betrag 0 heisst: kein Kandidat. Sonst wuerde eine zweite Zahlung '
      + 'auf eine ausgeglichene Rechnung gebucht.',
    ).toHaveLength(0)
  })
})

// ───────────────────────────────────────────────────────────────
// Mandantentrennung
// ───────────────────────────────────────────────────────────────

describe('Mandantentrennung', () => {
  test('die Rechnungssuche traegt den Org-Fence und blendet Geloeschtes aus', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [] }) }))
    await matchBuchung(fake.client, buchung(), EINGANG, ORG)

    const abfrage = fake.ersterAuf('invoices')
    expect(hatOrgFence(abfrage, ORG)).toBe(true)
    expect(hatFilter(abfrage, 'is', 'deleted_at', null)).toBe(true)
    expect(
      hatFilter(abfrage, 'not', 'status'),
      'Ohne den Status-Ausschluss waeren bezahlte und stornierte Rechnungen Kandidaten.',
    ).toBe(true)
  })

  test('auch die SEPA-Nachschlaege laufen mit Org-Fence', async () => {
    const fake = erstelleFakeSupabase(antworten({
      invoices: () => ({ data: [rechnung()] }),
      sepa_batch_items: () => ({ data: [] }),
      sepa_mandates: a => (a.terminal === 'single' ? { data: null } : { data: [] }),
    }))
    await matchBuchung(
      fake.client,
      buchung({ endToEndId: 'E2E-1', mandateId: 'MND-1', debitorIban: 'DE02120300000000202051' }),
      EINGANG, ORG,
    )

    for (const tabelle of ['sepa_batch_items', 'sepa_mandates']) {
      for (const a of fake.auf(tabelle)) {
        expect(
          hatOrgFence(a, ORG),
          `${tabelle} ohne Org-Fence: die Engine laeuft mit Service-Role, RLS `
          + 'schuetzt hier nicht. Ein fremdes Mandat wuerde mitzaehlen.',
        ).toBe(true)
      }
    }
  })

  test('eine fremde Organisation liest nicht die Rechnungen der eigenen', async () => {
    const fake = erstelleFakeSupabase(antworten({
      invoices: a => (hatOrgFence(a, FREMDE_ORG) ? { data: [] } : { data: [rechnung()] }),
    }))
    const ergebnis = await matchBuchung(fake.client, buchung(), EINGANG, FREMDE_ORG)

    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.klaerfallGrund).toMatch(/Keine offenen Rechnungen/)
  })
})

// ───────────────────────────────────────────────────────────────
// Scoring
// ───────────────────────────────────────────────────────────────

describe('Scoring', () => {
  test('Rechnungsnummer im Verwendungszweck plus exakter Betrag reicht fuer die Auto-Zuordnung', async () => {
    const inv = rechnung()
    const fake = erstelleFakeSupabase(schreibwegOk([inv]))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'Zahlung Rechnung RE-2026-0042', betragCent: 12_500 }),
      EINGANG, ORG,
    )

    // 50 (Nummer im VZ) + 20 (Betrag exakt) = 70 = Schwellwert
    expect(ergebnis.confidence).toBe(70)
    expect(ergebnis.status).toBe('automatisch')
    expect(ergebnis.paymentId).toBe('pay-1')
  })

  test('die Rechnungsnummer allein bleibt unter dem Schwellwert', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [rechnung()] }) }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'RE-2026-0042', betragCent: 5_000 }),
      EINGANG, ORG,
    )

    expect(ergebnis.confidence).toBe(50)
    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.klaerfallGrund).toMatch(/unter Schwellwert 70/)
    expect(
      fake.auf('payments'),
      'Unterhalb des Schwellwerts darf keine Zahlung entstehen.',
    ).toHaveLength(0)
  })

  test('ein abweichender Betrag von bis zu 5 Cent zaehlt noch als „fast"', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [rechnung()] }) }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'RE-2026-0042', betragCent: 12_505 }),
      EINGANG, ORG,
    )

    // 50 + 10 = 60: Rundungsdifferenzen der Bank kippen das Ergebnis nicht
    // auf 0, reichen aber allein nicht fuer eine automatische Buchung.
    expect(ergebnis.confidence).toBe(60)
    expect(ergebnis.kandidaten[0].matchMethode).toContain('betrag_fast')
  })

  test('6 Cent Abweichung ergeben keinen Betragsbonus mehr', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [rechnung()] }) }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'RE-2026-0042', betragCent: 12_506 }),
      EINGANG, ORG,
    )

    expect(ergebnis.confidence).toBe(50)
    expect(ergebnis.kandidaten[0].matchMethode).not.toContain('betrag')
  })

  test('EndToEndId aus der SEPA-Lastschrift wiegt am schwersten', async () => {
    const inv = rechnung()
    const basis = schreibwegOk([inv])
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'sepa_batch_items'
        ? { data: [{ invoice_id: 'inv-1', mandate_id: 'm-1', mandate: { client_id: 'kunde-1' } }] }
        : basis(a),
    )
    const ergebnis = await matchBuchung(
      fake.client, buchung({ endToEndId: 'E2E-1' }), EINGANG, ORG,
    )

    // 60 (E2E) + 20 (Betrag exakt) = 80
    expect(ergebnis.confidence).toBe(80)
    expect(ergebnis.status).toBe('automatisch')
    expect(ergebnis.kandidaten[0].matchMethode).toContain('end_to_end_id')
  })

  test('eine EndToEndId, die zu einer ANDEREN Rechnung gehoert, gibt keine Punkte', async () => {
    const fake = erstelleFakeSupabase(antworten({
      invoices: () => ({ data: [rechnung()] }),
      sepa_batch_items: () => ({
        data: [{ invoice_id: 'inv-999', mandate_id: 'm-1', mandate: { client_id: 'kunde-1' } }],
      }),
    }))
    const ergebnis = await matchBuchung(
      fake.client, buchung({ endToEndId: 'E2E-FREMD' }), EINGANG, ORG,
    )

    // Nur der Betrag passt (20) — die E2E-Referenz zeigt woanders hin.
    expect(ergebnis.confidence).toBe(20)
    expect(ergebnis.status).toBe('klaerfall')
  })

  test('ein Namenstreffer allein macht keine Zahlung', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [rechnung()] }) }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ debitorName: 'Anna Musterfrau', betragCent: 9_999 }),
      EINGANG, ORG,
    )

    expect(ergebnis.confidence).toBe(15)
    expect(ergebnis.status).toBe('klaerfall')
  })

  test('Umlaute im Zahlernamen verhindern den Namenstreffer nicht', async () => {
    const fake = erstelleFakeSupabase(antworten({
      invoices: () => ({ data: [rechnung({ client: { first_name: 'Jürgen', last_name: 'Groß' } })] }),
    }))
    const ergebnis = await matchBuchung(
      fake.client,
      // Banken liefern Namen haeufig transliteriert: JUERGEN GROSS.
      buchung({ debitorName: 'JUERGEN GROSS', betragCent: 9_999 }),
      EINGANG, ORG,
    )

    expect(
      ergebnis.kandidaten[0]?.matchMethode,
      'Ä/Ö/Ü/ß werden vor dem Vergleich aufgeloest — sonst faende die Engine '
      + 'genau die deutschen Namen nicht, um die es hier geht.',
    ).toContain('name_fuzzy')
  })

  test('ein voellig anderer Zahlername gibt keine Punkte', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [rechnung()] }) }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ debitorName: 'Bau GmbH Nord', betragCent: 9_999 }),
      EINGANG, ORG,
    )

    expect(ergebnis.kandidaten).toHaveLength(0)
    expect(ergebnis.confidence).toBe(0)
  })

  test('Kandidaten kommen nach Confidence sortiert und gedeckelt zurueck', async () => {
    const invs = Array.from({ length: 8 }, (_, i) => rechnung({
      id: `inv-${i}`,
      invoice_number: `RE-2026-00${i}`,
      invoice_number_formatted: `RE-2026-00${i}`,
      client_id: 'kunde-1',
    }))
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: invs }) }))
    const config: MatchingConfig = { autoMatchThreshold: 999, maxVorschlaege: 3 }
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ debitorName: 'Anna Musterfrau', betragCent: 12_500 }),
      EINGANG, ORG, config,
    )

    expect(ergebnis.kandidaten).toHaveLength(3)
    const werte = ergebnis.kandidaten.map(k => k.confidence)
    expect(werte).toEqual([...werte].sort((a, b) => b - a))
  })
})

// ───────────────────────────────────────────────────────────────
// Grenzfaelle des Nummernabgleichs
// ───────────────────────────────────────────────────────────────

describe('Rechnungsnummer im Verwendungszweck', () => {
  test('Kleinschreibung im Verwendungszweck stoert nicht', async () => {
    const fake = erstelleFakeSupabase(schreibwegOk([rechnung()]))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'ueberweisung re-2026-0042 danke' }),
      EINGANG, ORG,
    )
    expect(ergebnis.confidence).toBe(70)
  })

  test('eine fremde Rechnungsnummer im Verwendungszweck gibt keine Nummernpunkte', async () => {
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [rechnung()] }) }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'RE-2026-9999', betragCent: 9_999 }),
      EINGANG, ORG,
    )
    expect(ergebnis.kandidaten).toHaveLength(0)
  })

  test('eine Rechnungsnummer OHNE Bindestriche findet die Referenz MIT Bindestrichen nicht', async () => {
    // Festgehaltene Luecke: die Regex-Rueckfallebene vergleicht die extrahierte
    // Nummer unveraendert gegen die Rechnungsnummer und zusaetzlich gegen die
    // Rechnungsnummer ohne Bindestriche — aber nie die EXTRAHIERTE Nummer ohne
    // Bindestriche. Schreibt eine Organisation ihre Nummern ohne Trenner
    // (RE20260042) und der Kunde tippt sie mit (RE-2026-0042), bleibt nur der
    // Betrag als Beleg.
    const fake = erstelleFakeSupabase(antworten({
      invoices: () => ({ data: [rechnung({ invoice_number: 'RE20260042', invoice_number_formatted: 'RE20260042' })] }),
    }))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'Rechnung RE-2026-0042', betragCent: 12_500 }),
      EINGANG, ORG,
    )

    expect(ergebnis.confidence).toBe(20)
    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.kandidaten[0].matchMethode).toBe('betrag_exakt')
  })

  test('der umgekehrte Fall wird erkannt: Nummer MIT Bindestrichen, Referenz ohne', async () => {
    const fake = erstelleFakeSupabase(schreibwegOk([rechnung()]))
    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'Rechnung RE20260042', betragCent: 12_500 }),
      EINGANG, ORG,
    )

    // 45 (Regex-Rueckfall) + 20 (Betrag) = 65 — unter dem Schwellwert, aber
    // als Vorschlag sichtbar.
    expect(ergebnis.kandidaten[0].matchMethode).toContain('rechnungsnummer_regex')
    expect(ergebnis.confidence).toBe(65)
  })
})

// ───────────────────────────────────────────────────────────────
// Schreibweg der Auto-Zuordnung
// ───────────────────────────────────────────────────────────────

describe('Auto-Zuordnung', () => {
  test('die angelegte Zahlung traegt Organisation, Betrag und maschinelle Herkunft', async () => {
    const fake = erstelleFakeSupabase(schreibwegOk([rechnung()]))
    await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'RE-2026-0042', debitorName: 'Anna Musterfrau', debitorIban: 'DE02120300000000202051' }),
      EINGANG, ORG,
    )

    const insert = fake.auf('payments').find(a => a.operation === 'insert')
    const payload = insert?.payload as Record<string, unknown>
    expect(payload.organization_id).toBe(ORG)
    expect(payload.amount_cents).toBe(12_500)
    expect(payload.matching_status).toBe('automatisch_zugeordnet')
    expect(
      payload.created_by,
      'created_by ist eine UUID-Spalte mit FK auf auth.users. Der String "system" '
      + 'hatte hier 22P02 ausgeloest und JEDE automatische Zuordnung in den '
      + 'Klaerfall gedreht — NULL ist der Wert fuer einen maschinellen Vorgang.',
    ).toBeNull()
  })

  test('der Zahlungseingang wird mit Status, Confidence und Zahlung verknuepft', async () => {
    const fake = erstelleFakeSupabase(schreibwegOk([rechnung()]))
    await matchBuchung(fake.client, buchung({ verwendungszweck: 'RE-2026-0042' }), EINGANG, ORG)

    const update = fake.auf('zahlungseingaenge').find(a => a.operation === 'update')
    expect(update).toBeDefined()
    expect(update!.payload).toMatchObject({
      zuordnungs_status: 'automatisch',
      zuordnungs_confidence: 70,
      payment_id: 'pay-1',
    })
    expect(
      hatFilter(update, 'eq', 'id', EINGANG),
      'Ohne den id-Filter wuerden ALLE Zahlungseingaenge auf diese eine Zahlung gesetzt.',
    ).toBe(true)
  })

  test('die Auto-Zuordnung hinterlaesst einen Audit-Eintrag', async () => {
    const fake = erstelleFakeSupabase(schreibwegOk([rechnung()]))
    await matchBuchung(fake.client, buchung({ verwendungszweck: 'RE-2026-0042' }), EINGANG, ORG)

    const audit = fake.auf('billing_audit_trail').find(a => a.operation === 'insert')
    expect(
      audit,
      'Eine maschinelle Geldzuordnung ohne Protokolleintrag ist im Nachhinein '
      + 'nicht rekonstruierbar.',
    ).toBeDefined()
    expect(audit!.payload).toMatchObject({ organization_id: ORG })
  })

  test('eine Ueberzahlung wird nur bis zum offenen Betrag zugeordnet', async () => {
    // Realistischer Fall: der Kunde ueberweist zwei Rechnungen in einem Betrag
    // und nennt nur eine Nummer. Ein Betragstreffer ist dabei ausgeschlossen —
    // die Belege muessen aus Referenz und SEPA-Kennung kommen.
    const inv = rechnung({ total_amount: 125 })
    const basis = schreibwegOk([inv])
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'sepa_batch_items') {
        return { data: [{ invoice_id: 'inv-1', mandate_id: 'm-1', mandate: { client_id: 'kunde-1' } }] }
      }
      if (a.tabelle === 'payments' && a.operation === 'select') {
        return { data: { id: 'pay-1', amount_cents: 20_000, allocated_cents: 0, organization_id: ORG } }
      }
      return basis(a)
    })

    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ verwendungszweck: 'RE-2026-0042', endToEndId: 'E2E-1', betragCent: 20_000 }),
      EINGANG, ORG,
    )

    expect(ergebnis.status).toBe('automatisch')

    const alloc = fake.auf('payment_allocations').find(a => a.operation === 'insert')
    const payload = alloc?.payload as Record<string, unknown>
    expect(
      payload?.amount_cents,
      'Zugeordnet wird hoechstens der offene Betrag. Der Rest bleibt als '
      + 'nicht zugeordnetes Guthaben auf der Zahlung stehen und darf nicht '
      + 'stillschweigend auf diese Rechnung gebucht werden.',
    ).toBe(12_500)

    const zahlung = fake.auf('payments').find(a => a.operation === 'insert')
    expect(
      (zahlung?.payload as Record<string, unknown>).amount_cents,
      'Die Zahlung selbst traegt den VOLLEN eingegangenen Betrag — sonst ginge '
      + 'die Differenz zum Kontoauszug verloren.',
    ).toBe(20_000)
  })

  test('scheitert der Zahlungs-Insert, entsteht ein Klaerfall mit Grund — nicht ein stiller Verlust', async () => {
    const fake = erstelleFakeSupabase(antworten({
      invoices: () => ({ data: [rechnung()] }),
      payments: () => ({ data: null, error: { message: 'duplicate key value violates unique constraint' } }),
    }))
    const ergebnis = await matchBuchung(
      fake.client, buchung({ verwendungszweck: 'RE-2026-0042' }), EINGANG, ORG,
    )

    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.paymentId).toBeNull()
    expect(ergebnis.confidence).toBe(70)
    expect(ergebnis.klaerfallGrund).toMatch(/Auto-Zuordnung fehlgeschlagen/)
    expect(ergebnis.klaerfallGrund).toMatch(/duplicate key/)
    expect(
      fake.auf('zahlungseingaenge').filter(a => a.operation === 'update'),
      'Nach einem gescheiterten Insert darf der Eingang nicht als zugeordnet markiert werden.',
    ).toHaveLength(0)
  })

  test('scheitert die Zuordnung nach dem Insert, bleibt es beim Klaerfall', async () => {
    // allocatePayment findet die Rechnung nicht mehr (z. B. inzwischen storniert).
    const fake = erstelleFakeSupabase(antworten({
      invoices: a => (a.terminal === 'maybeSingle' ? { data: null } : { data: [rechnung()] }),
      payments: a => (a.operation === 'insert'
        ? { data: { id: 'pay-1' } }
        : { data: { id: 'pay-1', amount_cents: 12_500, allocated_cents: 0, organization_id: ORG } }),
    }))
    const ergebnis = await matchBuchung(
      fake.client, buchung({ verwendungszweck: 'RE-2026-0042' }), EINGANG, ORG,
    )

    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.klaerfallGrund).toMatch(/Auto-Zuordnung fehlgeschlagen/)
    expect(
      ergebnis.kandidaten.length,
      'Der Klaerfall muss die Vorschlaege behalten — sonst steht der Mensch in '
      + 'der Nachbearbeitung vor einer leeren Liste.',
    ).toBeGreaterThan(0)
  })

  test('der Schwellwert ist konfigurierbar und wirkt', async () => {
    const streng: MatchingConfig = { autoMatchThreshold: 71, maxVorschlaege: 5 }
    const fake = erstelleFakeSupabase(antworten({ invoices: () => ({ data: [rechnung()] }) }))
    const ergebnis = await matchBuchung(
      fake.client, buchung({ verwendungszweck: 'RE-2026-0042' }), EINGANG, ORG, streng,
    )

    expect(ergebnis.confidence).toBe(70)
    expect(ergebnis.status).toBe('klaerfall')
    expect(ergebnis.klaerfallGrund).toMatch(/unter Schwellwert 71/)
  })
})

// ───────────────────────────────────────────────────────────────
// Risikofall: mehrere gleich bewertete Rechnungen desselben Kunden
// ───────────────────────────────────────────────────────────────

describe('Mehrdeutigkeit', () => {
  test('zwei gleich bewertete Rechnungen desselben Kunden fuehren trotzdem zu EINER Auto-Buchung', async () => {
    // Bewusst festgehalten, weil es der teuerste denkbare Fehlgriff ist: die
    // Belege sind hier alle KUNDEN-bezogen (Mandat, IBAN, Name) und keiner
    // rechnungsbezogen. Beide offenen Rechnungen bekommen denselben Score;
    // die Engine nimmt kandidaten[0] — also schlicht die Reihenfolge, in der
    // die Datenbank geliefert hat. Wer die Sortierung der Rechnungssuche
    // aendert, aendert damit, welche Rechnung Geld bekommt.
    const a = rechnung({ id: 'inv-a', invoice_number: 'RE-2026-0001', invoice_number_formatted: 'RE-2026-0001' })
    const b = rechnung({ id: 'inv-b', invoice_number: 'RE-2026-0002', invoice_number_formatted: 'RE-2026-0002' })
    const basis = schreibwegOk([a, b])
    const fake = erstelleFakeSupabase(aufruf => {
      if (aufruf.tabelle === 'sepa_mandates') {
        return aufruf.terminal === 'single'
          ? { data: { id: 'm-1', client_id: 'kunde-1', debtor_iban: 'DE02120300000000202051' } }
          : { data: [{ id: 'm-1', client_id: 'kunde-1' }] }
      }
      return basis(aufruf)
    })

    const ergebnis = await matchBuchung(
      fake.client,
      buchung({
        mandateId: 'MND-1',
        debitorIban: 'DE02120300000000202051',
        debitorName: 'Anna Musterfrau',
        betragCent: 9_999, // absichtlich kein Betragstreffer
      }),
      EINGANG, ORG,
    )

    // 35 (Mandat→Kunde) + 25 (IBAN→Mandat) + 15 (Name) = 75 ≥ 70
    expect(ergebnis.confidence).toBe(75)
    expect(ergebnis.status).toBe('automatisch')
    expect(ergebnis.kandidaten[0].confidence).toBe(ergebnis.kandidaten[1].confidence)
    expect(
      ergebnis.kandidaten[0].invoiceId,
      'Gleichstand wird nach Eingangsreihenfolge aufgeloest — stabil, aber '
      + 'fachlich willkuerlich.',
    ).toBe('inv-a')
  })

  test('kommt ein Betragstreffer dazu, gewinnt die richtige Rechnung eindeutig', async () => {
    const a = rechnung({ id: 'inv-a', total_amount: 500, invoice_number: 'RE-2026-0001', invoice_number_formatted: 'RE-2026-0001' })
    const b = rechnung({ id: 'inv-b', total_amount: 125, invoice_number: 'RE-2026-0002', invoice_number_formatted: 'RE-2026-0002' })
    const basis = schreibwegOk([a, b])
    const fake = erstelleFakeSupabase(aufruf => {
      if (aufruf.tabelle === 'sepa_mandates') {
        return aufruf.terminal === 'single'
          ? { data: { id: 'm-1', client_id: 'kunde-1', debtor_iban: 'DE02120300000000202051' } }
          : { data: [{ id: 'm-1', client_id: 'kunde-1' }] }
      }
      return basis(aufruf)
    })

    const ergebnis = await matchBuchung(
      fake.client,
      buchung({ mandateId: 'MND-1', debitorIban: 'DE02120300000000202051', betragCent: 12_500 }),
      EINGANG, ORG,
    )

    expect(ergebnis.kandidaten[0].invoiceId).toBe('inv-b')
    expect(ergebnis.kandidaten[0].confidence).toBeGreaterThan(ergebnis.kandidaten[1].confidence)
  })
})
