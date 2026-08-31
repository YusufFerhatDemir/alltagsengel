// ═══════════════════════════════════════════════════════════════════════
// Zentrale Aufbewahrung: Fristen, Schutzbedingungen, Revisionsspur
// ═══════════════════════════════════════════════════════════════════════
//
// Drei Eigenschaften, an denen alles haengt, und die man nicht sieht,
// wenn man nur den Quelltext liest:
//
//   1. Eine Frist muss sich OHNE Deployment stellen lassen — und ein
//      unbrauchbarer Wert darf nicht stumm zur Vorgabe werden.
//   2. Die Schutzbedingung von `geo_events` prueft auf NULL. In SQL trifft
//      `= NULL` NIE etwas: waere der Filter als `eq` gebaut, liefe er ins
//      Leere und der Lauf loeschte auch die Standortbelege MIT
//      Leistungsnachweis. Der Unterschied zwischen `is` und `eq` ist hier
//      der Unterschied zwischen einer Sperre und keiner.
//   3. Eine Loeschung ohne Spur ist nicht nachweisbar (Art. 5 Abs. 2
//      DSGVO). Und eine Spur, die auch Nichtereignisse protokolliert,
//      liest nach kurzer Zeit niemand mehr.
//
// Der Doppelgaenger unten protokolliert jeden PostgREST-Aufruf mit. Nur so
// laesst sich pruefen, WELCHER Filter tatsaechlich gesetzt wurde — ein
// Rueckgabewert allein sagt darueber nichts.

import { describe, expect, it } from 'vitest'
import {
  AUFBEWAHRUNGSKATALOG, NICHT_AUTOMATISCH, fristAus, katalogMitFristen, alleEnvSchluessel,
} from '../../lib/aufbewahrung/katalog'
import { fuehreAufbewahrungslaufAus, stichtag } from '../../lib/aufbewahrung/lauf'

interface Aufruf {
  tabelle: string
  art: 'select' | 'update' | 'delete' | 'insert'
  filter: string[]
  werte?: Record<string, unknown>
}

/**
 * Ein PostgREST-Doppelgaenger, der mitschreibt, welche Filter gesetzt
 * wurden. `treffer` steuert, wie viele Zeilen eine Kette zurueckgibt.
 */
function fakeClient(treffer: Record<string, number> = {}, insertFehler?: string) {
  const aufrufe: Aufruf[] = []

  function kette(tabelle: string, art: Aufruf['art'], werte?: Record<string, unknown>) {
    const eintrag: Aufruf = { tabelle, art, filter: [], werte }
    aufrufe.push(eintrag)
    const n = treffer[tabelle] ?? 0
    const zeilen = Array.from({ length: n }, (_, i) => ({ id: `${tabelle}-${i}` }))

    const api: any = {
      lt(spalte: string, wert: string) { eintrag.filter.push(`lt:${spalte}`); return api },
      not(spalte: string, op: string) { eintrag.filter.push(`not:${spalte}:${op}`); return api },
      is(spalte: string, wert: unknown) { eintrag.filter.push(`is:${spalte}:${String(wert)}`); return api },
      in(spalte: string, werte: string[]) { eintrag.filter.push(`in:${spalte}:${werte.join('|')}`); return api },
      eq(spalte: string, wert: string) { eintrag.filter.push(`eq:${spalte}:${wert}`); return api },
      neq(spalte: string, wert: string) { eintrag.filter.push(`neq:${spalte}:${wert}`); return api },
      select() { return api },
      then(aufloesen: (w: unknown) => unknown) {
        return Promise.resolve(aufloesen(
          art === 'select'
            ? { count: n, error: null }
            : { data: zeilen, error: null },
        ))
      },
    }
    return api
  }

  const client = {
    from(tabelle: string) {
      return {
        select: (_s?: string, _o?: unknown) => kette(tabelle, 'select'),
        update: (werte: Record<string, unknown>) => kette(tabelle, 'update', werte),
        delete: () => kette(tabelle, 'delete'),
        insert: (werte: Record<string, unknown>) => {
          aufrufe.push({ tabelle, art: 'insert', filter: [], werte })
          return Promise.resolve({ error: insertFehler ? { message: insertFehler } : null })
        },
      }
    },
  }
  return { client, aufrufe }
}

const JETZT = new Date('2026-08-31T03:45:00.000Z')

