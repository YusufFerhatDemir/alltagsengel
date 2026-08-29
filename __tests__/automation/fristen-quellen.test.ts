/**
 * `FRISTEN_QUELLEN` gegen die Fundstellen im Quelltext — und gegen die
 * Filterauswahl des Dashboards.
 *
 * BEFUND (29.08.2026): Die Filterauswahl in app/admin/fristen/page.tsx war
 * eine ABSCHRIFT der Quellen, die der Sammler vergibt. Als mit Migration
 * `20260829184500` die Zeiterfassung als eigene Quelle dazukam (ArbZG auf
 * der ERFASSTEN Arbeitszeit, § 2 Abs. 1 ArbZG), hätte die Frist in der
 * Tabelle gestanden, wäre im Filter aber nicht wählbar gewesen. Man hätte
 * sie sehen, aber nicht heraussuchen können — und weil nichts fehlschlägt,
 * wäre es niemandem aufgefallen.
 *
 * Die Abschrift ist inzwischen weg; das Dashboard bezieht die Liste. Diese
 * Suite deckt den Rest ab: dass die Liste WIRKLICH alle Quellen führt, die
 * der Sammler vergibt. Ein neuer Abschnitt mit einem neuen `quelle:`-Wert
 * fällt hier auf, statt still an der Filterauswahl vorbeizulaufen.
 *
 * Gelesen wird der QUELLTEXT, nicht ein Lauf: den Sammler auszuführen würde
 * eine Datenbank mit je einer Zeile pro Abschnitt verlangen, und genau der
 * Abschnitt, den jemand zu ergänzen vergisst, hätte dort auch keine.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FRISTEN_QUELLEN } from '@/lib/automation/fristen-sammler'

const SAMMLER = join(process.cwd(), 'lib', 'automation', 'fristen-sammler.ts')

/**
 * Alle Zeichenketten-Literale, die an `quelle:` zugewiesen werden.
 *
 * Erfasst auch die bedingte Form (`quelle: bedingung ? 'A' : 'B'`) — beide
 * Zweige sind Werte, die in einer Frist landen können. Wer nur den ersten
 * nähme, übersähe genau den Fall, der diese Suite ausgelöst hat.
 */
function quellenImQuelltext(): string[] {
  const code = readFileSync(SAMMLER, 'utf8')
  const gefunden = new Set<string>()
  // Bis zum Zeilenende ab `quelle:` — deckt das einfache Literal und den
  // Ternär gleichermaßen ab, ohne die eine Form zu bevorzugen.
  for (const zeile of code.matchAll(/\bquelle:\s*([^\n]*)/g)) {
    for (const literal of zeile[1].matchAll(/'([^']+)'/g)) gefunden.add(literal[1])
  }
  return [...gefunden]
}

describe('FRISTEN_QUELLEN gegen den Sammler', () => {
  it('findet überhaupt Zuweisungen — sonst wäre die Suite aussagelos', () => {
    // Ohne diese Probe würde eine umbenannte Eigenschaft die Suche leer
    // laufen lassen, und alle Zusicherungen darunter wären still erfüllt.
    expect(quellenImQuelltext().length).toBeGreaterThanOrEqual(5)
  })

  it('führt jede Quelle, die der Sammler tatsächlich vergibt', () => {
    for (const quelle of quellenImQuelltext()) {
      expect(FRISTEN_QUELLEN as readonly string[],
        `Der Sammler vergibt "${quelle}", FRISTEN_QUELLEN kennt sie nicht — `
        + 'die Frist erscheint in der Tabelle, ist im Dashboard aber nicht filterbar')
        .toContain(quelle)
    }
  })

  it('führt umgekehrt keine Quelle, die niemand mehr vergibt', () => {
    // Eine Quelle ohne Fundstelle ist ein Filtereintrag, der immer eine
    // leere Liste liefert — er sieht aus wie „nichts fällig" und ist doch
    // nur ein Überbleibsel.
    const vergeben = quellenImQuelltext()
    for (const quelle of FRISTEN_QUELLEN) {
      expect(vergeben, `"${quelle}" steht in FRISTEN_QUELLEN, wird aber nirgends vergeben`)
        .toContain(quelle)
    }
  })

  it('kennt Zeiterfassung und Dienstplan als GETRENNTE Quellen', () => {
    // Der Kern des Befundes: ein ArbZG-Verstoß aus der erfassten Zeit
    // darf nicht als „Dienstplan" ausgewiesen werden. Im Dienstplan steht
    // dann nämlich nichts Auffälliges — der Überhang liegt im Zeiteintrag,
    // und die PDL sucht an der falschen Stelle.
    expect(FRISTEN_QUELLEN as readonly string[]).toContain('Dienstplan')
    expect(FRISTEN_QUELLEN as readonly string[]).toContain('Zeiterfassung')
  })

  it('enthält keine Dubletten', () => {
    expect(new Set(FRISTEN_QUELLEN).size).toBe(FRISTEN_QUELLEN.length)
  })

  it('reserviert „Alle" nicht als echte Quelle', () => {
    // „Alle" ist der Aus-Zustand des Filters, keine Herkunft. Stünde es in
    // der Liste, gäbe es den Eintrag zweimal — einmal als Aus-Zustand,
    // einmal als Quelle, die nie etwas trifft.
    expect(FRISTEN_QUELLEN as readonly string[]).not.toContain('Alle')
  })
})
