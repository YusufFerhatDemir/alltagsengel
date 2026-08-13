// ═══════════════════════════════════════════════════════════════
// Wiedervorlage — Statusmaschine der Reprocessing-Queue
// ═══════════════════════════════════════════════════════════════
// Jeder Eintrag steht für einen abgelehnten oder gekürzten Betrag. Die
// Statusmaschine ist die einzige Stelle, die verhindert, dass so ein Betrag
// die Liste verlässt, ohne dass etwas passiert ist:
//   - 'erledigt' nur nach 'eingereicht' (es war wirklich etwas bei der Kasse)
//   - 'verworfen' nur mit Begründung (bewusstes Fallenlassen, nachlesbar)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  ERLAUBTE_UEBERGAENGE, pruefeUebergang, type WiedervorlageStatus,
} from '@/lib/abrechnung/wiedervorlage'

const ALLE: WiedervorlageStatus[] = [
  'offen', 'in_korrektur', 'korrigiert', 'eingereicht', 'erledigt', 'verworfen',
]

describe('Statusmaschine', () => {
  it('kennt jeden Status als Ausgangspunkt', () => {
    for (const s of ALLE) {
      expect(ERLAUBTE_UEBERGAENGE[s], `${s} fehlt in der Übergangstabelle`).toBeDefined()
    }
  })

  it('erlaubt "erledigt" ausschliesslich nach "eingereicht"', () => {
    for (const s of ALLE) {
      const erlaubt = ERLAUBTE_UEBERGAENGE[s].includes('erledigt')
      expect(erlaubt, `${s} → erledigt`).toBe(s === 'eingereicht')
    }
  })

  it('lässt einen offenen Eintrag NICHT direkt auf erledigt springen', () => {
    expect(pruefeUebergang('offen', 'erledigt')).toContain('nicht vorgesehen')
    expect(pruefeUebergang('in_korrektur', 'erledigt')).toContain('nicht vorgesehen')
    expect(pruefeUebergang('korrigiert', 'erledigt')).toContain('nicht vorgesehen')
  })

  it('behandelt "erledigt" und "verworfen" als Endzustände', () => {
    expect(ERLAUBTE_UEBERGAENGE.erledigt).toEqual([])
    expect(ERLAUBTE_UEBERGAENGE.verworfen).toEqual([])
    expect(pruefeUebergang('erledigt', 'offen')).toContain('kein weiterer Wechsel')
    expect(pruefeUebergang('verworfen', 'offen')).toContain('kein weiterer Wechsel')
  })

  it('verlangt für "verworfen" eine Begründung', () => {
    expect(pruefeUebergang('offen', 'verworfen')).toContain('Begründung')
    expect(pruefeUebergang('offen', 'verworfen', '   ')).toContain('Begründung')
    expect(pruefeUebergang('offen', 'verworfen', 'Versicherung bestand nicht — privat berechnet')).toBeNull()
  })

  it('erlaubt den regulären Weg bis zur Erledigung', () => {
    const weg: WiedervorlageStatus[] = ['offen', 'in_korrektur', 'korrigiert', 'eingereicht', 'erledigt']
    for (let i = 0; i < weg.length - 1; i++) {
      expect(pruefeUebergang(weg[i], weg[i + 1]), `${weg[i]} → ${weg[i + 1]}`).toBeNull()
    }
  })

  it('lässt einen erneut abgelehnten Eintrag zurück auf offen', () => {
    expect(pruefeUebergang('eingereicht', 'offen')).toBeNull()
  })

  it('lässt den Status unverändert stehen (Idempotenz beim Speichern)', () => {
    for (const s of ALLE) {
      const grund = s === 'verworfen' ? 'unverändert' : undefined
      expect(pruefeUebergang(s, s, grund), `${s} → ${s}`).toBeNull()
    }
  })
})
