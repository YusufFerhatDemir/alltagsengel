/**
 * ArbZG — dieselbe Regel in TypeScript und in der Datenbank
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 52, 14.09.2026)
 *
 * Die Arbeitszeit eines Tages wurde an zwei Stellen verschieden
 * gerechnet:
 *
 *   TypeScript  netto = istMinuten ?? (ende − start − pause)
 *   Datenbank   netto = GREATEST(istMinuten, ende − start − pause)
 *
 * TypeScript nahm den EINGETRAGENEN Wert, wenn er dastand. Die Datenbank
 * nimmt den groesseren. Der Unterschied ist nicht formal: § 2 Abs. 1
 * ArbZG bestimmt die Arbeitszeit als die Zeit von Beginn bis Ende ohne
 * Ruhepausen — die Uhrzeiten sind massgeblich, nicht die Eintragung. Ein
 * zu klein erfasstes `ist_minuten` machte einen 11,5-Stunden-Tag in der
 * Anwendung beschwerdefrei, waehrend der Trigger den Verstoss schrieb.
 *
 * WARUM ES NIEMAND MERKTE
 * `pruefeArbeitstag` und `pruefeRuhezeit` haben ausser Tests KEINEN
 * Aufrufer. Die Durchsetzung liegt allein beim DB-Trigger
 * `arbzg_pruefung_ist`. Die 26 bestehenden Tests des Moduls bestanden
 * mit dem alten Code unveraendert — der abweichende Fall war nie
 * geprueft.
 *
 * Live: `personal_arbeitszeiten` ist leer, `arbeitszeit_verstoesse`
 * ebenso. Kein Schaden im Bestand; der Weg dahin stand offen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  pruefeArbeitstag,
  MAX_TAGESARBEITSZEIT_MINUTEN,
  MIN_RUHEZEIT_MINUTEN,
  PFLICHTPAUSE_STUFEN,
} from '@/lib/personal/arbzg'

const MIGRATION = readFileSync(
  'supabase/migrations/20260829184500_arbzg_ist_arbeitszeit.sql', 'utf8')

describe('die Uhrzeiten schlagen die Eintragung (§ 2 Abs. 1 ArbZG)', () => {
  it('meldet den Verstoss, obwohl `istMinuten` zu klein eingetragen ist', () => {
    // 06:00–18:00 abzueglich 30 min Pause = 690 min. Wer 480 eintraegt,
    // macht daraus keinen zulaessigen Tag.
    const b = pruefeArbeitstag({
      startZeit: '06:00', endZeit: '18:00', pauseMinuten: 30, istMinuten: 480,
    })
    const tag = b.find(x => x.art === 'max_tagesarbeitszeit')
    expect(tag).toBeDefined()
    expect(tag!.gemessenMinuten).toBe(690)
  })

  it('nimmt `istMinuten`, wenn es GROESSER ist als die Uhrzeitspanne', () => {
    // Nachgetragene Arbeit ausserhalb der erfassten Spanne.
    const b = pruefeArbeitstag({
      startZeit: '08:00', endZeit: '16:00', pauseMinuten: 30, istMinuten: 700,
    })
    expect(b.find(x => x.art === 'max_tagesarbeitszeit')?.gemessenMinuten).toBe(700)
  })

  it('bemisst auch die Pflichtpause an der groesseren Dauer', () => {
    // 8 h Uhrzeitspanne ohne Pause: § 4 verlangt 30 min. Ein kleineres
    // `istMinuten` darf die Pflicht nicht wegrechnen.
    const b = pruefeArbeitstag({
      startZeit: '08:00', endZeit: '16:00', pauseMinuten: 0, istMinuten: 300,
    })
    const pause = b.find(x => x.art === 'pflichtpause')
    expect(pause).toBeDefined()
    expect(pause!.grenzwertMinuten).toBe(30)
  })

  it('kommt ohne Uhrzeiten mit `istMinuten` allein aus', () => {
    const b = pruefeArbeitstag({ startZeit: '', endZeit: '', istMinuten: 700 })
    expect(b.find(x => x.art === 'max_tagesarbeitszeit')?.gemessenMinuten).toBe(700)
  })

  it('meldet ohne jede Angabe nichts — statt 0 zu behaupten', () => {
    expect(pruefeArbeitstag({ startZeit: '', endZeit: '' })).toEqual([])
  })

  it('ein zulaessiger Tag bleibt zulaessig', () => {
    expect(pruefeArbeitstag({
      startZeit: '08:00', endZeit: '16:30', pauseMinuten: 30, istMinuten: 480,
    })).toEqual([])
  })
})

describe('TypeScript und Migration tragen dieselben Grenzwerte', () => {
  it('§ 3 ArbZG — 600 Minuten', () => {
    expect(MAX_TAGESARBEITSZEIT_MINUTEN).toBe(600)
    expect(MIGRATION).toContain('v_grenzwert_tag  CONSTANT int := 600')
  })

  it('§ 5 ArbZG — 660 Minuten', () => {
    expect(MIN_RUHEZEIT_MINUTEN).toBe(660)
    expect(MIGRATION).toContain('v_grenzwert_ruhe CONSTANT int := 660')
  })

  it('§ 4 ArbZG — die Pausenstufen 540→45 und 360→30', () => {
    expect(PFLICHTPAUSE_STUFEN.map(s => [s.abMinutenAusschliesslich, s.pauseMinuten]))
      .toEqual([[540, 45], [360, 30]])
    expect(MIGRATION).toContain('WHEN v_dauer_minuten > 540 THEN 45')
    expect(MIGRATION).toContain('WHEN v_dauer_minuten > 360 THEN 30')
  })

  it('die Schwellen sind „mehr als", nicht „ab" — 360 Minuten loesen nichts aus', () => {
    // Genau 6 h ohne Pause ist zulaessig. Ein `>=` waere eine andere
    // Rechtslage.
    expect(pruefeArbeitstag({ startZeit: '08:00', endZeit: '14:00', pauseMinuten: 0 }))
      .toEqual([])
    expect(MIGRATION).not.toContain('v_dauer_minuten >= 360')
  })

  it('beide Seiten bilden die Dauer als GROESSTEN Wert', () => {
    // Das ist die Formel, die auseinandergelaufen war.
    expect(MIGRATION).toContain('GREATEST(COALESCE(NEW.ist_minuten, 0)')
    const ts = readFileSync('lib/personal/arbzg.ts', 'utf8')
    expect(ts).toContain('Math.max(ausZeiten, erfasst ?? 0)')
  })
})

describe('die Durchsetzung ist benannt', () => {
  const ts = readFileSync('lib/personal/arbzg.ts', 'utf8')

  it('der Kopf sagt, dass NICHT diese Datei durchsetzt', () => {
    // Der naechste Leser soll nicht annehmen, ein Aufruf dieser Funktionen
    // verhindere etwas.
    expect(ts).toContain('arbzg_pruefung_ist')
    expect(ts).toContain('KEINEN Aufrufer')
  })

  it('und dass eine Aenderung ZWEI Stellen betrifft', () => {
    expect(ts).toContain('ZWEI Stellen')
  })
})