describe('Aufbewahrungskatalog: die Fristen', () => {
  it('traegt die Ausgangskonfiguration fuer die Betriebsdaten', () => {
    const geo = AUFBEWAHRUNGSKATALOG.find(r => r.tabelle === 'geo_events')!
    const queue = AUFBEWAHRUNGSKATALOG.find(r => r.tabelle === 'offline_queue')!
    expect(geo.loeschFristTage).toBe(14)
    expect(queue.loeschFristTage).toBe(30)
    expect(geo.bereich).toBe('betrieb')
    expect(queue.bereich).toBe('betrieb')
  })

  it('uebernimmt die Perimeter-Regeln, statt sie abzuschreiben', () => {
    // Eine Kopie waere die naechste Liste, die auseinanderlaeuft.
    for (const tabelle of ['visitors', 'visitor_locations', 'page_views', 'analytics_events', 'conversions']) {
      const r = AUFBEWAHRUNGSKATALOG.find(x => x.tabelle === tabelle)
      expect(r, `${tabelle} fehlt im gemeinsamen Katalog`).toBeDefined()
      expect(r!.bereich).toBe('perimeter')
    }
  })

  it('begruendet jede Regel und nennt fuer jede einen ENV-Schluessel', () => {
    for (const r of AUFBEWAHRUNGSKATALOG) {
      expect(r.begruendung.length, `${r.tabelle} ohne Begruendung`).toBeGreaterThan(40)
      expect(r.envSchluessel).toBe(`AUFBEWAHRUNG_${r.tabelle.toUpperCase()}_TAGE`)
    }
    expect(alleEnvSchluessel().length).toBeGreaterThanOrEqual(AUFBEWAHRUNGSKATALOG.length)
  })

  it('begruendet auch, was AUSDRUECKLICH keine Frist bekommt', () => {
    // „Wird nicht geloescht" soll eine Entscheidung sein, kein Vergessen.
    expect(NICHT_AUTOMATISCH.map(e => e.tabelle)).toContain('service_records')
    expect(NICHT_AUTOMATISCH.map(e => e.tabelle)).toContain('personal_audit_log')
    for (const e of NICHT_AUTOMATISCH) {
      expect(e.begruendung.length, `${e.tabelle} ohne Begruendung`).toBeGreaterThan(40)
    }
  })
})

describe('Aufbewahrungskatalog: konfigurierbar heisst ENV schlaegt Vorgabe', () => {
  it('nimmt einen gueltigen Wert aus der Umgebung', () => {
    const b = fristAus('AUFBEWAHRUNG_GEO_EVENTS_TAGE', 14, { AUFBEWAHRUNG_GEO_EVENTS_TAGE: '90' })
    expect(b).toEqual({ tage: 90, quelle: 'umgebung' })
  })

  it('faellt ohne Wert auf die Vorgabe zurueck — ohne Warnung', () => {
    expect(fristAus('X', 14, {})).toEqual({ tage: 14, quelle: 'vorgabe' })
    expect(fristAus('X', 14, { X: '   ' })).toEqual({ tage: 14, quelle: 'vorgabe' })
  })

  it('MELDET einen unbrauchbaren Wert, statt ihn stumm zu verwerfen', () => {
    // Wer '0' schreibt, meint moeglicherweise „sofort loeschen". Das
    // still als „dann eben 14 Tage" zu lesen, waere die gefaehrlichere
    // Auslegung — und der Tippfehler bliebe unbemerkt.
    for (const wert of ['0', '-5', 'sieben', '7.5']) {
      const b = fristAus('X', 14, { X: wert })
      expect(b.tage, `${wert} haette die Vorgabe halten muessen`).toBe(14)
      expect(b.quelle).toBe('vorgabe')
      expect(b.warnung, `${wert} wurde stumm verworfen`).toBeTruthy()
      expect(b.warnung).toContain('X')
    }
  })

  it('loest den ganzen Katalog gegen eine Umgebung auf', () => {
    const k = katalogMitFristen({ AUFBEWAHRUNG_GEO_EVENTS_TAGE: '45' })
    const geo = k.find(r => r.tabelle === 'geo_events')!
    expect(geo.loeschFrist).toEqual({ tage: 45, quelle: 'umgebung' })
    expect(k.find(r => r.tabelle === 'offline_queue')!.loeschFrist.quelle).toBe('vorgabe')
  })
})

describe('Aufbewahrungslauf: die Schutzbedingungen', () => {
  it('prueft geo_events auf IS NULL — nicht auf = NULL', async () => {
    // Der wichtigste Test dieser Datei. `= NULL` trifft in SQL nie etwas:
    // ein als `eq` gebauter Filter waere wirkungslos, und der Lauf
    // entfernte auch die Standortbelege MIT Leistungsnachweis.
    const { client, aufrufe } = fakeClient()
    await fuehreAufbewahrungslaufAus(client, { jetzt: JETZT, trockenlauf: true, env: {} })

    const geo = aufrufe.filter(a => a.tabelle === 'geo_events')
    expect(geo.length).toBe(1)
    expect(geo[0].filter).toContain('is:service_record_id:null')
    expect(geo[0].filter.some(f => f.startsWith('eq:service_record_id'))).toBe(false)
  })

  it('entfernt aus offline_queue nur uebertragene und gescheiterte Eintraege', async () => {
    // `pending` und `conflict` sind Aenderungen, die den Server nie
    // erreicht haben — die Arbeit einer Kollegin, nicht eine Kopie.
    const { client, aufrufe } = fakeClient()
    await fuehreAufbewahrungslaufAus(client, { jetzt: JETZT, trockenlauf: true, env: {} })

    const queue = aufrufe.find(a => a.tabelle === 'offline_queue')!
    expect(queue.filter).toContain('in:status:synced|failed')
  })

  it('setzt die Altersgrenze auf die aufgeloeste Frist', async () => {
    const { client, aufrufe } = fakeClient()
    await fuehreAufbewahrungslaufAus(client, {
      jetzt: JETZT, trockenlauf: true, env: { AUFBEWAHRUNG_GEO_EVENTS_TAGE: '2' },
    })
    expect(aufrufe.find(a => a.tabelle === 'geo_events')!.filter).toContain('lt:created_at')
    expect(stichtag(JETZT, 2)).toBe('2026-08-29T03:45:00.000Z')
  })
})

