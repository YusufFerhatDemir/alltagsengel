/**
 * Track 13, Befund B5 — Aufbewahrung am unauthentifizierten Perimeter.
 *
 * Geprueft wird auf dem filterprotokollierenden Doppelgaenger, nicht auf
 * einem Stub mit fester Antwort: die interessanten Fehler dieses Moduls
 * sind Fehler in den FILTERN (falsche Zeitspalte, fehlender
 * IP-nicht-NULL-Filter, Loeschung ohne Stichtag). Ein Stub, der Filter
 * verschluckt, kann sie prinzipiell nicht finden.
 */
import { describe, it, expect } from 'vitest'
import {
  AUFBEWAHRUNG,
  NICHT_AUTOMATISCH,
  fuehreAufbewahrungAus,
  stichtag,
  type AufbewahrungsClient,
} from '@/lib/perimeter/aufbewahrung'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const JETZT = new Date('2026-08-28T12:00:00.000Z')

function fake(antwort: (a: FakeAufruf) => { data?: unknown; count?: number | null; error?: { message: string } | null } | undefined = () => undefined) {
  const f = erstelleFakeSupabase(antwort)
  return { f, client: f.client as unknown as AufbewahrungsClient }
}

describe('stichtag', () => {
  it('rechnet Tage rueckwaerts', () => {
    expect(stichtag(JETZT, 7)).toBe('2026-08-21T12:00:00.000Z')
    expect(stichtag(JETZT, 90)).toBe('2026-05-30T12:00:00.000Z')
  })

  it('ergibt bei 0 Tagen den Zeitpunkt selbst', () => {
    expect(stichtag(JETZT, 0)).toBe(JETZT.toISOString())
  })
})

describe('Der Katalog selbst', () => {
  it('nennt fuer jede Tabelle eine Begruendung', () => {
    for (const e of AUFBEWAHRUNG) {
      expect(e.begruendung.length, `${e.tabelle} ohne Begruendung`).toBeGreaterThan(40)
    }
    for (const e of NICHT_AUTOMATISCH) {
      expect(e.begruendung.length, `${e.tabelle} ohne Begruendung`).toBeGreaterThan(40)
    }
  })

  it('kuerzt die IP frueher, als es die Zeile loescht', () => {
    // Waere es andersherum, liefe die IP-Kuerzung ins Leere: die Zeile
    // waere zu dem Zeitpunkt schon weg.
    for (const e of AUFBEWAHRUNG) {
      if (e.ipFristTage != null) {
        expect(e.ipFristTage, `${e.tabelle}`).toBeLessThan(e.loeschFristTage)
      }
    }
  })

  it('fuehrt jede Tabelle nur einmal, und in keiner Liste doppelt', () => {
    const auto = AUFBEWAHRUNG.map(e => e.tabelle)
    const nicht = NICHT_AUTOMATISCH.map(e => e.tabelle)
    expect(new Set(auto).size).toBe(auto.length)
    expect(auto.filter(t => nicht.includes(t))).toEqual([])
  })

  it('fasst lead_inquiries und newsletter_subscribers ausdruecklich NICHT an', () => {
    // Beide sind Geschaefts- bzw. Nachweisdaten; eine erfundene Frist
    // waere dort schaedlich. Der Eintrag in NICHT_AUTOMATISCH macht aus
    // „wird nicht geloescht" eine Entscheidung statt eines Vergessens.
    const nicht = NICHT_AUTOMATISCH.map(e => e.tabelle)
    expect(nicht).toContain('lead_inquiries')
    expect(nicht).toContain('newsletter_subscribers')
  })

  it('nennt fuer analytics_events KEINE IP-Spalte', () => {
    // Die Tabelle traegt `ip_hash`, nicht `ip` — dort ist nichts zu
    // kuerzen. Ein Eintrag waere ein Filter auf eine Spalte, die den
    // Wert gar nicht roh haelt.
    const e = AUFBEWAHRUNG.find(x => x.tabelle === 'analytics_events')
    expect(e?.ipSpalte).toBeUndefined()
  })
})

describe('Trockenlauf', () => {
  it('schreibt NICHTS — kein update, kein delete', async () => {
    const { f, client } = fake(() => ({ count: 42 }))
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: true })

    const schreibend = f.aufrufe.filter(a => a.operation === 'update' || a.operation === 'delete')
    expect(schreibend, 'Trockenlauf hat geschrieben').toEqual([])
    expect(f.aufrufe.every(a => a.operation === 'select')).toBe(true)
  })

  it('zaehlt mit head:true statt Zeilen zu holen', async () => {
    const { f, client } = fake(() => ({ count: 7 }))
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: true })
    expect(f.aufrufe.every(a => a.head === true)).toBe(true)
    expect(f.aufrufe.every(a => a.zaehlmodus === 'exact')).toBe(true)
  })

  it('meldet die gezaehlten Mengen und markiert sich als Trockenlauf', async () => {
    const { client } = fake(() => ({ count: 10 }))
    const e = await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: true })
    expect(e.trockenlauf).toBe(true)
    // 3 Tabellen mit IP-Kuerzung à 10, 4 Tabellen mit Loeschung à 10.
    const mitIp = AUFBEWAHRUNG.filter(x => x.ipSpalte).length
    expect(e.ipGekuerztGesamt).toBe(mitIp * 10)
    expect(e.geloeschtGesamt).toBe(AUFBEWAHRUNG.length * 10)
    expect(e.fehler).toBe(0)
  })

  it('filtert die Zaehlung auf den Stichtag der jeweiligen Tabelle', async () => {
    const { f, client } = fake(() => ({ count: 0 }))
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: true })

    for (const e of AUFBEWAHRUNG) {
      const aufrufe = f.auf(e.tabelle)
      const loeschAufruf = aufrufe[aufrufe.length - 1]
      expect(
        hatFilter(loeschAufruf, 'lt', e.zeitSpalte, stichtag(JETZT, e.loeschFristTage)),
        `${e.tabelle}: Loeschzaehlung ohne korrekten Stichtag`,
      ).toBe(true)
    }
  })
})

