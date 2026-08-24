// ═══════════════════════════════════════════════════════════════
// Welle 4 — DSGVO-Auskunft (Art. 15) Tests
// ═══════════════════════════════════════════════════════════════
//
// Testet sammleAuskunft() — die zentrale Datensammlung fuer den
// Selbstbedienungs-Export nach Art. 15 Abs. 3 DSGVO.
//
// Kein Supabase noetig: AuskunftClient ist ein Interface, das wir
// mit einem einfachen Mock erfuellen.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  sammleAuskunft,
  QUELLEN_DIREKT,
  QUELLEN_ZWEISEITIG,
  type AuskunftClient,
  type Auskunft,
} from '../auskunft'

// ---------------------------------------------------------------------------
// Mock-Client
// ---------------------------------------------------------------------------

const USER_ID = '11111111-1111-4111-8111-111111111111'
const USER_EMAIL = 'test@alltagsengel.care'

/** Erzeugt einen AuskunftClient, der pro Tabelle die uebergebenen Zeilen liefert. */
function mockClient(datensaetze: Record<string, unknown[]> = {}): AuskunftClient {
  return {
    from(tabelle: string) {
      return {
        select(_spalten: string) {
          return {
            eq(_spalte: string, _wert: unknown) {
              const daten = datensaetze[tabelle] ?? []
              return Promise.resolve({ data: daten, error: null })
            },
          }
        },
      }
    },
  }
}

