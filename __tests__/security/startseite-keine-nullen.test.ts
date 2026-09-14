/**
 * Die Startseite, die einen leeren Betrieb meldete
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 87) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * 1. `AmpelSummaryWidget` — die Ampel über dem Monatsabschluss. Die
 *    Prüfefehler werden darin ausdrücklich geprüft, mit dem Satz: „Ihr
 *    Verlust liess das Widget gruen melden, obwohl niemand nachgesehen
 *    hat." Genau diese Prüfung wird übersprungen, wenn `recordsRes`
 *    ausfällt: `recordIds` ist dann leer und die Abfrage läuft gar nicht
 *    erst. Und das catch darunter setzte alles auf 0 — drei Kacheln, die
 *    sich lesen wie „nichts zu tun".
 *
 * 2. /admin/home — die Startseite. Vier Abfragen, alle ungeprüft:
 *    0 Nutzer, 0 Engel, 0 Kunden, 0 Buchungen, 0,00 € Umsatz.
 *
 * 3. /admin/clients und /admin/caregivers — die Stammlisten. Leer sieht
 *    aus wie „niemand angelegt".
 *
 *    Bei den Betreuungskräften kommt eine eigene Wendung dazu:
 *    `qualAntwort.ok ? await qualAntwort.json() : []` machte aus einer
 *    gescheiterten Anfrage eine leere Qualifikationsliste. Der Kommentar
 *    darüber nennt genau diesen Schaden als GRUND für die Route — „die
 *    Pflegedienstleitung sähe hier sonst eine leere Liste ohne jede
 *    Meldung". Der Rückfall stellte ihn wieder her.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const WIDGET = readFileSync('components/admin/AmpelSummaryWidget.tsx', 'utf8')
const HOME = readFileSync('app/admin/home/page.tsx', 'utf8')
const CLIENTS = readFileSync('app/admin/clients/page.tsx', 'utf8')
const CG = readFileSync('app/admin/caregivers/page.tsx', 'utf8')

describe('Ampel-Widget: keine Nullen aus einem Lesefehler', () => {
  it('prüft beide Abfragen', () => {
    const teil = WIDGET.slice(WIDGET.indexOf('const nichtLesbar = ([')).slice(0, 400)
    expect(teil).toContain('closingsRes.error')
    expect(teil).toContain('recordsRes.error')
    expect(teil).toContain('.filter(([, fehler]) => fehler != null)')
  })

  it('das catch setzt nicht mehr drei Nullen', () => {
    const catchTeil = WIDGET.slice(WIDGET.indexOf('} catch (err) {')).slice(0, 500)
    expect(catchTeil).not.toContain('{ gruen: 0, gelb: 0, rot: 0 }')
    expect(catchTeil).toContain('setFehler(')
  })

  it('und die Anzeige sagt „nicht ermittelbar" statt 0', () => {
    expect(WIDGET).toContain('if (fehler) {')
    const teil = WIDGET.slice(WIDGET.indexOf('if (fehler) {')).slice(0, 700)
    expect(teil).toMatch(/Ampel nicht ermittelbar/)
  })

  it('die Prüfefehler-Abfrage bleibt fail-closed', () => {
    expect(WIDGET).toContain('if (errsErr) throw errsErr')
  })
})

describe('Startseite: keine Kennzahlen aus ungelesenen Tabellen', () => {
  it('prüft alle vier Abfragen', () => {
    const teil = HOME.slice(HOME.indexOf('const nichtLesbar = ([')).slice(0, 500)
    for (const n of [
      'profilesRes.error', 'bookingsRes.error',
      'recentProfilesRes.error', 'recentBookingsRes.error',
    ]) {
      expect(teil, n).toContain(n)
    }
  })

  it('die Fehlerliste entsteht aus den Fehlern', () => {
    // Ohne diese Zusicherung kaeme eine Mutation durch, die den Filter
    // auf „nie etwas" setzt — gefunden in der Mutationsprobe.
    expect(HOME).toContain('] as const).filter(([, fehler]) => fehler != null).map(([name]) => name)')
  })

  it('zeigt dann gar keine Kacheln', () => {
    expect(HOME).toContain('if (ladefehler) return (')
    expect(HOME).toMatch(/Nullen wären von einem leeren Betrieb/)
  })
})

describe('Stammlisten: leer ist nicht „niemand angelegt"', () => {
  it('Klienten: beide Abfragen geprüft', () => {
    const teil = CLIENTS.slice(CLIENTS.indexOf('const nichtLesbar = ([')).slice(0, 400)
    expect(teil).toContain('clientsRes.error')
    expect(teil).toContain('budgetsRes.error')
  })

  it('Klienten: die Fehlerliste entsteht aus den Fehlern', () => {
    expect(CLIENTS).toContain('] as const).filter(([, fehler]) => fehler != null).map(([name]) => name)')
  })

  it('Klienten: keine Liste, sondern der Grund', () => {
    const ab = CLIENTS.indexOf('if (nichtLesbar.length > 0) {')
    const teil = CLIENTS.slice(ab, ab + 600)
    expect(teil).toContain('setClients([])')
    expect(teil).toContain('setError(')
  })

  it('Betreuungskräfte: der HTTP-Rückfall auf [] ist weg', () => {
    expect(CG).not.toContain('qualAntwort.ok ? await qualAntwort.json() : []')
    expect(CG).toContain('const qualRes = { data: await qualAntwort.json() }')
  })

  it('Betreuungskräfte: beide Quellen geprüft', () => {
    expect(CG).toContain('if (cgRes.error) nichtLesbar.push')
    expect(CG).toContain('if (!qualAntwort.ok) nichtLesbar.push')
  })

  it('Betreuungskräfte: keine Liste, sondern der Grund', () => {
    expect(CG).toContain('if (ladefehler) return (')
    const teil = CG.slice(CG.indexOf('if (ladefehler) return (')).slice(0, 400)
    expect(teil).toContain('<Banner tone="danger">{ladefehler}</Banner>')
  })

  it('der Kommentar zur Route bleibt stehen', () => {
    // Er erklärt, warum es die Route überhaupt gibt.
    expect(CG).toMatch(/saehe hier\s*\n?\s*\/\/ sonst eine leere Liste ohne jede Meldung/)
  })
})

describe('Der Bestand ist mitgezogen', () => {
  it('und ist weiter gesunken', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(23)
    for (const teil of ['AmpelSummaryWidget', 'admin/home', 'admin/clients', 'admin/caregivers/page']) {
      expect(BESTAND_GEBUENDELT.some(e => e.datei.includes(teil)), teil).toBe(false)
    }
  })
})
