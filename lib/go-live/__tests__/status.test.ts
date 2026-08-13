/**
 * Tests für den Go-Live-Status.
 *
 * Schwerpunkt liegt auf den Regeln, die falsche Zusagen verhindern:
 *   - nichts wird READY, solange eine Pflichtprüfung offen ist
 *   - eine nicht ausführbare Prüfung (null) zählt wie „nicht erfüllt"
 *   - extern schlägt intern bei der Statusbildung
 *   - der SEPA-Platzhalter führt zwingend zu BLOCKED
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { baueBereiche, SEPA_PLATZHALTER_ID, type Messwerte, type GoLiveBereich } from '../status'

const ENV_KEYS = [
  'ITSG_ZERTIFIZIERT', 'SGB_V_302_FREIGABE', 'KIM_AKTIV', 'COACH_DIPA_MODUS',
  'SECON_ZERT_PASSWORT', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY',
] as const

const ENV_SICHERUNG = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))

// Ausgangslage der Tests: die Pflicht-Env-Variablen des Betriebs sind gesetzt,
// die drei externen Freigabe-Gates NICHT. Nur so misst ein Test die Fachlogik
// statt die zufällige Umgebung des Testrechners.
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'] as const) {
    process.env[k] = 'gesetzt-fuer-test'
  }
  for (const k of ['ITSG_ZERTIFIZIERT', 'SGB_V_302_FREIGABE', 'KIM_AKTIV', 'COACH_DIPA_MODUS', 'SECON_ZERT_PASSWORT'] as const) {
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ENV_SICHERUNG[k] === undefined) delete process.env[k]
    else process.env[k] = ENV_SICHERUNG[k]
  }
})

/** Leerer Ausgangszustand: nichts eingerichtet, nichts freigegeben. */
function leereMesswerte(): Messwerte {
  return {
    organisation: { name: 'Testorganisation', ik_nummer: null, sepa_creditor_id: null, iban: null },
    tarife: [],
    leistungspreise: [],
    kunden: 0,
    einsaetze: 0,
    rechnungen: 0,
    rechnungenOhneFaelligkeit: 0,
    zertifikate: [],
    bundeslaender: [],
    annahmestellen: [],
    kostentraeger: 0,
    sgbVVersionen: [],
    sgbVRouting: 0,
    kimKonfig: [],
    kimKarten: [],
    kimVersionen: [],
    bewertungen: [],
    testMandanten: [],
    anonBewertungen: { lesbar: false, quelle: '0 Zeilen' },
    fehler: [],
  }
}

/** Zustand, in dem alles intern Lösbare erledigt ist. */
function interneMesswerte(): Messwerte {
  return {
    ...leereMesswerte(),
    organisation: { name: 'Testorganisation', ik_nummer: '460629986', sepa_creditor_id: 'DE00ZZZ00000000000', iban: 'DE00000000000000000000' },
    tarife: [
      { rechtsgrundlage: 'privat', tarif_status: 'verified', ist_aktiv: true },
      { rechtsgrundlage: '§45b SGB XI', tarif_status: 'verified', ist_aktiv: true },
      { rechtsgrundlage: '§39 SGB XI', tarif_status: 'verified', ist_aktiv: true },
    ],
    kunden: 4,
    einsaetze: 30,
    rechnungen: 5,
    kostentraeger: 2,
  }
}

function hole(bereiche: GoLiveBereich[], id: string): GoLiveBereich {
  const b = bereiche.find(x => x.id === id)
  assert.ok(b, `Bereich ${id} fehlt`)
  return b
}

describe('baueBereiche — Grundstruktur', () => {
  test('liefert genau die elf Geschäftsbereiche', () => {
    const bereiche = baueBereiche(leereMesswerte())
    assert.equal(bereiche.length, 11)
    assert.deepEqual(bereiche.map(b => b.id), [
      'pflege_software', 'privatabrechnung', 'entlastungsbetrag_45b', 'vp_kzp',
      'dta_105', 'sgb_v_302', 'kim_ti', 'dipa_service', 'dipa_erstattung',
      'security', 'production',
    ])
  })

  test('jeder Bereich hat Begründung und nächsten Schritt', () => {
    for (const b of baueBereiche(leereMesswerte())) {
      assert.ok(b.begruendung.length > 20, `${b.id}: Begründung zu dünn`)
      assert.ok(b.naechsterSchritt.length > 20, `${b.id}: nächster Schritt zu dünn`)
      assert.ok(b.pruefungen.length > 0, `${b.id}: keine Prüfungen`)
    }
  })

  test('READY setzt voraus, dass jede Pflichtprüfung erfüllt ist', () => {
    for (const b of baueBereiche(interneMesswerte())) {
      if (b.status !== 'ready') continue
      const offen = b.pruefungen.filter(p => p.relevanz === 'pflicht' && p.erfuellt !== true)
      assert.deepEqual(offen, [], `${b.id} ist READY trotz offener Pflichtprüfung`)
    }
  })
})

