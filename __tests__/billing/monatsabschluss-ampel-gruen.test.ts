/**
 * Die grüne Ampel, die niemand geprüft hatte
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 81) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * Die drei Monatsabschluss-Seiten laden ihre Quellen gebündelt und
 * verarbeiteten jede davon ungeprüft als leere Liste weiter. Der Schaden
 * ist hier besonders scharf, weil die Seiten eine AMPEL zeigen:
 *
 *   /admin/monatsabschluss
 *   /admin/monatsabschluss/[clientId]
 *   /admin/monatsabschluss-vorbereitung
 *
 * Beide erstgenannten prüfen `review_errors` ausdrücklich — mit einem
 * Kommentar, der den Schaden benennt: „Die Prüfefehler entscheiden über
 * die Ampel des Monatsabschlusses. Ihr Verlust färbt den Monat grün,
 * obwohl niemand nachgesehen hat."
 *
 * Genau diese Prüfung wurde übersprungen. Ohne `recordsRes` ist
 * `recordIds` leer, die review_errors-Abfrage läuft gar nicht erst — und
 * jeder Klient steht auf grün. Der geschriebene Riegel hing an einem
 * ungeprüften Lesevorgang darüber.
 *
 * Auf der Klientenseite ist grün keine Anzeige, sondern eine FREIGABE:
 * die Schaltfläche „Monat abschließen" hängt an dieser Ampel.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const UEBERSICHT = readFileSync('app/admin/monatsabschluss/page.tsx', 'utf8')
const KLIENT = readFileSync('app/admin/monatsabschluss/[clientId]/page.tsx', 'utf8')
const VORBEREITUNG = readFileSync('app/admin/monatsabschluss-vorbereitung/page.tsx', 'utf8')
const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')

describe('Übersicht: keine Ampel aus ungelesenen Daten', () => {
  it('prüft alle drei Quellen', () => {
    const teil = UEBERSICHT.slice(UEBERSICHT.indexOf('const quellen = [')).slice(0, 400)
    for (const f of ['closingsRes.error', 'recordsRes.error', 'budgetsRes.error']) {
      expect(teil, f).toContain(f)
    }
  })

  it('zeigt bei einem Fehlschlag KEINE Zeilen', () => {
    const teil = UEBERSICHT.slice(UEBERSICHT.indexOf('const fehlend = quellen.filter')).slice(0, 800)
    expect(teil).toContain('setRows([])')
    expect(teil).toContain('return')
  })

  it('und sagt, warum grün hier nicht gezeigt wird', () => {
    expect(UEBERSICHT).toMatch(/gruen hiesse hier/)
  })

  it('der bisher nur protokollierte Abbruch wird jetzt auch gezeigt', () => {
    // Hierher führt auch `throw errsErr` — vorher endete das im Log und
    // die Tabelle blieb einfach leer.
    const catchTeil = UEBERSICHT.slice(UEBERSICHT.indexOf('} catch (err) {')).slice(0, 700)
    expect(catchTeil).toContain('setLadefehler(')
    expect(catchTeil).toContain('setRows([])')
  })

  it('die Prüfefehler-Abfrage bleibt fail-closed', () => {
    expect(UEBERSICHT).toContain('if (errsErr) throw errsErr')
  })

  it('und die Tabelle wird bei einem Ladefehler gar nicht gerendert', () => {
    expect(UEBERSICHT).toContain('{loading ? <p>Laden…</p> : ladefehler ? null : (')
  })
})

describe('Klientenseite: grün ist dort eine Freigabe', () => {
  it('prüft Nachweise, Budget und Abschluss', () => {
    const teil = KLIENT.slice(KLIENT.indexOf('const quellen = [')).slice(0, 400)
    for (const f of ['recordsRes.error', 'budgetRes.error', 'closingRes.error']) {
      expect(teil, f).toContain(f)
    }
  })

  it('und zeigt den Monat dann gar nicht zur Freigabe', () => {
    expect(KLIENT).toContain('if (unvollstaendig) return (')
    const teil = KLIENT.slice(KLIENT.indexOf('if (unvollstaendig) return (')).slice(0, 400)
    expect(teil).toContain('<Banner tone="danger">{unvollstaendig}</Banner>')
    expect(teil).not.toContain('Monat abschließen')
  })

  it('der Zustand wird bei jedem Laden zurückgesetzt', () => {
    expect(KLIENT).toContain('setUnvollstaendig(null)')
  })

  it('der Klient-Lesefehler bleibt ein eigener Fall', () => {
    // „nicht gefunden" und „nicht lesbar" sind verschiedene Aussagen; die
    // erste war hier schon immer geprüft und bleibt es.
    expect(KLIENT).toContain('if (clientRes.error || !clientRes.data) { setNotFound(true)')
  })
})

describe('Vorbereitung: die Gegenüberstellung zeigt nichts Halbes', () => {
  it('prüft alle fünf Quellen', () => {
    const teil = VORBEREITUNG.slice(VORBEREITUNG.indexOf('const quellen = [')).slice(0, 600)
    for (const f of [
      'assignRes.error', 'recordRes.error', 'budgetRes.error',
      'clientRes.error', 'caregiverRes.error',
    ]) {
      expect(teil, f).toContain(f)
    }
  })

  it('leert die Listen, statt eine halbe Gegenüberstellung zu zeigen', () => {
    const teil = VORBEREITUNG.slice(VORBEREITUNG.indexOf('const fehlend = quellen.filter')).slice(0, 900)
    expect(teil).toContain('setAssignments([])')
    expect(teil).toContain('setRecords([])')
    expect(teil).toContain('setBudgets([])')
  })

  it('und zeigt den Grund', () => {
    expect(VORBEREITUNG).toContain('{ladefehler && <Banner tone="danger">{ladefehler}</Banner>}')
  })
})

describe('Der Riegel wird auch betreten', () => {
  // Die erste Fassung dieser Suite prueffte nur, DASS eine Quellenliste
  // und ein Fehlerzweig existieren. Eine Mutation, die `fehlend` auf eine
  // leere Liste setzte, kam damit durch — der Zweig war da und wurde nie
  // erreicht. Gefunden durch die Mutationsprobe.
  const SEITEN: Array<[string, string, string]> = [
    ['Übersicht', UEBERSICHT, 'setLadefehler('],
    ['Klientenseite', KLIENT, 'setUnvollstaendig('],
    ['Vorbereitung', VORBEREITUNG, 'setLadefehler('],
  ]

  for (const [name, quelle, setzer] of SEITEN) {
    it(`${name}: die Fehlerliste entsteht aus den Quellen`, () => {
      expect(quelle).toContain('const fehlend = quellen.filter(([, grund]) => grund !== null)')
    })

    it(`${name}: und der Zweig dahinter meldet es`, () => {
      const ab = quelle.indexOf('const fehlend = quellen.filter')
      expect(ab).toBeGreaterThan(-1)
      const teil = quelle.slice(ab, ab + 1200)
      expect(teil).toContain('if (fehlend.length > 0) {')
      expect(teil).toContain(setzer)
    })
  }
})

describe('Der Bestand ist mitgezogen', () => {
  it('trägt keinen Eintrag mehr für die drei Seiten', () => {
    const liste = LINT.slice(
      LINT.indexOf('const BESTAND_GEBUENDELT'),
      LINT.indexOf('function imBestand'),
    )
    expect(liste).not.toContain('monatsabschluss')
  })

  it('und ist weiter gesunken', async () => {
    // Obergrenze statt Gleichheit — dieselbe Ueberlegung wie in
    // abrechnungsseiten-leerzustand.test.ts: der Bestand soll sinken,
    // und ein Test, der das bestraft, erzieht zum Stillstand.
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(70)
  })
})
