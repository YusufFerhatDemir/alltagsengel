/**
 * Mandanten-Konsistenz der Bestandsdaten
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WOZU (Block 51, 14.09.2026)
 *
 * `lint:org-id` verhindert, dass ein NEUER Dienstschluessel-Insert die
 * `organization_id` vergisst. Was dabei ENTSTEHT, hat niemand gemessen:
 * eine Zeile, deren `organization_id` nicht zu der ihres
 * Fremdschluessels passt — ein Leistungsnachweis bei Mandant A, dessen
 * Klient zu B gehoert.
 *
 * Der RESTRICTIVE `org_fence` versteckt so eine Zeile vor dem eigenen
 * Mandanten UND zeigt sie dem fremden. Beide Wirkungen sind still.
 *
 * Live am 14.09.2026: 283 Beziehungen geprueft, 146 verglichene
 * Zeilenpaare, 0 mit Drift.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  leseKonsistenzAntwort, istKonsistenzBefund, konsistenzMeldung,
} from '@/lib/mandant/konsistenz'

describe('leseKonsistenzAntwort', () => {
  it('liest „nichts gefunden" mit der Zahl der geprueften Beziehungen', () => {
    const b = leseKonsistenzAntwort('\nGEPRUEFT|283')
    expect(b.geprueft).toBe(283)
    expect(b.drift).toEqual([])
  })

  it('liest eine Drift-Zeile', () => {
    const b = leseKonsistenzAntwort('service_records|client_id|clients|3\nGEPRUEFT|283')
    expect(b.drift).toEqual([
      { kind: 'service_records', spalte: 'client_id', eltern: 'clients', anzahl: 3 },
    ])
    expect(b.geprueft).toBe(283)
  })

  it('liest mehrere Drift-Zeilen', () => {
    const b = leseKonsistenzAntwort(
      'a|x|b|5\nc|y|d|1\nGEPRUEFT|283')
    expect(b.drift.map(d => d.anzahl)).toEqual([5, 1])
  })

  it('ignoriert Zeilen mit Anzahl 0 — sie sind kein Befund', () => {
    expect(leseKonsistenzAntwort('a|x|b|0\nGEPRUEFT|10').drift).toEqual([])
  })

  it('ignoriert unvollstaendige Zeilen, statt sie zu erfinden', () => {
    expect(leseKonsistenzAntwort('kaputt\nGEPRUEFT|10').drift).toEqual([])
  })

  it('bleibt bei 0 geprueft, wenn die Marke fehlt', () => {
    expect(leseKonsistenzAntwort('a|x|b|5').geprueft).toBe(0)
  })
})

describe('istKonsistenzBefund', () => {
  it('grün, wenn geprueft wurde und nichts driftet', () => {
    expect(istKonsistenzBefund({ geprueft: 283, drift: [] })).toBe(false)
  })

  it('rot bei Drift', () => {
    expect(istKonsistenzBefund({
      geprueft: 283, drift: [{ kind: 'a', spalte: 'x', eltern: 'b', anzahl: 1 }],
    })).toBe(true)
  })

  it('rot, wenn NICHTS geprueft wurde — kein Freispruch bei Blindheit', () => {
    // Block 50: ein Lauf, der bei Blindheit gruen meldet, ist schlimmer
    // als keiner.
    expect(istKonsistenzBefund({ geprueft: 0, drift: [] })).toBe(true)
  })
})

describe('konsistenzMeldung', () => {
  it('nennt bei 0 geprueft die Blindheit beim Namen', () => {
    expect(konsistenzMeldung({ geprueft: 0, drift: [] })).toContain('kein Freispruch')
  })

  it('nennt die Zahl der geprueften Beziehungen', () => {
    expect(konsistenzMeldung({ geprueft: 283, drift: [] })).toContain('283')
  })

  it('nennt bei Drift Tabelle, Spalte und Anzahl', () => {
    const m = konsistenzMeldung({
      geprueft: 283,
      drift: [{ kind: 'service_records', spalte: 'client_id', eltern: 'clients', anzahl: 3 }],
    })
    expect(m).toContain('service_records.client_id -> clients')
    expect(m).toContain('3 Zeile(n)')
  })

  it('erklaert, warum die Wirkung in BEIDE Richtungen geht', () => {
    const m = konsistenzMeldung({
      geprueft: 1, drift: [{ kind: 'a', spalte: 'x', eltern: 'b', anzahl: 1 }],
    })
    expect(m).toContain('unsichtbar')
    expect(m).toContain('sichtbar')
  })
})

describe('der Prueflauf', () => {
  const q = readFileSync('scripts/verify-mandanten-konsistenz.ts', 'utf8')

  it('leitet die Beziehungen aus dem SCHEMA ab, nicht aus einer Liste', () => {
    // Eine handgepflegte Aufzaehlung waere nach der naechsten Migration
    // unvollstaendig — und meldete dann gruen ueber eine Tabelle, die sie
    // gar nicht kennt.
    expect(q).toContain('pg_constraint')
    expect(q).toContain("fk.contype = 'f'")
  })

  it('verlangt organization_id auf BEIDEN Seiten', () => {
    const treffer = q.match(/attname = 'organization_id'/g) ?? []
    expect(treffer.length).toBe(2)
  })

  it('vergleicht NULL-sicher (IS DISTINCT FROM)', () => {
    // `<>` liesse jede Zeile mit NULL durch — und genau die entsteht,
    // wenn der Spalten-Default nicht griff.
    expect(q).toContain('IS DISTINCT FROM')
  })

  it('benutzt den Orakel-Helfer aus Block 50', () => {
    expect(q).toContain('frageOrakel(')
  })

  it('ist als npm-Skript verdrahtet', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['verify:mandanten-konsistenz'])
      .toBe('tsx scripts/verify-mandanten-konsistenz.ts')
  })
})
