/**
 * Invarianten der Bewerber-Pipeline.
 * @see lib/bewerbung/pipeline.ts
 *
 * ── WARUM DIESE DATEI ─────────────────────────────────────────────────
 * Die Pipeline besteht aus vier Listen, die zusammenpassen müssen:
 * dem Stufenkatalog, der Reihenfolge, den Endzuständen und der Abbildung
 * auf die groben CRM-Status in `lib/admin/ops.ts`. Beim Release-Check am
 * 13.09.2026 war das alles stimmig — geprüft hatte es nur nie jemand.
 *
 * Eine Stufe, die im Katalog steht und nicht in der Reihenfolge, ist
 * unerreichbar. Eine mit einem `dbStatus`, den `APPLICATION_FLOW` nicht
 * kennt, lehnt die Datenbank beim Schreiben ab. Ein Endzustand mit
 * Wiedervorlage erzeugt Erinnerungen an einen abgeschlossenen Vorgang.
 * Keiner dieser Fehler fällt beim Lesen des Codes auf; alle drei fallen
 * hier auf.
 */
import { describe, it, expect } from 'vitest'
import {
  BEWERBER_STUFEN, BEWERBER_STUFEN_FLOW, BEWERBER_VORWAERTS,
  BEWERBER_ENDZUSTAENDE, bewerberStufe,
} from '@/lib/bewerbung/pipeline'
import { APPLICATION_FLOW } from '@/lib/admin/ops'

const KEYS = BEWERBER_STUFEN.map(s => s.key)

describe('Katalog und Reihenfolge', () => {
  it('enthalten dieselben Stufen', () => {
    expect([...KEYS].sort()).toEqual([...BEWERBER_STUFEN_FLOW].sort())
  })

  it('stehen in derselben Reihenfolge', () => {
    // Sonst zeigt die Liste eine andere Abfolge als die Knöpfe anbieten.
    expect(KEYS).toEqual([...BEWERBER_STUFEN_FLOW])
  })

  it('haben keine doppelten Schlüssel', () => {
    expect(new Set(KEYS).size).toBe(KEYS.length)
  })

  it('jede Stufe erklärt sich selbst', () => {
    for (const s of BEWERBER_STUFEN) {
      expect(s.label.length, s.key).toBeGreaterThan(2)
      expect(s.aufgabe.length, s.key).toBeGreaterThan(10)
      expect(s.color, s.key).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})

describe('Abbildung auf die groben CRM-Status', () => {
  it('jeder dbStatus steht in APPLICATION_FLOW', () => {
    // Ein Wert, den die Spalte nicht kennt, wird beim Schreiben abgelehnt —
    // und zwar erst zur Laufzeit, beim Stufenwechsel einer echten Bewerbung.
    const unbekannt = BEWERBER_STUFEN
      .filter(s => !APPLICATION_FLOW.includes(s.dbStatus))
      .map(s => `${s.key} → ${s.dbStatus}`)
    expect(unbekannt).toEqual([])
  })

  it('die Abbildung ist gröber, nicht feiner', () => {
    // Elf feine Stufen auf fünf grobe Status: mehrere feine duerfen sich
    // einen groben teilen, aber keine feine darf zwei grobe haben.
    const je = new Map<string, Set<string>>()
    for (const s of BEWERBER_STUFEN) {
      je.set(s.key, (je.get(s.key) ?? new Set()).add(s.dbStatus))
    }
    for (const [k, v] of je) expect(v.size, k).toBe(1)
    expect(new Set(BEWERBER_STUFEN.map(s => s.dbStatus)).size)
      .toBeLessThanOrEqual(APPLICATION_FLOW.length)
  })
})

describe('Endzustände', () => {
  it('stehen alle im Katalog', () => {
    for (const e of BEWERBER_ENDZUSTAENDE) expect(KEYS, e).toContain(e)
  })

  it('tragen KEINE Wiedervorlage', () => {
    // Sonst erinnert die Kette an einen abgeschlossenen Vorgang — und zwar
    // taeglich, bis jemand nachsieht, warum.
    for (const s of BEWERBER_STUFEN) {
      if (!BEWERBER_ENDZUSTAENDE.includes(s.key)) continue
      expect(s.wiedervorlageTage, `${s.key} ist Endzustand`).toBeNull()
    }
  })

  it('jede OFFENE Stufe trägt eine Wiedervorlage', () => {
    // Ohne sie faellt der Vorgang aus der Leiter — genau die Luecke, aus
    // der der Rueckstand vom 12.09.2026 entstanden ist.
    for (const s of BEWERBER_STUFEN) {
      if (BEWERBER_ENDZUSTAENDE.includes(s.key)) continue
      expect(s.wiedervorlageTage, `${s.key} ist offen`).toBeGreaterThan(0)
    }
  })

  it('BEWERBER_VORWAERTS lässt die Abzweige aus', () => {
    // „Abgelehnt" und „archiviert" sind Entscheidungen mit eigenem Knopf,
    // kein naechster Schritt, den man versehentlich anklickt.
    expect(BEWERBER_VORWAERTS).not.toContain('abgelehnt')
    expect(BEWERBER_VORWAERTS).not.toContain('archiviert')
    expect(BEWERBER_VORWAERTS).toContain('einsatzbereit')
  })
})

describe('bewerberStufe', () => {
  it('gibt zu jedem Schlüssel einen Eintrag', () => {
    for (const k of KEYS) expect(bewerberStufe(k).key).toBe(k)
  })

  it('stürzt bei einem unbekannten Schlüssel nicht ab', () => {
    // In der DB koennen Stufen aus frueheren Ausbaustufen stehen. Eine
    // Liste, die daran abstuerzt, ist schlechter als eine mit Rohtext.
    expect(() => bewerberStufe('gibtesnicht')).not.toThrow()
  })
})
