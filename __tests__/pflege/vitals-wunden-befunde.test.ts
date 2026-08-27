/**
 * Vitalwerte-Alarme und Wunddokumentation — drei Befunde
 *
 *  1. `berechneAktuelleAlarme()` las die jüngste Messung aus der REIHENFOLGE
 *     der Eingabe ab („die erste je (Klient, Typ) ist die jüngste"). Das ist
 *     eine Zusage an den Aufrufer, die kein Compiler und kein Test
 *     einforderte: wer nach `created_at` sortiert, aufsteigend sortiert oder
 *     mehrere Abfragen zusammenfügt, bekam eine ÄLTERE Messung als
 *     „aktuellen Zustand" bewertet. Bei einem kritischen Blutdruck ist das
 *     der Unterschied zwischen Alarm und Ruhe.
 *
 *  2. `pushFlaechePunkte()` sprang bei NaN auf die HÖCHSTE Flächenklasse:
 *     `NaN < 0` ist false, und `NaN <= grenze` für jede Klasse ebenfalls —
 *     findIndex lieferte -1, die Funktion gab 10 zurück. Eine
 *     fehlgeschlagene Zahlenumwandlung im Formular erzeugte damit den Befund
 *     „größte Wundfläche".
 *
 *  3. `updateWound()` prüfte den Dekubitus-Grad nur, wenn er MITGESCHICKT
 *     wurde. Der Wechsel des Wundtyps WEG von 'dekubitus' liess den
 *     bestehenden Grad stehen — der DB-Constraint fängt das ab, aber als
 *     rohe Postgres-Meldung, die der Sanitizer fail-closed zu
 *     "Interner Serverfehler" verwischt.
 */

import { describe, it, expect } from 'vitest'
import { berechneAktuelleAlarme } from '@/lib/vitals/vitals'
import type { VitalSign, VitalSignThreshold } from '@/lib/vitals/types'
import { pushFlaechePunkte, berechnePushScore } from '@/lib/wunden/push-score'
import { updateWound } from '@/lib/wunden/wunden'
import { erstelleFakeSupabase, hatOrgFence } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-00000000a001'
const WUNDE = '00000000-0000-4000-8000-0000000000w1'
const KLIENT = '00000000-0000-4000-8000-0000000000d1'

function messung(ueber: Partial<VitalSign>): VitalSign {
  return {
    id: 'v-1',
    client_id: KLIENT,
    type: 'puls',
    value: 70,
    value_secondary: null,
    unit: '/min',
    measured_at: '2026-05-10T08:00:00.000Z',
    measured_by: 'u-1',
    measured_by_name: 'Anna',
    measured_by_role: 'engel',
    notes: null,
    ...ueber,
  } as VitalSign
}

const GRENZWERT: VitalSignThreshold = {
  id: 't-1',
  client_id: KLIENT,
  type: 'puls',
  min_warn: 55,
  max_warn: 100,
  min_critical: 45,
  max_critical: 130,
  enabled: true,
} as VitalSignThreshold