describe('Scharfer Lauf', () => {
  it('setzt die IP-Spalte auf NULL — und nur bei Zeilen, die eine haben', async () => {
    const { f, client } = fake(() => ({ data: [{ id: '1' }] }))
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: false })

    for (const e of AUFBEWAHRUNG.filter(x => x.ipSpalte)) {
      const update = f.auf(e.tabelle).find(a => a.operation === 'update')
      expect(update, `${e.tabelle}: keine IP-Kuerzung`).toBeDefined()
      expect(update!.payload).toEqual({ [e.ipSpalte!]: null })
      expect(hatFilter(update, 'lt', e.zeitSpalte, stichtag(JETZT, e.ipFristTage!))).toBe(true)
      // Ohne den not-is-null-Filter wuerde der Lauf jede Nacht dieselben
      // laengst gekuerzten Zeilen erneut anfassen und ihre Zahl melden.
      expect(
        hatFilter(update, 'not', e.ipSpalte!),
        `${e.tabelle}: IP-Kuerzung ohne "nicht schon NULL"-Filter`,
      ).toBe(true)
    }
  })

  it('weist jede Aenderung mit .select() nach', async () => {
    // PostgREST meldet keinen Fehler, wenn NULL Zeilen getroffen wurden.
    // Ohne .select() koennte dieser Lauf jahrelang „erfolgreich" nichts tun.
    const { f, client } = fake(() => ({ data: [{ id: '1' }, { id: '2' }] }))
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: false })

    for (const a of f.aufrufe.filter(x => x.operation !== 'select')) {
      expect(a.spalten, `${a.tabelle}/${a.operation} ohne Wirkungsnachweis`).toBe('id')
    }
  })

  it('loescht mit Stichtag — niemals ungefiltert', async () => {
    const { f, client } = fake(() => ({ data: [] }))
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: false })

    for (const a of f.aufrufe.filter(x => x.operation === 'delete')) {
      const eintrag = AUFBEWAHRUNG.find(e => e.tabelle === a.tabelle)!
      expect(
        hatFilter(a, 'lt', eintrag.zeitSpalte, stichtag(JETZT, eintrag.loeschFristTage)),
        `${a.tabelle}: Loeschung ohne Stichtag — das waere ein TRUNCATE`,
      ).toBe(true)
    }
  })

  it('zaehlt die tatsaechlich getroffenen Zeilen, nicht die erhofften', async () => {
    const { client } = fake(a => (a.operation === 'delete' ? { data: [{ id: '1' }] } : { data: [] }))
    const e = await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: false })
    expect(e.ipGekuerztGesamt).toBe(0)
    expect(e.geloeschtGesamt).toBe(AUFBEWAHRUNG.length)
  })

  it('faesst KEINE Tabelle aus NICHT_AUTOMATISCH an', async () => {
    // Die Gegenprobe zur Entscheidung: waere eine dieser Tabellen im
    // Katalog gelandet, verschwaenden offene Beratungsanfragen oder die
    // Sperrliste der Abmeldungen.
    const { f, client } = fake(() => ({ data: [] }))
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: false })
    const beruehrt = new Set(f.aufrufe.map(a => a.tabelle))
    for (const e of NICHT_AUTOMATISCH) {
      expect(beruehrt.has(e.tabelle), `${e.tabelle} wurde angefasst`).toBe(false)
    }
  })
})

describe('Fehlerverhalten', () => {
  it('ein Fehler an einer Tabelle haelt die anderen nicht auf', async () => {
    const { f, client } = fake(a =>
      a.tabelle === 'visitors' ? { error: { message: 'kaputt' } } : { data: [{ id: '1' }] },
    )
    const e = await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: false })

    expect(e.fehler).toBe(1)
    expect(e.tabellen.find(t => t.tabelle === 'visitors')?.fehler).toContain('kaputt')
    // Die uebrigen drei sind trotzdem gelaufen.
    for (const t of e.tabellen.filter(t => t.tabelle !== 'visitors')) {
      expect(t.fehler).toBeUndefined()
    }
    expect(f.auf('conversions').length).toBeGreaterThan(0)
  })

  it('bricht die Tabelle ab, sobald ihre erste Stufe scheitert', async () => {
    // Wenn die IP-Kuerzung scheitert, darf die Loeschung derselben Tabelle
    // nicht trotzdem laufen — sonst verschwaenden Zeilen, deren IP noch
    // drinsteht, ohne dass der Fehler jemanden aufgehalten haette.
    const { f, client } = fake(a =>
      a.tabelle === 'visitors' && a.operation === 'update'
        ? { error: { message: 'update kaputt' } }
        : { data: [{ id: '1' }] },
    )
    await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: false })
    expect(f.auf('visitors').filter(a => a.operation === 'delete')).toEqual([])
  })

  it('meldet einen Fehler, statt ihn als 0 auszuweisen', async () => {
    const { client } = fake(() => ({ error: { message: 'kaputt' } }))
    const e = await fuehreAufbewahrungAus(client, { jetzt: JETZT, trockenlauf: true })
    expect(e.fehler).toBe(AUFBEWAHRUNG.length)
    expect(e.geloeschtGesamt).toBe(0)
  })
})