describe('Fail-Closed', () => {
  test('nicht prüfbare Werte (null) führen nie zu READY', () => {
    const m = { ...interneMesswerte(), kunden: null, einsaetze: null, rechnungen: null }
    const b = hole(baueBereiche(m), 'pflege_software')
    assert.notEqual(b.status, 'ready')
    assert.ok(b.pruefungen.some(p => p.wert === 'nicht prüfbar'))
  })

  test('nicht prüfbarer Anon-Zugriff blockiert Security', () => {
    const m = { ...interneMesswerte(), anonBewertungen: { lesbar: null, quelle: 'Netzwerkfehler' } }
    assert.equal(hole(baueBereiche(m), 'security').status, 'blocked')
  })
})

describe('Statusbildung — extern schlägt intern', () => {
  test('offene externe und interne Pflichtprüfung ergibt EXTERNAL', () => {
    // § 105: Zertifikate/Transport extern offen, Kostenträger intern offen.
    const m = { ...interneMesswerte(), kostentraeger: 0 }
    const b = hole(baueBereiche(m), 'dta_105')
    assert.equal(b.status, 'external')
    assert.equal(b.zustaendig, 'extern')
    // Die interne Lücke verschwindet dabei nicht aus der Anzeige.
    const intern = b.pruefungen.find(p => p.zustaendig === 'intern' && p.erfuellt !== true)
    assert.ok(intern, 'interne Lücke muss sichtbar bleiben')
  })

  test('nur interne Pflichtprüfungen offen ergibt BLOCKED', () => {
    const m = { ...interneMesswerte(), rechnungenOhneFaelligkeit: 3 }
    assert.equal(hole(baueBereiche(m), 'privatabrechnung').status, 'blocked')
  })
})

describe('Tarif-Verifizierung', () => {
  test('blockierte § 45b-Tarife verhindern READY', () => {
    const m = interneMesswerte()
    m.tarife.push({ rechtsgrundlage: '§45b SGB XI', tarif_status: 'blocked', ist_aktiv: true })
    const b = hole(baueBereiche(m), 'entlastungsbetrag_45b')
    assert.equal(b.status, 'blocked')
    assert.match(b.begruendung, /fail-closed/)
  })

  test('ohne verifizierten VP/KZP-Tarif kein READY', () => {
    const m = interneMesswerte()
    m.tarife = m.tarife.map(t => t.rechtsgrundlage === '§39 SGB XI' ? { ...t, tarif_status: 'unverified' } : t)
    assert.equal(hole(baueBereiche(m), 'vp_kzp').status, 'blocked')
  })

  test('gesetzliche Budgetwerte werden als gemessener Wert ausgewiesen, nicht erfunden', () => {
    const b = hole(baueBereiche(interneMesswerte()), 'entlastungsbetrag_45b')
    const p = b.pruefungen.find(x => x.label.includes('Entlastungsbetrag'))
    assert.ok(p)
    assert.match(p.wert, /\d+ € \/ Monat/)
  })

  test('inaktive Tarife zählen nicht als verifiziert', () => {
    const m = leereMesswerte()
    m.tarife = [{ rechtsgrundlage: 'privat', tarif_status: 'verified', ist_aktiv: false }]
    const p = hole(baueBereiche(m), 'privatabrechnung').pruefungen[0]
    assert.equal(p.erfuellt, false)
  })
})

describe('Externe Kanäle', () => {
  test('§ 105, § 302 und KIM sind ohne Freigaben EXTERNAL', () => {
    delete process.env.ITSG_ZERTIFIZIERT
    delete process.env.SGB_V_302_FREIGABE
    delete process.env.KIM_AKTIV
    const bereiche = baueBereiche(interneMesswerte())
    for (const id of ['dta_105', 'sgb_v_302', 'kim_ti']) {
      assert.equal(hole(bereiche, id).status, 'external', `${id} müsste EXTERNAL sein`)
    }
  })

  test('gesetztes Env-Gate allein macht keinen Kanal READY', () => {
    process.env.ITSG_ZERTIFIZIERT = 'true'
    process.env.SGB_V_302_FREIGABE = 'true'
    process.env.KIM_AKTIV = 'true'
    const bereiche = baueBereiche(interneMesswerte())
    for (const id of ['dta_105', 'sgb_v_302', 'kim_ti']) {
      assert.notEqual(hole(bereiche, id).status, 'ready', `${id} darf nicht allein am Env-Gate hängen`)
    }
  })

  test('DiPA-Kassenerstattung bleibt ohne BfArM-Nachweis EXTERNAL', () => {
    process.env.COACH_DIPA_MODUS = 'true'
    const b = hole(baueBereiche(interneMesswerte()), 'dipa_erstattung')
    assert.equal(b.status, 'external')
  })
})