// ═════════════════════════════════════════════════════════════════════
describe('berechneAktuelleAlarme — die jüngste Messung wird selbst bestimmt', () => {
  it('bewertet die jüngste Messung, auch wenn sie zuletzt kommt', () => {
    const alarme = berechneAktuelleAlarme([
      messung({ id: 'alt', value: 70, measured_at: '2026-05-10T08:00:00.000Z' }),
      messung({ id: 'neu', value: 180, measured_at: '2026-05-10T20:00:00.000Z' }),
    ], [GRENZWERT])
    expect(alarme).toHaveLength(1)
    expect(alarme[0].messung.id).toBe('neu')
    expect(alarme[0].bewertung.stufe).toBe('kritisch')
  })

  it('meldet KEINEN Alarm, wenn die jüngste Messung wieder normal ist', () => {
    const alarme = berechneAktuelleAlarme([
      messung({ id: 'alt', value: 180, measured_at: '2026-05-10T08:00:00.000Z' }),
      messung({ id: 'neu', value: 70, measured_at: '2026-05-10T20:00:00.000Z' }),
    ], [GRENZWERT])
    expect(alarme).toHaveLength(0)
  })

  it('bleibt bei absteigend sortierter Eingabe unverändert korrekt', () => {
    const alarme = berechneAktuelleAlarme([
      messung({ id: 'neu', value: 180, measured_at: '2026-05-10T20:00:00.000Z' }),
      messung({ id: 'alt', value: 70, measured_at: '2026-05-10T08:00:00.000Z' }),
    ], [GRENZWERT])
    expect(alarme[0].messung.id).toBe('neu')
  })

  it('bestimmt je (Klient, Typ) getrennt', () => {
    const klient2 = '00000000-0000-4000-8000-0000000000d2'
    const alarme = berechneAktuelleAlarme([
      messung({ id: 'a-alt', value: 180, measured_at: '2026-05-10T08:00:00.000Z' }),
      messung({ id: 'a-neu', value: 70, measured_at: '2026-05-10T20:00:00.000Z' }),
      messung({ id: 'b-alt', client_id: klient2, value: 70, measured_at: '2026-05-10T08:00:00.000Z' }),
      messung({ id: 'b-neu', client_id: klient2, value: 180, measured_at: '2026-05-10T20:00:00.000Z' }),
    ], [GRENZWERT, { ...GRENZWERT, id: 't-2', client_id: klient2 }])
    expect(alarme.map(a => a.messung.id)).toEqual(['b-neu'])
  })

  it('verträgt gleiche Zeitstempel ohne zu kippen', () => {
    const alarme = berechneAktuelleAlarme([
      messung({ id: 'x', value: 180, measured_at: '2026-05-10T08:00:00.000Z' }),
      messung({ id: 'y', value: 190, measured_at: '2026-05-10T08:00:00.000Z' }),
    ], [GRENZWERT])
    expect(alarme).toHaveLength(1)
    expect(alarme[0].messung.id).toBe('x')
  })

  it('sortiert kritische Alarme vor Warnungen', () => {
    const klient2 = '00000000-0000-4000-8000-0000000000d2'
    const alarme = berechneAktuelleAlarme([
      messung({ id: 'warn', value: 110, measured_at: '2026-05-10T20:00:00.000Z' }),
      messung({ id: 'krit', client_id: klient2, value: 180, measured_at: '2026-05-10T08:00:00.000Z' }),
    ], [GRENZWERT, { ...GRENZWERT, id: 't-2', client_id: klient2 }])
    expect(alarme.map(a => a.bewertung.stufe)).toEqual(['kritisch', 'warnung'])
  })

  it('gibt bei leerer Eingabe nichts zurück', () => {
    expect(berechneAktuelleAlarme([], [GRENZWERT])).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('pushFlaechePunkte — keine Höchstpunktzahl aus einer kaputten Zahl', () => {
  it('wirft bei NaN statt 10 Punkte zu vergeben', () => {
    expect(() => pushFlaechePunkte(Number('abc'), 2)).toThrow(/endliche Zahlen/)
  })

  it('wirft bei NaN in der Breite', () => {
    expect(() => pushFlaechePunkte(2, Number.NaN)).toThrow(/endliche Zahlen/)
  })

  it('wirft bei Infinity', () => {
    expect(() => pushFlaechePunkte(Number.POSITIVE_INFINITY, 1)).toThrow(/endliche Zahlen/)
  })

  it('wirft weiterhin bei negativen Massen', () => {
    expect(() => pushFlaechePunkte(-1, 2)).toThrow(/negativ/)
  })

  it('gibt bei fehlenden Massen null zurück (kein Teilwert)', () => {
    expect(pushFlaechePunkte(null, 2)).toBeNull()
    expect(pushFlaechePunkte(2, null)).toBeNull()
  })

  it('rechnet die Klassen unverändert', () => {
    expect(pushFlaechePunkte(0, 0)).toBe(0)
    expect(pushFlaechePunkte(0.5, 0.5)).toBe(1)   // 0,25 cm² ≤ 0,3
    expect(pushFlaechePunkte(1, 1)).toBe(3)       // 1,0 cm² ≤ 1,0
    expect(pushFlaechePunkte(10, 10)).toBe(10)    // 100 cm² über allen Klassen
  })

  it('reisst den Gesamtscore mit, statt ihn zu verfälschen', () => {
    expect(() => berechnePushScore({
      laengeCm: Number.NaN, breiteCm: 2, exsudatMenge: 'wenig',
      granulationPct: 100, fibrinPct: 0, nekrosePct: 0, epithelPct: 0,
    })).toThrow(/endliche Zahlen/)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('updateWound — Wundtypwechsel weg von Dekubitus', () => {
  function fake(dekubitusGrad: number | null) {
    return erstelleFakeSupabase(a =>
      a.operation === 'select'
        ? { data: { wund_typ: 'dekubitus', dekubitus_grad: dekubitusGrad } }
        : { data: { id: WUNDE } },
    )
  }

  it('meldet den stehengebliebenen Grad verständlich, statt ihn der DB zu überlassen', async () => {
    const f = fake(3)
    await expect(updateWound(f.client, WUNDE, ORG, { wundTyp: 'ulcus_cruris' }))
      .rejects.toThrow(/verträgt keinen Dekubitus-Grad/)
    expect(f.aufrufe.some(a => a.operation === 'update')).toBe(false)
  })

  it('lässt den Typwechsel zu, wenn der Grad mit entfernt wird', async () => {
    const f = fake(3)
    await updateWound(f.client, WUNDE, ORG, { wundTyp: 'ulcus_cruris', dekubitusGrad: null })
    expect(f.aufrufe.some(a => a.operation === 'update')).toBe(true)
  })

  it('lässt den Typwechsel zu, wenn gar kein Grad hinterlegt war', async () => {
    const f = fake(null)
    await updateWound(f.client, WUNDE, ORG, { wundTyp: 'ulcus_cruris' })
    expect(f.aufrufe.some(a => a.operation === 'update')).toBe(true)
  })

  it('prüft den Bestand mit Mandanten-Fence', async () => {
    const f = fake(null)
    await updateWound(f.client, WUNDE, ORG, { wundTyp: 'ulcus_cruris' })
    expect(hatOrgFence(f.aufrufe.find(a => a.operation === 'select'), ORG)).toBe(true)
  })

  it('meldet eine unbekannte Wunde mit 404', async () => {
    const f = erstelleFakeSupabase(a => (a.operation === 'select' ? { data: null } : { data: {} }))
    await expect(updateWound(f.client, WUNDE, ORG, { wundTyp: 'ulcus_cruris' }))
      .rejects.toThrow(/nicht gefunden/)
  })

  it('greift NICHT, wenn der Typ auf dekubitus wechselt', async () => {
    const f = erstelleFakeSupabase(a =>
      a.operation === 'select' ? { data: { wund_typ: 'ulcus_cruris', dekubitus_grad: null } } : { data: { id: WUNDE } },
    )
    await updateWound(f.client, WUNDE, ORG, { wundTyp: 'dekubitus' })
    expect(f.aufrufe.some(a => a.operation === 'update')).toBe(true)
  })

  it('greift NICHT, wenn der Typ gar nicht angefasst wird', async () => {
    const f = erstelleFakeSupabase(() => ({ data: { id: WUNDE } }))
    await updateWound(f.client, WUNDE, ORG, { bemerkung: 'Verband gewechselt' })
    expect(f.aufrufe.filter(a => a.operation === 'select')).toHaveLength(0)
  })
})
