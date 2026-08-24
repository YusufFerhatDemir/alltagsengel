// ═══════════════════════════════════════════════════════════════
// Welle 5d — Dead-Letter-Queue Statusmaschine Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: pruefeDeadLetterUebergang, DEAD_LETTER_UEBERGAENGE,
// DEAD_LETTER_GRUND_TEXT.
// DB-Operationen (inDeadLetter, aktualisiereDeadLetter etc.) nicht getestet.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  pruefeDeadLetterUebergang,
  DEAD_LETTER_UEBERGAENGE,
  DEAD_LETTER_GRUND_TEXT,
  type DeadLetterStatus,
  type DeadLetterGrund,
} from '../dead-letter'

// ---------------------------------------------------------------------------
// pruefeDeadLetterUebergang — Statusmaschine
// ---------------------------------------------------------------------------

describe('pruefeDeadLetterUebergang', () => {
  // ─ Erlaubte Übergänge ─
  test('offen → in_analyse erlaubt', () => {
    assert.equal(pruefeDeadLetterUebergang('offen', 'in_analyse'), null)
  })

  test('offen → wiedervorgelegt erlaubt', () => {
    assert.equal(pruefeDeadLetterUebergang('offen', 'wiedervorgelegt'), null)
  })

  test('offen → verworfen erlaubt (mit Grund)', () => {
    assert.equal(pruefeDeadLetterUebergang('offen', 'verworfen', 'Kasse existiert nicht mehr'), null)
  })

  test('in_analyse → wiedervorgelegt erlaubt', () => {
    assert.equal(pruefeDeadLetterUebergang('in_analyse', 'wiedervorgelegt'), null)
  })

  test('in_analyse → offen erlaubt (zurücklegen)', () => {
    assert.equal(pruefeDeadLetterUebergang('in_analyse', 'offen'), null)
  })

  test('wiedervorgelegt → erledigt erlaubt', () => {
    assert.equal(pruefeDeadLetterUebergang('wiedervorgelegt', 'erledigt'), null)
  })

  test('wiedervorgelegt → offen erlaubt (erneut gescheitert)', () => {
    assert.equal(pruefeDeadLetterUebergang('wiedervorgelegt', 'offen'), null)
  })

  // ─ Verbotene Übergänge ─
  test('offen → erledigt VERBOTEN (erledigt nur via wiedervorgelegt)', () => {
    const fehler = pruefeDeadLetterUebergang('offen', 'erledigt')
    assert.ok(fehler !== null)
    assert.ok(fehler!.includes('nicht vorgesehen'))
  })

  test('in_analyse → erledigt VERBOTEN', () => {
    const fehler = pruefeDeadLetterUebergang('in_analyse', 'erledigt')
    assert.ok(fehler !== null)
  })

  test('erledigt → offen VERBOTEN (Endzustand)', () => {
    const fehler = pruefeDeadLetterUebergang('erledigt', 'offen')
    assert.ok(fehler !== null)
    assert.ok(fehler!.includes('kein weiterer Wechsel'))
  })

  test('verworfen → offen VERBOTEN (Endzustand)', () => {
    const fehler = pruefeDeadLetterUebergang('verworfen', 'offen')
    assert.ok(fehler !== null)
  })

  test('erledigt hat keine erlaubten Übergaenge', () => {
    assert.deepEqual(DEAD_LETTER_UEBERGAENGE['erledigt'], [])
  })

  test('verworfen hat keine erlaubten Übergaenge', () => {
    assert.deepEqual(DEAD_LETTER_UEBERGAENGE['verworfen'], [])
  })

  // ─ verworfen braucht Begründung ─
  test('verworfen OHNE Grund → Fehler', () => {
    const fehler = pruefeDeadLetterUebergang('offen', 'verworfen')
    assert.ok(fehler !== null)
    assert.ok(fehler!.includes('verworfenGrund'))
  })

  test('verworfen mit leerem Grund → Fehler', () => {
    const fehler = pruefeDeadLetterUebergang('offen', 'verworfen', '   ')
    assert.ok(fehler !== null)
  })

  test('verworfen mit gueltigem Grund → null', () => {
    assert.equal(pruefeDeadLetterUebergang('offen', 'verworfen', 'Kunde gewechselt'), null)
  })

  test('verworfen auch von in_analyse mit Grund → null', () => {
    assert.equal(pruefeDeadLetterUebergang('in_analyse', 'verworfen', 'Nicht mehr relevant'), null)
  })

  // ─ gleicher Status ─
  test('gleicher Status ohne Verworfen-Grund → null (No-Op)', () => {
    assert.equal(pruefeDeadLetterUebergang('offen', 'offen'), null)
  })
})

// ---------------------------------------------------------------------------
// DEAD_LETTER_UEBERGAENGE — Vollstaendigkeit
// ---------------------------------------------------------------------------

describe('DEAD_LETTER_UEBERGAENGE', () => {
  test('alle Status sind als Quellstatus definiert', () => {
    const stati: DeadLetterStatus[] = ['offen', 'in_analyse', 'wiedervorgelegt', 'erledigt', 'verworfen']
    for (const s of stati) {
      assert.ok(Array.isArray(DEAD_LETTER_UEBERGAENGE[s]), `Übergänge fehlen für ${s}`)
    }
  })

  test('erledigt ist nur von wiedervorgelegt erreichbar', () => {
    const stati: DeadLetterStatus[] = ['offen', 'in_analyse', 'wiedervorgelegt', 'erledigt', 'verworfen']
    for (const s of stati) {
      if (s === 'wiedervorgelegt') {
        assert.ok(DEAD_LETTER_UEBERGAENGE[s].includes('erledigt'))
      } else {
        assert.ok(!DEAD_LETTER_UEBERGAENGE[s].includes('erledigt'), `${s} sollte nicht zu erledigt führen`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// DEAD_LETTER_GRUND_TEXT — Konsistenz
// ---------------------------------------------------------------------------

describe('DEAD_LETTER_GRUND_TEXT', () => {
  test('jeder Grund hat einen nicht-leeren Text', () => {
    const gruende: DeadLetterGrund[] = [
      'versuche_erschoepft', 'nicht_wiederholbar',
      'dauerhafter_fehler', 'manuell_eingestellt',
    ]
    for (const g of gruende) {
      assert.ok(DEAD_LETTER_GRUND_TEXT[g].length > 0, `Text fehlt für ${g}`)
    }
  })
})
