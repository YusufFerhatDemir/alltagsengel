/**
 * DiPA / PflegeCoach — Produktversion und Änderungsverzeichnis dürfen nicht
 * auseinanderlaufen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (29.08.2026): `COACH_PRODUKT_VERSION` stand auf `0.5.0`, der
 * neueste Eintrag in `audit/dipa/CHANGELOG_pflegecoach.md` war `0.4.0`. Der
 * Sprung erfolgte am 14.08.2026 in Commit c57c1dd9 — ohne Eintrag, obwohl
 * der Kopf von `lib/coach/version.ts` das ausdrücklich verlangt („Jede
 * Versionsänderung wird in audit/dipa/CHANGELOG_pflegecoach.md
 * dokumentiert").
 *
 * Warum das kein Formalismus ist: Diese Version verlässt das Haus. Sie steht
 * in `Questionnaire.version` jedes FHIR-Bundles, in `Bundle.meta.source`, im
 * Datenexport und in der Fusszeile. Ein Empfänger, der zwei Exporte
 * vergleicht, unterscheidet Produktstände allein an dieser Zahl. Für DiPA
 * kommt hinzu, dass sich Änderungsanzeigen genau darauf beziehen
 * (BfArM-Frage 20, `audit/dipa/bfarm_fragenkatalog.md`) — eine Version ohne
 * Eintrag ist eine Änderung, zu der es keine Beschreibung gibt.
 *
 * `lib/coach/version.ts` hatte keinen Test. Die Datei besteht aus vier
 * Konstanten und sieht deshalb wie nichts aus, was man prüfen müsste —
 * genau deshalb konnte sie fünfzehn Tage lang falsch stehen.
 *
 * WAS DIESE SUITE NICHT LEISTET: Sie kann nicht erkennen, ob die Version
 * hoch GEHÖRT. Ob aus den Änderungen seit 0.5.0 ein MINOR-Sprung und eine
 * Anzeigepflicht folgen, ist eine Produkt- und Zulassungsentscheidung. Der
 * offene Punkt ist im Changelog unter „Unversioniert" benannt; hier wird nur
 * durchgesetzt, dass die Zahl, die tatsächlich ausgeliefert wird, beschrieben
 * ist.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  COACH_PRODUKT_NAME,
  COACH_PRODUKT_STAND,
  COACH_PRODUKT_VERSION,
  COACH_SUPPORT_EMAIL,
} from '@/lib/coach/version'

const CHANGELOG = join(__dirname, '..', '..', 'audit', 'dipa', 'CHANGELOG_pflegecoach.md')
const text = readFileSync(CHANGELOG, 'utf8')

/** `## 1.2.3 — 2026-08-14 (…)` — die Schreibweise des Changelogs. */
const VERSIONS_UEBERSCHRIFT = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})/gm

function eintraege(): Array<{ version: string; datum: string }> {
  VERSIONS_UEBERSCHRIFT.lastIndex = 0
  const gefunden: Array<{ version: string; datum: string }> = []
  let t: RegExpExecArray | null
  while ((t = VERSIONS_UEBERSCHRIFT.exec(text)) !== null) {
    gefunden.push({ version: t[1], datum: t[2] })
  }
  return gefunden
}

/** SemVer als vergleichbare Zahlenfolge. */
function teile(v: string): number[] {
  return v.split('.').map(Number)
}

function neuerAls(a: string, b: string): boolean {
  const [x, y] = [teile(a), teile(b)]
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i]
  }
  return false
}

describe('Produktversion und Changelog', () => {
  it('das Changelog enthält überhaupt Versionsüberschriften (Gegenprobe)', () => {
    // Ohne diese Zeile wäre die ganze Suite grün, sobald sich die
    // Überschriftenform ändert und das Muster nichts mehr findet.
    expect(eintraege().length).toBeGreaterThanOrEqual(5)
  })

  it('die ausgelieferte Version hat einen eigenen Eintrag', () => {
    const versionen = eintraege().map(e => e.version)
    expect(
      versionen,
      `COACH_PRODUKT_VERSION ist ${COACH_PRODUKT_VERSION}, im Changelog steht dazu nichts. `
      + 'Diese Zahl geht in jedes FHIR-Bundle und in jeden Datenexport — sie muss beschrieben sein.',
    ).toContain(COACH_PRODUKT_VERSION)
  })

  it('kein Eintrag ist neuer als die ausgelieferte Version', () => {
    // Gegenrichtung: ein vorbereiteter Eintrag für eine Version, die noch
    // gar nicht ausgeliefert wird, ist ebenso irreführend — er liest sich
    // wie ein Stand, den niemand hat.
    const zuNeu = eintraege().filter(e => neuerAls(e.version, COACH_PRODUKT_VERSION))
    expect(zuNeu.map(e => e.version)).toEqual([])
  })

  it('COACH_PRODUKT_STAND stimmt mit dem Datum des Eintrags überein', () => {
    // Sonst nennt die Fusszeile ein Datum, das zu keinem Eintrag gehört.
    const treffer = eintraege().find(e => e.version === COACH_PRODUKT_VERSION)
    expect(treffer?.datum).toBe(COACH_PRODUKT_STAND)
  })

  it('die Einträge stehen absteigend — der neueste zuerst', () => {
    const versionen = eintraege().map(e => e.version)
    for (let i = 1; i < versionen.length; i++) {
      expect(
        neuerAls(versionen[i - 1], versionen[i]),
        `${versionen[i - 1]} steht über ${versionen[i]}, ist aber nicht neuer.`,
      ).toBe(true)
    }
  })

  it('die Version ist eine gültige SemVer', () => {
    expect(COACH_PRODUKT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(COACH_PRODUKT_STAND).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('Produktangaben, die nach aussen gehen', () => {
  it('der Produktname ist der eingetragene und wird nicht gebeugt', () => {
    expect(COACH_PRODUKT_NAME).toBe('Digitaler PflegeCoach')
  })

  it('die Support-Adresse zeigt auf das Unternehmen, nie auf eine Person', () => {
    // Der Hersteller-Support ist eine Produkteigenschaft (Verbraucherschutz).
    // Eine persönliche Adresse hier wäre zugleich ein Verstoss gegen die
    // Namens-Policy: kundengerichtet tritt nur „Alltagsengel" auf.
    expect(COACH_SUPPORT_EMAIL).toMatch(/^[a-z]+@alltagsengel\.care$/)
    expect(COACH_SUPPORT_EMAIL).toBe('info@alltagsengel.care')
  })

  it('das Changelog benennt den offenen Punkt, statt ihn wegzulassen', () => {
    // Zwischen 0.5.0 und heute liegen 35 Commits ohne Versionssprung. Ob
    // daraus ein MINOR und eine Anzeigepflicht folgt, ist eine Produkt-
    // entscheidung — dass die Lage benannt ist, ist keine.
    expect(text).toMatch(/^## Unversioniert/m)
  })
})
