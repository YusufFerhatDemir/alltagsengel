import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTENT_STATUS, CONTENT_STATUS_WERTE, STATUS_VORGABE,
  istContentStatus, standNachContentId, statusFelder,
} from './content-status'

test('jeder Statuswert hat Bezeichnung und Farbe', () => {
  for (const w of CONTENT_STATUS_WERTE) {
    assert.ok(CONTENT_STATUS[w].label, `${w} ohne Bezeichnung`)
    assert.match(CONTENT_STATUS[w].farbe, /^#[0-9A-Fa-f]{6}$/, `${w} ohne Farbe`)
  }
  assert.ok(CONTENT_STATUS_WERTE.includes(STATUS_VORGABE))
})

test('istContentStatus weist Unbekanntes ab', () => {
  assert.equal(istContentStatus('veroeffentlicht'), true)
  assert.equal(istContentStatus('published'), false)
  assert.equal(istContentStatus(''), false)
  assert.equal(istContentStatus(null), false)
  assert.equal(istContentStatus(undefined), false)
  assert.equal(istContentStatus(1), false)
  // Erbe von Object.prototype darf nicht als Status gelten.
  assert.equal(istContentStatus('toString'), false)
})

test('standNachContentId bildet Zeilen ab und überspringt Zeilen ohne Kennung', () => {
  const map = standNachContentId([
    { content_id: 'PLAN.md#Post-01', status: 'geplant', notiz: 'Bild fehlt', updated_at: '2026-09-11T10:00:00Z' },
    { content_id: null, status: 'offen' },
    { status: 'offen' },
  ])
  assert.equal(map.size, 1)
  const eintrag = map.get('PLAN.md#Post-01')!
  assert.equal(eintrag.status, 'geplant')
  assert.equal(eintrag.notiz, 'Bild fehlt')
  assert.equal(eintrag.kanal, null)
  assert.equal(eintrag.veroeffentlichtAm, null)
})

test('ein unbekannter Statuswert fällt auf die Vorgabe zurück', () => {
  // Die Anzeige soll keinen Zustand zeigen, den sie nicht erklären kann.
  const map = standNachContentId([{ content_id: 'A#Post-1', status: 'erledigt' }])
  assert.equal(map.get('A#Post-1')!.status, STATUS_VORGABE)
})

test('standNachContentId verträgt null', () => {
  assert.equal(standNachContentId(null).size, 0)
})

test('nur „veröffentlicht" trägt einen Zeitpunkt', () => {
  const jetzt = new Date('2026-09-11T12:00:00Z')
  for (const w of CONTENT_STATUS_WERTE) {
    const f = statusFelder(w, jetzt)
    if (w === 'veroeffentlicht') {
      assert.equal(f.veroeffentlicht_am, jetzt.toISOString(), 'Endzustand braucht seinen Beleg')
    } else {
      assert.equal(f.veroeffentlicht_am, null, `${w} darf keinen Veröffentlichungszeitpunkt tragen`)
    }
  }
})

test('ein vorhandener Veröffentlichungszeitpunkt bleibt stehen', () => {
  // Wer eine Notiz nachträgt, darf das Datum nicht auf heute schieben.
  const f = statusFelder('veroeffentlicht', new Date('2026-09-11T12:00:00Z'), '2026-09-01T08:00:00Z')
  assert.equal(f.veroeffentlicht_am, '2026-09-01T08:00:00Z')
})

test('der Zeitpunkt wird beim Verlassen des Endzustands geleert', () => {
  // Ein Beleg für etwas, was nicht mehr gilt, ist schlimmer als keiner —
  // und der CHECK in der Datenbank kennt nur die eine Richtung.
  const f = statusFelder('geplant', new Date(), '2026-09-01T08:00:00Z')
  assert.equal(f.veroeffentlicht_am, null)
})
