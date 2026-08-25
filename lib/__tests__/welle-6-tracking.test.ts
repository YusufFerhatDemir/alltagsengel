// ═══════════════════════════════════════════════════════════════
// Welle 6 — Conversion-Tracking (lib/tracking.ts)
// ═══════════════════════════════════════════════════════════════
//
// Alle sechs track*-Funktionen sind reine Absender: sie schreiben in
// window.dataLayer und rufen gtag/fbq/ttq auf. Zwei Dinge werden geprüft:
//
//   1. SSR-Sicherheit — ohne `window` darf keine der Funktionen werfen.
//      Sie werden aus Client-Komponenten aufgerufen, die serverseitig
//      vorgerendert werden; ein Wurf hier reißt die Seite mit.
//   2. Die Nutzlast — welches Event mit welchen Feldern im dataLayer
//      landet. Das ist die einzige Stelle, an der die Feldnamen der
//      Ads-/GA4-Auswertung festgeschrieben sind.
//
// Das window wird als Doppelgänger gestellt und danach wieder entfernt.
// ═══════════════════════════════════════════════════════════════

import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  trackRegistration,
  trackBooking,
  trackKrankenfahrt,
  trackContactRequest,
  trackLandingPageView,
  trackPhoneClick,
} from '../tracking'

type Aufruf = { args: unknown[] }

/** Setzt einen window-Doppelgänger und liefert die Protokolle zurück. */
function fensterStellen() {
  const dataLayer: Record<string, unknown>[] = []
  const gtag: Aufruf[] = []
  const fbq: Aufruf[] = []
  const ttq: Aufruf[] = []
  const g = globalThis as Record<string, unknown>

  g.window = {
    dataLayer,
    gtag: (...args: unknown[]) => { gtag.push({ args }) },
    fbq: (...args: unknown[]) => { fbq.push({ args }) },
    ttq: { track: (...args: unknown[]) => { ttq.push({ args }) } },
    // Der Attributions-Leser fragt Session-/LocalStorage ab.
    sessionStorage: { getItem: () => null },
    localStorage: { getItem: () => null },
  }
  g.sessionStorage = (g.window as Record<string, unknown>).sessionStorage
  g.localStorage = (g.window as Record<string, unknown>).localStorage
  // Der serverseitige Fallback setzt einen fetch ab — hier abfangen,
  // damit kein Netzwerkzugriff versucht wird.
  const fetchAufrufe: unknown[] = []
  g.fetch = (...args: unknown[]) => {
    fetchAufrufe.push(args)
    return Promise.resolve({ ok: true } as unknown)
  }

  return { dataLayer, gtag, fbq, ttq, fetchAufrufe }
}

function fensterAbraeumen() {
  const g = globalThis as Record<string, unknown>
  delete g.window
  delete g.sessionStorage
  delete g.localStorage
  delete g.fetch
}

/** Letztes dataLayer-Ereignis mit dem gesuchten Namen. */
function ereignis(dataLayer: Record<string, unknown>[], name: string) {
  const treffer = dataLayer.filter((e) => e.event === name)
  assert.ok(treffer.length > 0, `Kein dataLayer-Ereignis "${name}"`)
  return treffer[treffer.length - 1]
}

afterEach(fensterAbraeumen)

// ───────────────────────────────────────────────────────────────
describe('SSR-Sicherheit — ohne window', () => {
  test('keine Funktion wirft, wenn window fehlt', () => {
    assert.equal(typeof (globalThis as Record<string, unknown>).window, 'undefined')
    assert.doesNotThrow(() => trackRegistration('kunde'))
    assert.doesNotThrow(() => trackBooking({ service: 'Haushalt', duration: 2, isFlexible: false, totalPrice: 64 }))
    assert.doesNotThrow(() => trackKrankenfahrt({ distance: 12, vehicleType: 'pkw', totalPrice: 40 }))
    assert.doesNotThrow(() => trackContactRequest('startseite'))
    assert.doesNotThrow(() => trackLandingPageView('google'))
    assert.doesNotThrow(() => trackPhoneClick())
  })
})

