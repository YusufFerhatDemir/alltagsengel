/**
 * Bewerbung und Kundenanfrage sind ein Gegensatzpaar.
 * @see lib/admin/ops.ts
 *
 * Zwei Schreibwege fassen `lead_inquiries` an: die Bewerbungen über
 * app/admin/applications/actions.ts, die Kundenanfragen über
 * app/admin/posteingang/actions.ts. Sie dürfen sich weder überschneiden
 * noch eine Lücke lassen — sonst ist eine Zeile entweder von beiden
 * beschreibbar oder von keinem.
 */
import { describe, it, expect } from 'vitest'
import {
  istBewerbung, istKundenanfrage, BEWERBUNG_FILTER,
  ANFRAGE_FILTER_ART, ANFRAGE_FILTER_NICHT_SOURCE,
} from '@/lib/admin/ops'

/** Alle Kombinationen, die live vorkommen — und ein paar, die nicht sollten. */
const FAELLE = [
  { art: 'bewerbung', source: 'engel-bewerbung' },
  { art: 'bewerbung', source: 'indeed' },
  { art: 'anfrage', source: 'engel-bewerbung' },   // 34 Altbestände
  { art: 'anfrage', source: 'rueckruf' },
  { art: 'anfrage', source: 'terminbuchung' },
  { art: 'anfrage', source: 'alltagsbegleitung-hanau' },
  { art: 'anfrage', source: null },
  { art: null, source: null },
  { art: null, source: 'engel-bewerbung' },
  { art: 'zahlung', source: 'irgendwas' },
]

describe('Komplement', () => {
  it('jede Zeile fällt in genau einen der beiden Wege', () => {
    for (const f of FAELLE) {
      const beides = istBewerbung(f) && istKundenanfrage(f)
      const keines = !istBewerbung(f) && !istKundenanfrage(f)
      expect(beides, `in beiden: ${JSON.stringify(f)}`).toBe(false)
      expect(keines, `in keinem: ${JSON.stringify(f)}`).toBe(false)
    }
  })

  it('die 34 Altbestände zählen als Bewerbung, nicht als Anfrage', () => {
    // Der Fall, an dem ein Filter auf `art` allein scheitert: live tragen
    // 34 von 36 Bewerbungen art='anfrage', weil das Website-Formular die
    // Spalte nicht setzt.
    const alt = { art: 'anfrage', source: 'engel-bewerbung' }
    expect(istBewerbung(alt)).toBe(true)
    expect(istKundenanfrage(alt)).toBe(false)
  })

  it('eine echte Kundenanfrage zählt als Anfrage', () => {
    expect(istKundenanfrage({ art: 'anfrage', source: 'rueckruf' })).toBe(true)
  })

  it('die PostgREST-Bedingungen nennen dieselben Werte wie der Code', () => {
    // Ohne diese Prüfung koennte jemand den Filter-String aendern und die
    // Funktion vergessen — die Datenbank filterte dann anders als die App.
    expect(BEWERBUNG_FILTER).toContain(`source.eq.${ANFRAGE_FILTER_NICHT_SOURCE}`)
    expect(BEWERBUNG_FILTER).toContain('art.eq.bewerbung')
    expect(ANFRAGE_FILTER_ART).toBe('anfrage')
  })
})
