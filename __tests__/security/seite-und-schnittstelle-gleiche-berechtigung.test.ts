/**
 * Die Seite und die Schnittstelle dahinter müssen dieselbe Berechtigung
 * verlangen.
 *
 * BEFUND-MUSTER (aus dem Bonusmodul, 28.08.2026): Seite, Schnittstelle und
 * Datenbank gaben drei verschiedene Antworten auf dieselbe Frage. Die Seite
 * öffnete sich für die PDL, die Route ließ zusätzlich QM und Buchhaltung
 * herein, und die Datenbank wies alle drei ab. Keine dieser Abweichungen
 * schlägt fehl — sie zeigen sich als leere Listen und stille 403er.
 *
 * Die gefährlichere Richtung ist NICHT die zu enge Seite. Ist die Seite
 * enger als die Route, kommt jemand nicht hinein, der dürfte — ärgerlich,
 * aber sichtbar. Ist die Seite WEITER als die Route, öffnet sie sich für
 * jemanden, dem jede Abfrage dahinter 403 gibt: die Ansicht steht da und
 * bleibt leer, und das sieht aus wie „nichts vorhanden" statt wie „nicht
 * erlaubt". Genau das prüft diese Suite.
 *
 * Gelesen wird der Quelltext der Route, nicht ein Lauf: der Aufruf ist eine
 * Zeichenkette im Handler, und ein Lauf bräuchte eine Anmeldung, die es in
 * der Testumgebung nicht gibt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BEREICHE } from '@/lib/auth/bereiche'

/**
 * Seiten, deren Berechtigung an einer bestimmten Route hängt.
 *
 * Bewusst eine gepflegte Liste und keine automatische Herleitung: welche
 * Route eine Seite trägt, steht in `fetch`-Aufrufen, und eine Seite, die
 * drei Routen anspricht, hätte keine eindeutige Antwort. Neue Einträge sind
 * eine Zeile.
 */
const PAARE = [
  {
    seite: '/admin/dienstplanfreigabe',
    route: 'app/api/personal/dienstplan/freigabe/route.ts',
  },
  {
    seite: '/admin/monitoring',
    route: 'app/api/admin/monitoring/abrechnung/route.ts',
  },
  {
    // Erbt seine Regel ueber die Praefix-Zuordnung von '/admin/abrechnung'
    // — `bereichFuerPfad` sucht den laengsten passenden Praefix.
    seite: '/admin/abrechnung',
    route: 'app/api/billing/audit/route.ts',
  },
  {
    // Der einzige Eintrag bisher, bei dem die Route BEIDE Richtungen
    // getrennt fuehrt: `abrechnung.lesen` im GET, `abrechnung.schreiben`
    // im POST. Damit prueft die Suite hier auch wirklich beide Zusicherungen.
    seite: '/admin/monatsabschluss',
    route: 'app/api/billing/monthly-closing/route.ts',
  },
  {
    // Die Forderungsabschreibung: eine Rechnung endgueltig ausbuchen. Sie
    // haengt an der Detailseite unter '/admin/rechnungen' und erbt deren
    // Regel ueber die Praefix-Zuordnung.
    seite: '/admin/rechnungen',
    route: 'app/api/billing/invoices/[id]/abschreiben/route.ts',
  },
] as const

/**
 * Die Berechtigungen, die ein Route-Handler verlangt — die Argumente der
 * `require*`-Wächter, getrennt nach Lese- und Schreibhandler.
 */
function berechtigungenDerRoute(datei: string): { lesen: string[]; schreiben: string[] } {
  const code = readFileSync(join(process.cwd(), datei), 'utf8')
  const lesen: string[] = []
  const schreiben: string[] = []

  // Handler-Blöcke grob trennen: ab `export const GET` bis zum nächsten
  // `export const`. Reicht für die Frage „welcher Wächter steht in welchem
  // Handler" und kommt ohne Parser aus.
  for (const methode of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const) {
    const start = code.indexOf(`export const ${methode} `)
    if (start === -1) continue
    const rest = code.slice(start + 1)
    const naechster = rest.indexOf('\nexport const ')
    const block = naechster === -1 ? rest : rest.slice(0, naechster)

    // Zwei Schreibweisen im Haus, beide zaehlen:
    //   requireXAdmin('abrechnung.lesen')       — der gebuendelte Waechter
    //   quellenDuerfen(quellen, 'abrechnung.lesen') — die Inline-Fassung
    // Wer nur die erste liest, haelt eine Route mit der zweiten faelschlich
    // fuer ungeschuetzt — und die Probe „verlangt ueberhaupt einen
    // Waechter" haette dann ausgerechnet dort angeschlagen, wo alles
    // richtig ist.
    const muster = [
      /require[A-Za-z]*\(\s*'([^']+)'/g,
      /quellenDuerfen\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']+)'/g,
    ]
    for (const m of muster) {
      for (const t of block.matchAll(m)) {
        ;(methode === 'GET' ? lesen : schreiben).push(t[1])
      }
    }
  }
  return { lesen, schreiben }
}

describe.each(PAARE)('$seite und $route', (paar) => {
  it('die Seite steht überhaupt in der Bereichszuordnung', () => {
    // Ohne Eintrag liefert `berechtigungFuerPfad` null, und `darfPfad`
    // lässt dann nur die Administration durch — die Seite wäre für die
    // PDL, für die sie gebaut ist, unerreichbar.
    expect(BEREICHE[paar.seite as keyof typeof BEREICHE]).toBeDefined()
  })

  it('die Route verlangt überhaupt einen Wächter — sonst wäre der Vergleich aussagelos', () => {
    const r = berechtigungenDerRoute(paar.route)
    expect(r.lesen.length + r.schreiben.length).toBeGreaterThan(0)
  })

  it('verlangt zum Lesen dieselbe Berechtigung', () => {
    const regel = BEREICHE[paar.seite as keyof typeof BEREICHE]
    const r = berechtigungenDerRoute(paar.route)
    for (const noetig of r.lesen) {
      expect(regel.lesen,
        `Die Seite verlangt "${regel.lesen}", der GET-Handler "${noetig}". `
        + 'Ist die Seite weiter als die Route, öffnet sie sich für jemanden, '
        + 'dem jede Abfrage dahinter 403 gibt — die Ansicht bleibt leer und '
        + 'sieht aus wie „nichts vorhanden".')
        .toBe(noetig)
    }
  })

  it('verlangt zum Schreiben dieselbe Berechtigung', () => {
    const regel = BEREICHE[paar.seite as keyof typeof BEREICHE]
    const r = berechtigungenDerRoute(paar.route)
    for (const noetig of r.schreiben) {
      expect(regel.schreiben ?? regel.lesen,
        `Die Seite verlangt zum Schreiben "${regel.schreiben ?? regel.lesen}", `
        + `der Handler "${noetig}".`)
        .toBe(noetig)
    }
  })
})

describe('Dienstplan-Freigabe steht bewusst auf einsatz.*', () => {
  it('nicht auf personal.*, wie der Dienstplan daneben', () => {
    // Die Nachbarschaft in der Navigation verführt zum Abschreiben der
    // Zeile darüber. Die Route entscheidet aber über `einsatz.*` — dieser
    // Fall hält fest, dass die Abweichung Absicht ist und kein Vertipper.
    expect(BEREICHE['/admin/dienstplanfreigabe']).toEqual({
      lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben',
    })
    expect(BEREICHE['/admin/dienstplan']).toEqual({
      lesen: 'personal.lesen', schreiben: 'personal.schreiben',
    })
  })
})