describe('PflegeCoach als normaler Service', () => {
  test('abgeschalteter DiPA-Modus ist READY', () => {
    delete process.env.COACH_DIPA_MODUS
    assert.equal(hole(baueBereiche(interneMesswerte()), 'dipa_service').status, 'ready')
  })

  test('eingeschalteter DiPA-Modus ohne Listung ist BLOCKED', () => {
    process.env.COACH_DIPA_MODUS = 'true'
    const b = hole(baueBereiche(interneMesswerte()), 'dipa_service')
    assert.equal(b.status, 'blocked')
    assert.match(b.begruendung, /Kostenerstattung/)
  })
})

describe('Security', () => {
  test('anonym lesbare Bewertungen blockieren', () => {
    const m = { ...interneMesswerte(), anonBewertungen: { lesbar: true, quelle: '1 Zeile(n) anonym lesbar' } }
    assert.equal(hole(baueBereiche(m), 'security').status, 'blocked')
  })

  test('Seed-UUIDs in Bewertungen werden erkannt', () => {
    const m = {
      ...interneMesswerte(),
      bewertungen: [{ angel_id: '33333333-3333-3333-3333-333333333333', reviewer_id: '44444444-4444-4444-4444-444444444444' }],
    }
    const b = hole(baueBereiche(m), 'security')
    assert.equal(b.status, 'blocked')
    assert.match(b.begruendung, /Seed/)
  })

  test('echte UUIDs gelten nicht als Seed-Daten', () => {
    const m = {
      ...interneMesswerte(),
      bewertungen: [{ angel_id: '927e9a57-5a08-4933-80da-b24dae79e593', reviewer_id: 'abbb388d-69e7-4c60-90df-94d19e4c5c45' }],
    }
    assert.equal(hole(baueBereiche(m), 'security').status, 'ready')
  })

  test('MFA und Pentest sind Hinweise, kein Statusblocker', () => {
    const b = hole(baueBereiche(interneMesswerte()), 'security')
    assert.equal(b.status, 'ready')
    assert.equal(b.pruefungen.filter(p => p.relevanz === 'hinweis').length, 2)
  })
})

describe('Production', () => {
  test('SEPA-Platzhalter erzwingt BLOCKED', () => {
    const m = interneMesswerte()
    m.organisation = { ...m.organisation!, sepa_creditor_id: SEPA_PLATZHALTER_ID }
    const b = hole(baueBereiche(m), 'production')
    assert.equal(b.status, 'blocked')
    assert.match(b.begruendung, /Platzhalter/)
    assert.match(b.naechsterSchritt, /Bundesbank/)
  })

  test('fehlende Gläubiger-ID ist ebenfalls nicht READY', () => {
    const m = interneMesswerte()
    m.organisation = { ...m.organisation!, sepa_creditor_id: null }
    assert.notEqual(hole(baueBereiche(m), 'production').status, 'ready')
  })

  test('Testmandanten in der Produktions-DB blockieren', () => {
    const m = { ...interneMesswerte(), testMandanten: [{ id: 'a', name: 'E2E_TEST_A' }, { id: 'b', name: 'E2E_TEST_B' }] }
    const b = hole(baueBereiche(m), 'production')
    assert.equal(b.status, 'blocked')
    // Der Wert muss die Mandanten benennen — eine blosse Zahl sagt nicht,
    // welcher Datensatz weg soll.
    const p = b.pruefungen.find(x => x.label.includes('Testmandanten'))
    assert.ok(p)
    assert.match(p.wert, /E2E_TEST_A/)
    assert.match(p.wert, /E2E_TEST_B/)
  })

  test('nicht prüfbare Testmandanten-Abfrage gilt als nicht erfüllt', () => {
    const m = { ...interneMesswerte(), testMandanten: null }
    const p = hole(baueBereiche(m), 'production').pruefungen.find(x => x.label.includes('Testmandanten'))
    assert.ok(p)
    assert.equal(p.erfuellt, false)
    assert.equal(p.wert, 'nicht prüfbar')
  })

  test('fehlende Pflicht-Env-Variablen werden benannt', () => {
    delete process.env.RESEND_API_KEY
    const p = hole(baueBereiche(interneMesswerte()), 'production')
      .pruefungen.find(x => x.label.includes('Env-Variablen'))
    assert.ok(p)
    assert.equal(p.erfuellt, false)
    assert.match(p.wert, /RESEND_API_KEY/)
  })
})
