/**
 * DiPA / PflegeCoach — der Pfeffer über den Freischaltcodes
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/coach/freischaltung.test.ts` prüft den Code-Mechanismus gründlich:
 * Format, Normalisierung, Gültigkeitsfenster, „gleicher Code → gleicher
 * Hash", „verschiedene Codes → verschiedene Hashes". Eine Sache prüft es
 * NICHT, und ausgerechnet die trägt die Sicherheit: dass der serverseitige
 * Pfeffer überhaupt in den Hash eingeht.
 *
 * Der Unterschied ist der ganze Punkt. Entfiele der Pfeffer bei einem
 * Umbau, blieben ALLE bestehenden Tests grün — gleiche Codes ergäben
 * weiterhin gleiche Hashes, verschiedene weiterhin verschiedene. Nur wäre
 * `code_hash` dann ein ungesalzener SHA-256 über einen Code aus einem
 * Raum von 31^12 ≈ 2^59,5 Möglichkeiten (Alphabet ohne 0/O/1/I/L, zwölf
 * Zeichen). Das ist gegen einen erbeuteten Datenbankauszug keine
 * ernsthafte Hürde mehr: Der Suchraum ist offline durchrechenbar, und
 * weil kein Salz je Zeile existiert, trifft ein Durchlauf ALLE Codes der
 * Tabelle gleichzeitig. Mit Pfeffer ist der Auszug allein wertlos —
 * er steht nur in der Umgebung, nicht in der Datenbank.
 *
 * Deshalb hier: eine Zeile, die rot wird, wenn der Pfeffer aus dem Hash
 * verschwindet, und die Prüfung, dass sein Fehlen sichtbar gemeldet wird
 * statt still hingenommen zu werden.
 *
 * ACHTUNG: `hashCode` liest `process.env` bei JEDEM Aufruf. Die Suite
 * setzt und entfernt die Variable deshalb je Test und stellt den
 * ursprünglichen Wert am Ende wieder her.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  CODE_ENV_PEPPER,
  codePraefix,
  erzeugeCode,
  hashCode,
  istCodeFormatGueltig,
  normalisiereCode,
  pepperKonfiguriert,
} from '@/lib/coach/freischaltung'

const URSPRUNG = process.env[CODE_ENV_PEPPER]
const CODE = 'ABCD-EFGH-JKMN'

beforeEach(() => {
  delete process.env[CODE_ENV_PEPPER]
})

afterAll(() => {
  if (URSPRUNG === undefined) delete process.env[CODE_ENV_PEPPER]
  else process.env[CODE_ENV_PEPPER] = URSPRUNG
})

describe('Der Pfeffer geht in den Hash ein', () => {
  it('derselbe Code ergibt mit und ohne Pfeffer verschiedene Hashes', () => {
    // DIE Zeile. Fällt der Pfeffer aus hashCode heraus, wird nur sie rot.
    const ohne = hashCode(CODE)
    process.env[CODE_ENV_PEPPER] = 'pfeffer-eins'
    const mit = hashCode(CODE)
    expect(mit).not.toBe(ohne)
  })

  it('zwei verschiedene Pfeffer ergeben verschiedene Hashes', () => {
    process.env[CODE_ENV_PEPPER] = 'pfeffer-eins'
    const a = hashCode(CODE)
    process.env[CODE_ENV_PEPPER] = 'pfeffer-zwei'
    const b = hashCode(CODE)
    expect(a).not.toBe(b)
  })

  it('bei gleichem Pfeffer bleibt der Hash reproduzierbar', () => {
    // Gegenrichtung: Wäre der Hash nicht stabil, liesse sich ein einmal
    // ausgegebener Code nie wieder einlösen.
    process.env[CODE_ENV_PEPPER] = 'pfeffer-eins'
    expect(hashCode(CODE)).toBe(hashCode('abcd efgh jkmn'))
  })

  it('der Pfeffer lässt sich nicht durch eine Code-Eingabe nachahmen', () => {
    // Der Trenner „|" zwischen Code und Pfeffer verhindert, dass sich
    // eine Grenzverschiebung konstruieren lässt. Der Code wird zudem
    // normalisiert — „|" käme in ihm ohnehin nicht an.
    process.env[CODE_ENV_PEPPER] = 'GEHEIM'
    const echt = hashCode(CODE)
    delete process.env[CODE_ENV_PEPPER]
    expect(hashCode(`${CODE}|GEHEIM`)).not.toBe(echt)
  })

  it('der Klartext-Code steht in keinem Hash', () => {
    process.env[CODE_ENV_PEPPER] = 'pfeffer-eins'
    const h = hashCode(CODE)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(normalisiereCode(CODE))
    expect(h.toUpperCase()).not.toContain('ABCD')
  })
})

describe('Ein fehlender Pfeffer wird gemeldet, nicht hingenommen', () => {
  it('pepperKonfiguriert bildet den Zustand ab', () => {
    expect(pepperKonfiguriert()).toBe(false)
    process.env[CODE_ENV_PEPPER] = 'x'
    expect(pepperKonfiguriert()).toBe(true)
  })

  it('ein leerer Wert zählt als nicht gesetzt', () => {
    // Sonst genügte `COACH_CODE_PEPPER=` in einer .env, um die Warnung
    // verstummen zu lassen, ohne dass ein Pfeffer wirkt.
    process.env[CODE_ENV_PEPPER] = ''
    expect(pepperKonfiguriert()).toBe(false)
  })

  it('die Betriebsroute reicht den Zustand nach aussen', () => {
    // Ohne diesen Weg wäre `pepperKonfiguriert()` eine Funktion ohne
    // Aufrufer — ein Schutz, den niemand je zu sehen bekommt.
    const route = readFileSync(
      join(__dirname, '..', '..', 'app', 'api', 'dipa', 'codes', 'route.ts'), 'utf8',
    )
    expect(route).toContain('pepperKonfiguriert')
    expect(route).toMatch(/pepperKonfiguriert:\s*pepperKonfiguriert\(\)/)
  })

  it('die Admin-Oberfläche warnt sichtbar', () => {
    const seite = readFileSync(
      join(__dirname, '..', '..', 'app', 'admin', 'dipa', 'page.tsx'), 'utf8',
    )
    expect(seite).toContain('pepperKonfiguriert')
    expect(seite).toContain('COACH_CODE_PEPPER')
  })
})

describe('Codeerzeugung — die Annahmen hinter der Suchraumgrösse', () => {
  it('das Alphabet enthält keine verwechselbaren Zeichen', () => {
    // Barrierefreiheit (Vorlesen am Telefon, gedruckte Codes) UND
    // Voraussetzung der Rechnung oben: 31 Zeichen, nicht 36.
    const zeichen = new Set(erzeugeCode().replace(/-/g, ''))
    for (const verboten of ['0', 'O', '1', 'I', 'L']) {
      expect([...zeichen]).not.toContain(verboten)
    }
  })

  it('erzeugte Codes haben das erwartete Format', () => {
    for (let i = 0; i < 50; i++) {
      const code = erzeugeCode()
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(istCodeFormatGueltig(code)).toBe(true)
      expect(codePraefix(code)).toBe(code.slice(0, 4))
    }
  })

  it('50 erzeugte Codes sind verschieden', () => {
    // Keine Aussage über die Güte des Zufalls — nur die Gegenprobe gegen
    // einen Generator, der stillschweigend denselben Wert liefert.
    const codes = Array.from({ length: 50 }, () => erzeugeCode())
    expect(new Set(codes).size).toBe(50)
  })

  it('das Präfix verrät nur vier von zwölf Zeichen', () => {
    // Es steht in der Betriebsliste im Klartext. Wäre es länger, wäre die
    // Liste selbst eine Abkürzung zum Code.
    const code = erzeugeCode()
    expect(codePraefix(code)).toHaveLength(4)
    expect(normalisiereCode(code)).toHaveLength(12)
  })
})