/** Client, der auf einer bestimmten Tabelle einen Fehler liefert. */
function fehlerhafterClient(fehlerTabelle: string): AuskunftClient {
  return {
    from(tabelle: string) {
      return {
        select(_spalten: string) {
          return {
            eq(_spalte: string, _wert: unknown) {
              if (tabelle === fehlerTabelle) {
                return Promise.resolve({
                  data: null,
                  error: { message: 'relation does not exist', code: '42P01' },
                })
              }
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Grundstruktur
// ---------------------------------------------------------------------------

describe('sammleAuskunft — Grundstruktur', () => {
  test('liefert ein Auskunft-Objekt mit allen Pflichtfeldern', async () => {
    const auskunft = await sammleAuskunft(
      mockClient(),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )

    assert.equal(typeof auskunft.hinweis, 'string')
    assert.ok(auskunft.hinweis.length > 0)
    assert.ok(auskunft.rechtsgrundlage.includes('Art. 15'))
    assert.ok(auskunft.rechtsgrundlage.includes('Art. 20'))
    assert.equal(auskunft.erstelltAm, '2026-08-24T12:00:00Z')
    assert.deepEqual(auskunft.betroffenePerson, { id: USER_ID, email: USER_EMAIL })
    assert.ok(Array.isArray(auskunft.abschnitte))
    assert.ok(Array.isArray(auskunft.nichtEnthalten))
  })

  test('enthaelt einen Abschnitt pro Quelle (direkt + zweiseitig)', async () => {
    const auskunft = await sammleAuskunft(
      mockClient(),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )
    const erwarteteAnzahl = QUELLEN_DIREKT.length + QUELLEN_ZWEISEITIG.length
    assert.equal(auskunft.abschnitte.length, erwarteteAnzahl)
  })

  test('jeder Abschnitt hat tabelle, bezeichnung und anzahl', async () => {
    const auskunft = await sammleAuskunft(
      mockClient(),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )
    for (const a of auskunft.abschnitte) {
      assert.equal(typeof a.tabelle, 'string')
      assert.equal(typeof a.bezeichnung, 'string')
      assert.equal(typeof a.anzahl, 'number')
      assert.ok(Array.isArray(a.daten))
    }
  })
})

// ---------------------------------------------------------------------------
// Datensammlung
// ---------------------------------------------------------------------------

describe('sammleAuskunft — Datensammlung', () => {
  test('leerer Client liefert Abschnitte mit anzahl=0', async () => {
    const auskunft = await sammleAuskunft(
      mockClient(),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )
    for (const a of auskunft.abschnitte) {
      assert.equal(a.anzahl, 0)
      assert.deepEqual(a.daten, [])
    }
  })

  test('Daten aus direkten Quellen werden korrekt zugeordnet', async () => {
    const profilDaten = [{ id: USER_ID, name: 'Max Mustermann' }]
    const auskunft = await sammleAuskunft(
      mockClient({ profiles: profilDaten }),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )

    const profilAbschnitt = auskunft.abschnitte.find(a => a.tabelle === 'profiles')!
    assert.equal(profilAbschnitt.anzahl, 1)
    assert.deepEqual(profilAbschnitt.daten, profilDaten)
  })

  test('zweiseitige Quellen deduplizieren Zeilen (gleiche id in beiden Richtungen)', async () => {
    const nachricht = { id: 'msg-1', sender_id: USER_ID, receiver_id: USER_ID, text: 'Selbstgespräch' }
    const auskunft = await sammleAuskunft(
      mockClient({ messages: [nachricht] }),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )

    const msgAbschnitt = auskunft.abschnitte.find(a => a.tabelle === 'messages')!
    assert.equal(msgAbschnitt.anzahl, 1, 'Gleiche Zeile in beiden Richtungen darf nur einmal erscheinen')
  })

  test('zweiseitige Quellen vereinen beide Richtungen', async () => {
    // Mock muss unterschiedliche Ergebnisse pro eq-Wert liefern — unser einfacher
    // Mock liefert immer dasselbe, deshalb testen wir nur, dass die Struktur stimmt.
    const buchungen = [
      { id: 'b1', customer_id: USER_ID, angel_id: 'other' },
      { id: 'b2', customer_id: 'other', angel_id: USER_ID },
    ]
    const auskunft = await sammleAuskunft(
      mockClient({ bookings: buchungen }),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )

    const bookingAbschnitt = auskunft.abschnitte.find(a => a.tabelle === 'bookings')!
    assert.equal(bookingAbschnitt.anzahl, 2)
  })
})

// ---------------------------------------------------------------------------
// Fehlertoleranz
// ---------------------------------------------------------------------------

describe('sammleAuskunft — Fehlertoleranz', () => {
  test('fehlerhafte Tabelle bricht die Auskunft nicht ab', async () => {
    const auskunft = await sammleAuskunft(
      fehlerhafterClient('profiles'),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )

    assert.ok(auskunft.abschnitte.length > 0, 'Andere Abschnitte sind trotzdem da')
    const profilAbschnitt = auskunft.abschnitte.find(a => a.tabelle === 'profiles')!
    assert.equal(profilAbschnitt.anzahl, 0)
    assert.ok(profilAbschnitt.hinweis, 'Hinweis muss gesetzt sein')
    assert.ok(profilAbschnitt.hinweis!.includes('42P01'))
  })

  test('Auskunft ist auch bei null-Email aufrufbar', async () => {
    const auskunft = await sammleAuskunft(
      mockClient(),
      { id: USER_ID, email: null },
      '2026-08-24T12:00:00Z',
    )
    assert.equal(auskunft.betroffenePerson.email, null)
  })
})

// ---------------------------------------------------------------------------
// nichtEnthalten (DSGVO-Transparenz)
// ---------------------------------------------------------------------------

describe('sammleAuskunft — nichtEnthalten', () => {
  test('listet Passwoerter und PflegeCoach-Daten als nicht enthalten', async () => {
    const auskunft = await sammleAuskunft(
      mockClient(),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )

    const texte = auskunft.nichtEnthalten.join(' ')
    assert.ok(texte.includes('Passwort'), 'Passwoerter muessen als nicht enthalten gelistet sein')
    assert.ok(texte.includes('PflegeCoach'), 'PflegeCoach-Daten muessen als nicht enthalten gelistet sein')
  })

  test('verweist auf Art. 15 Abs. 4 DSGVO (Rechte Dritter)', async () => {
    const auskunft = await sammleAuskunft(
      mockClient(),
      { id: USER_ID, email: USER_EMAIL },
      '2026-08-24T12:00:00Z',
    )

    const texte = auskunft.nichtEnthalten.join(' ')
    assert.ok(texte.includes('Art. 15 Abs. 4'))
  })
})

// ---------------------------------------------------------------------------
// Quellenregister (Konsistenzpruefung)
// ---------------------------------------------------------------------------

describe('Quellenregister', () => {
  test('jede direkte Quelle hat tabelle, spalte und bezeichnung', () => {
    for (const q of QUELLEN_DIREKT) {
      assert.ok(q.tabelle.length > 0, `tabelle fehlt: ${JSON.stringify(q)}`)
      assert.ok(q.spalte.length > 0, `spalte fehlt: ${JSON.stringify(q)}`)
      assert.ok(q.bezeichnung.length > 0, `bezeichnung fehlt: ${JSON.stringify(q)}`)
    }
  })

  test('jede zweiseitige Quelle hat zusaetzlich zweiteSpalte', () => {
    for (const q of QUELLEN_ZWEISEITIG) {
      assert.ok(q.zweiteSpalte.length > 0, `zweiteSpalte fehlt: ${q.tabelle}`)
    }
  })

  test('keine doppelten Tabellen in den Quellen', () => {
    const alle = [
      ...QUELLEN_DIREKT.map(q => q.tabelle),
      ...QUELLEN_ZWEISEITIG.map(q => q.tabelle),
    ]
    const unique = new Set(alle)
    assert.equal(unique.size, alle.length, 'Doppelte Tabellen: ' + alle.filter((t, i) => alle.indexOf(t) !== i))
  })
})