describe('Aufbewahrungslauf: der Trockenlauf aendert nichts', () => {
  it('schreibt weder Loeschung noch Kuerzung noch Spur', async () => {
    const { client, aufrufe } = fakeClient({ geo_events: 12, visitors: 300 })
    const e = await fuehreAufbewahrungslaufAus(client, {
      jetzt: JETZT, trockenlauf: true, env: {},
    })

    expect(aufrufe.every(a => a.art === 'select')).toBe(true)
    expect(e.trockenlauf).toBe(true)
    expect(e.spurGeschrieben).toBeNull()
    // Gezaehlt wird trotzdem — die Zahlen SIND das Entscheidungsmaterial.
    expect(e.geloeschtGesamt).toBeGreaterThan(0)
  })
})

describe('Aufbewahrungslauf: die Revisionsspur', () => {
  it('protokolliert den scharfen Lauf mit einem vom CHECK gedeckten action-Wert', async () => {
    // `mis_audit_log_action_check` laesst nur eine feste Liste zu. Ein
    // erfundener Wert liesse den Insert lautlos scheitern — dann waere die
    // Spur eine Behauptung.
    const { client, aufrufe } = fakeClient({ geo_events: 3 })
    const e = await fuehreAufbewahrungslaufAus(client, {
      jetzt: JETZT, trockenlauf: false, env: {},
    })

    const spur = aufrufe.find(a => a.tabelle === 'mis_audit_log' && a.art === 'insert')
    expect(spur, 'keine Spur geschrieben').toBeDefined()
    expect(spur!.werte!.action).toBe('delete')
    expect(spur!.werte!.entity_type).toBe('aufbewahrung')
    expect(e.spurGeschrieben).toBe(true)

    const details = spur!.werte!.details as Record<string, unknown>
    expect(details.zeilen_geloescht).toBe(e.geloeschtGesamt)
    // Je Tabelle nachvollziehbar — sonst steht dort eine Gesamtzahl ohne
    // Antwort auf „was genau ist weg?".
    expect(Array.isArray(details.je_tabelle)).toBe(true)
    expect((details.je_tabelle as unknown[]).length).toBeGreaterThan(0)
  })

  it('protokolliert einen scharfen Lauf ohne Wirkung NICHT', async () => {
    // Sonst fuellt sich die Spur mit Nichtereignissen, bis niemand mehr
    // hineinsieht.
    const { client, aufrufe } = fakeClient({})
    const e = await fuehreAufbewahrungslaufAus(client, {
      jetzt: JETZT, trockenlauf: false, env: {},
    })
    expect(aufrufe.some(a => a.tabelle === 'mis_audit_log')).toBe(false)
    expect(e.spurGeschrieben).toBeNull()
  })

  it('meldet eine gescheiterte Spur, statt den Lauf gruen aussehen zu lassen', async () => {
    const { client } = fakeClient({ geo_events: 3 }, 'permission denied for table mis_audit_log')
    const e = await fuehreAufbewahrungslaufAus(client, {
      jetzt: JETZT, trockenlauf: false, env: {},
    })
    expect(e.spurGeschrieben).toBe(false)
    expect(e.spurFehler).toContain('permission denied')
    // Die Loeschung selbst bleibt gueltig — sie laesst sich nicht
    // zuruecknehmen, und ein Abbruch liesse den Bestand halb geraeumt.
    expect(e.geloeschtGesamt).toBeGreaterThan(0)
  })

  it('traegt eine unbrauchbare Frist als Warnung nach oben', async () => {
    const { client } = fakeClient({})
    const e = await fuehreAufbewahrungslaufAus(client, {
      jetzt: JETZT, trockenlauf: true, env: { AUFBEWAHRUNG_GEO_EVENTS_TAGE: '0' },
    })
    expect(e.warnungen.some(w => w.includes('geo_events'))).toBe(true)
  })
})