// ───────────────────────────────────────────────────────────────
describe('trackRegistration', () => {
  test('legt dataLayer an und meldet die Rolle', () => {
    const p = fensterStellen()
    trackRegistration('engel')
    const e = ereignis(p.dataLayer, 'registration')
    assert.equal(e.user_role, 'engel')
    assert.equal(e.conversion_type, 'signup')
  })

  test('meldet die Google-Ads-Conversion mit Zielkennung und Betrag', () => {
    const p = fensterStellen()
    trackRegistration('kunde')
    const conv = p.gtag.find((a) => a.args[0] === 'event' && a.args[1] === 'conversion')
    assert.ok(conv, 'keine gtag-Conversion gemeldet')
    const daten = conv.args[2] as Record<string, unknown>
    assert.match(String(daten.send_to), /^AW-\d+\//)
    assert.equal(daten.value, 110)
    assert.equal(daten.currency, 'EUR')
  })

  test('meldet an Meta und TikTok denselben Betrag', () => {
    const p = fensterStellen()
    trackRegistration('fahrer')
    assert.deepEqual(p.fbq[0].args[0], 'track')
    assert.deepEqual(p.fbq[0].args[1], 'CompleteRegistration')
    assert.equal((p.fbq[0].args[2] as Record<string, unknown>).value, 110)
    assert.deepEqual(p.ttq[0].args[0], 'CompleteRegistration')
    assert.equal((p.ttq[0].args[1] as Record<string, unknown>).value, 110)
  })

  test('setzt den serverseitigen Fallback ab', () => {
    const p = fensterStellen()
    trackRegistration('kunde')
    assert.equal(p.fetchAufrufe.length, 1)
    const [url, optionen] = p.fetchAufrufe[0] as [string, Record<string, unknown>]
    assert.equal(url, '/api/track-conversion')
    assert.equal(optionen.method, 'POST')
  })

  test('jede Rolle wird unverändert durchgereicht', () => {
    for (const rolle of ['kunde', 'engel', 'fahrer'] as const) {
      const p = fensterStellen()
      trackRegistration(rolle)
      assert.equal(ereignis(p.dataLayer, 'registration').user_role, rolle)
      fensterAbraeumen()
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('trackBooking', () => {
  const buchung = { service: 'Haushaltshilfe', duration: 2.5, isFlexible: true, totalPrice: 80 }

  test('meldet Leistung, Dauer, Flexibilität und Betrag', () => {
    const p = fensterStellen()
    trackBooking(buchung)
    const e = ereignis(p.dataLayer, 'booking_created')
    assert.equal(e.service_type, 'Haushaltshilfe')
    assert.equal(e.duration_hours, 2.5)
    assert.equal(e.is_flexible, true)
    assert.equal(e.value, 80)
    assert.equal(e.currency, 'EUR')
    assert.equal(e.conversion_type, 'booking')
  })

  test('meldet den tatsächlichen Buchungsbetrag an Google Ads', () => {
    const p = fensterStellen()
    trackBooking(buchung)
    const conv = p.gtag.find((a) => a.args[1] === 'conversion')
    assert.equal((conv?.args[2] as Record<string, unknown>).value, 80)
  })

  test('bei Betrag 0 greift der Ersatzwert 50 — dokumentiertes Verhalten', () => {
    const p = fensterStellen()
    trackBooking({ ...buchung, totalPrice: 0 })
    const conv = p.gtag.find((a) => a.args[1] === 'conversion')
    assert.equal((conv?.args[2] as Record<string, unknown>).value, 50)
    // Im dataLayer steht weiterhin der echte Wert.
    assert.equal(ereignis(p.dataLayer, 'booking_created').value, 0)
  })

  test('meldet an Meta und TikTok mit dem Buchungsbetrag', () => {
    const p = fensterStellen()
    trackBooking(buchung)
    assert.equal(p.fbq[0].args[1], 'Schedule')
    assert.equal((p.fbq[0].args[2] as Record<string, unknown>).content_name, 'Haushaltshilfe')
    assert.equal(p.ttq[0].args[0], 'PlaceAnOrder')
    assert.equal((p.ttq[0].args[1] as Record<string, unknown>).value, 80)
  })
})

// ───────────────────────────────────────────────────────────────
describe('trackKrankenfahrt', () => {
  test('meldet Strecke, Fahrzeugart und Betrag', () => {
    const p = fensterStellen()
    trackKrankenfahrt({ distance: 18, vehicleType: 'rollstuhl', totalPrice: 55 })
    const e = ereignis(p.dataLayer, 'krankenfahrt_booked')
    assert.equal(e.distance_km, 18)
    assert.equal(e.vehicle_type, 'rollstuhl')
    assert.equal(e.value, 55)
    assert.equal(e.conversion_type, 'krankenfahrt')
  })

  test('läuft über dieselbe Buchungs-Conversion wie trackBooking', () => {
    const kf = fensterStellen()
    trackKrankenfahrt({ distance: 1, vehicleType: 'pkw', totalPrice: 20 })
    const kfZiel = (kf.gtag.find((a) => a.args[1] === 'conversion')?.args[2] as Record<string, unknown>).send_to
    fensterAbraeumen()

    const b = fensterStellen()
    trackBooking({ service: 'x', duration: 1, isFlexible: false, totalPrice: 20 })
    const bZiel = (b.gtag.find((a) => a.args[1] === 'conversion')?.args[2] as Record<string, unknown>).send_to

    assert.equal(kfZiel, bZiel)
  })

  test('meldet NICHT an Meta oder TikTok', () => {
    const p = fensterStellen()
    trackKrankenfahrt({ distance: 1, vehicleType: 'pkw', totalPrice: 20 })
    assert.equal(p.fbq.length, 0)
    assert.equal(p.ttq.length, 0)
  })
})

// ───────────────────────────────────────────────────────────────
describe('trackContactRequest', () => {
  test('meldet die Quelle als Lead', () => {
    const p = fensterStellen()
    trackContactRequest('startseite-hero')
    const e = ereignis(p.dataLayer, 'contact_request')
    assert.equal(e.source, 'startseite-hero')
    assert.equal(e.conversion_type, 'lead')
  })

  test('meldet an Meta und TikTok, aber ohne Google-Ads-Conversion', () => {
    const p = fensterStellen()
    trackContactRequest('footer')
    assert.equal(p.fbq[0].args[1], 'Contact')
    assert.equal(p.ttq[0].args[0], 'Contact')
    assert.equal(p.gtag.filter((a) => a.args[1] === 'conversion').length, 0)
  })
})

// ───────────────────────────────────────────────────────────────
describe('trackLandingPageView', () => {
  test('meldet Quelle und Kampagne', () => {
    const p = fensterStellen()
    trackLandingPageView('google', 'sommer-2026')
    const e = ereignis(p.dataLayer, 'landing_page_view')
    assert.equal(e.traffic_source, 'google')
    assert.equal(e.campaign, 'sommer-2026')
  })

  test('ohne Kampagne wird „organic" eingetragen, nicht undefined', () => {
    const p = fensterStellen()
    trackLandingPageView('direkt')
    assert.equal(ereignis(p.dataLayer, 'landing_page_view').campaign, 'organic')
  })

  test('löst keine Conversion aus — ein Seitenaufruf ist keine', () => {
    const p = fensterStellen()
    trackLandingPageView('google')
    assert.equal(p.gtag.length, 0)
    assert.equal(p.fbq.length, 0)
  })
})

// ───────────────────────────────────────────────────────────────
describe('trackPhoneClick', () => {
  test('meldet den Telefon-Lead', () => {
    const p = fensterStellen()
    trackPhoneClick()
    assert.equal(ereignis(p.dataLayer, 'phone_click').conversion_type, 'phone_lead')
  })

  test('mehrere Klicks erzeugen mehrere Einträge', () => {
    const p = fensterStellen()
    trackPhoneClick()
    trackPhoneClick()
    assert.equal(p.dataLayer.filter((e) => e.event === 'phone_click').length, 2)
  })
})

// ───────────────────────────────────────────────────────────────
describe('dataLayer', () => {
  test('ein bereits vorhandener dataLayer wird nicht überschrieben', () => {
    const p = fensterStellen()
    p.dataLayer.push({ event: 'fremd' })
    trackPhoneClick()
    assert.equal(p.dataLayer[0].event, 'fremd')
    assert.equal(p.dataLayer.length, 2)
  })

  test('jedes Ereignis trägt ein event-Feld', () => {
    const p = fensterStellen()
    trackPhoneClick()
    trackContactRequest('x')
    trackLandingPageView('y')
    for (const e of p.dataLayer) {
      assert.equal(typeof e.event, 'string')
      assert.ok((e.event as string).length > 0)
    }
  })
})
