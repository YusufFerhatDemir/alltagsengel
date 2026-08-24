// ═══════════════════════════════════════════════════════════════
// Welle 5c — Versand-Retry Tests
// ═══════════════════════════════════════════════════════════════
//
// Rein funktionales Modul: kein Supabase, keine Seiteneffekte.
// Zentral für die Entscheidung, ob ein SFTP-Versand automatisch
// wiederholt werden darf — Falsch-Positiv = Doppelforderung.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  istTransienterFehler,
  retryErlaubt,
  wartezeitMs,
  mitWiederholung,
  RETRY_SICHERE_PHASEN,
  MAX_VERSUCHE,
  BASIS_WARTEZEIT_MS,
  MAX_WARTEZEIT_MS,
  type TransportPhase,
} from '../retry'

// ---------------------------------------------------------------------------
// istTransienterFehler
// ---------------------------------------------------------------------------

describe('istTransienterFehler', () => {
  test('erkennt ETIMEDOUT', () => {
    assert.equal(istTransienterFehler('connect ETIMEDOUT 10.0.0.1:22'), true)
  })

  test('erkennt ECONNRESET', () => {
    assert.equal(istTransienterFehler('read ECONNRESET'), true)
  })

  test('erkennt socket hang up', () => {
    assert.equal(istTransienterFehler('socket hang up during transfer'), true)
  })

  test('erkennt connection lost', () => {
    assert.equal(istTransienterFehler('connection lost unexpectedly'), true)
  })

  test('erkennt temporarily unavailable', () => {
    assert.equal(istTransienterFehler('Service temporarily unavailable'), true)
  })

  test('erkennt too many connections', () => {
    assert.equal(istTransienterFehler('too many connections from this IP'), true)
  })

  test('ENOTFOUND ist DAUERHAFT', () => {
    assert.equal(istTransienterFehler('getaddrinfo ENOTFOUND sftp.example.com'), false)
  })

  test('permission denied ist DAUERHAFT', () => {
    assert.equal(istTransienterFehler('Permission denied (publickey)'), false)
  })

  test('authentication failure ist DAUERHAFT', () => {
    assert.equal(istTransienterFehler('all configured authentication methods failed'), false)
  })

  test('host key verification ist DAUERHAFT', () => {
    assert.equal(istTransienterFehler('Host key verification failed'), false)
  })

  test('dauerhaft schlaegt transient: Permission denied + timeout', () => {
    assert.equal(
      istTransienterFehler('Permission denied after timeout'),
      false,
      'Rechteproblem trotz transientem Muster im Text',
    )
  })

  test('null ergibt false', () => {
    assert.equal(istTransienterFehler(null), false)
  })

  test('undefined ergibt false', () => {
    assert.equal(istTransienterFehler(undefined), false)
  })

  test('leerer String ergibt false', () => {
    assert.equal(istTransienterFehler(''), false)
  })

  test('unbekannter Fehler ergibt false (Positivliste)', () => {
    assert.equal(istTransienterFehler('Unbekannter interner Fehler'), false)
  })
})

// ---------------------------------------------------------------------------
// retryErlaubt
// ---------------------------------------------------------------------------

describe('retryErlaubt', () => {
  test('verbindung + transient → erlaubt', () => {
    const r = retryErlaubt('verbindung', 'connect ETIMEDOUT')
    assert.equal(r.erlaubt, true)
  })

  test('nutzdaten + transient → erlaubt', () => {
    const r = retryErlaubt('nutzdaten', 'socket hang up')
    assert.equal(r.erlaubt, true)
  })

  test('auftragsdatei → NICHT erlaubt (egal welcher Fehler)', () => {
    const r = retryErlaubt('auftragsdatei', 'connect ETIMEDOUT')
    assert.equal(r.erlaubt, false)
    assert.ok(r.grund.includes('zweite Verarbeitung'))
  })

  test('verifikation → NICHT erlaubt', () => {
    const r = retryErlaubt('verifikation', 'ETIMEDOUT')
    assert.equal(r.erlaubt, false)
  })

  test('fertig → NICHT erlaubt', () => {
    const r = retryErlaubt('fertig', 'timeout')
    assert.equal(r.erlaubt, false)
  })

  test('sichere Phase + dauerhafter Fehler → NICHT erlaubt', () => {
    const r = retryErlaubt('verbindung', 'getaddrinfo ENOTFOUND sftp.example.com')
    assert.equal(r.erlaubt, false)
    assert.ok(r.grund.includes('Konfiguration'))
  })

  test('sichere Phase + unbekannter Fehler → NICHT erlaubt (konservativ)', () => {
    const r = retryErlaubt('verbindung', 'Unbekannter Fehler XYZ')
    assert.equal(r.erlaubt, false)
  })
})

// ---------------------------------------------------------------------------
// RETRY_SICHERE_PHASEN — Konsistenz
// ---------------------------------------------------------------------------

describe('RETRY_SICHERE_PHASEN', () => {
  test('enthaelt nur verbindung und nutzdaten', () => {
    assert.deepEqual([...RETRY_SICHERE_PHASEN], ['verbindung', 'nutzdaten'])
  })

  test('auftragsdatei ist NICHT sicher', () => {
    assert.equal(RETRY_SICHERE_PHASEN.includes('auftragsdatei'), false)
  })
})

// ---------------------------------------------------------------------------
// wartezeitMs
// ---------------------------------------------------------------------------

describe('wartezeitMs', () => {
  test('Versuch 1: keine Wartezeit', () => {
    assert.equal(wartezeitMs(1), 0)
  })

  test('Versuch 2: Basis', () => {
    assert.equal(wartezeitMs(2), BASIS_WARTEZEIT_MS)
  })

  test('Versuch 3: doppelt', () => {
    assert.equal(wartezeitMs(3), BASIS_WARTEZEIT_MS * 2)
  })

  test('hohe Versuche werden auf MAX_WARTEZEIT_MS gedeckelt', () => {
    assert.equal(wartezeitMs(100), MAX_WARTEZEIT_MS)
  })
})

// ---------------------------------------------------------------------------
// mitWiederholung
// ---------------------------------------------------------------------------

describe('mitWiederholung', () => {
  const sofort = async (_ms: number) => {} // Kein echtes Warten

  test('erster Versuch erfolgreich → versuche=1', async () => {
    const ergebnis = await mitWiederholung(
      async () => 'ok',
      {
        bewerte: () => ({ erfolg: true, phase: 'fertig' as TransportPhase, fehler: null }),
        warte: sofort,
      },
    )
    assert.equal(ergebnis.erfolg, true)
    assert.equal(ergebnis.versuche, 1)
    assert.equal(ergebnis.aufgegeben, null)
    assert.equal(ergebnis.protokoll.length, 1)
  })

  test('transienter Fehler → wiederholt bis Erfolg', async () => {
    let aufruf = 0
    const ergebnis = await mitWiederholung(
      async () => ++aufruf,
      {
        bewerte: (n) => n < 3
          ? { erfolg: false, phase: 'verbindung' as TransportPhase, fehler: 'ETIMEDOUT' }
          : { erfolg: true, phase: 'fertig' as TransportPhase, fehler: null },
        warte: sofort,
      },
    )
    assert.equal(ergebnis.erfolg, true)
    assert.equal(ergebnis.versuche, 3)
    assert.equal(ergebnis.protokoll.length, 3)
  })

  test('nicht wiederholbar → sofort aufgegeben', async () => {
    const ergebnis = await mitWiederholung(
      async () => 'fail',
      {
        bewerte: () => ({ erfolg: false, phase: 'auftragsdatei' as TransportPhase, fehler: 'abbruch' }),
        warte: sofort,
      },
    )
    assert.equal(ergebnis.erfolg, false)
    assert.equal(ergebnis.versuche, 1)
    assert.equal(ergebnis.aufgegeben?.grund, 'nicht_wiederholbar')
  })

  test('versuche erschoepft → aufgegeben', async () => {
    const ergebnis = await mitWiederholung(
      async () => 'fail',
      {
        bewerte: () => ({ erfolg: false, phase: 'verbindung' as TransportPhase, fehler: 'ETIMEDOUT' }),
        maxVersuche: 2,
        warte: sofort,
      },
    )
    assert.equal(ergebnis.erfolg, false)
    assert.equal(ergebnis.versuche, 2)
    assert.equal(ergebnis.aufgegeben?.grund, 'versuche_erschoepft')
  })

  test('Protokoll enthaelt Wartezeiten', async () => {
    const wartezeiten: number[] = []
    const ergebnis = await mitWiederholung(
      async () => 'fail',
      {
        bewerte: () => ({ erfolg: false, phase: 'verbindung' as TransportPhase, fehler: 'ECONNRESET' }),
        maxVersuche: 3,
        warte: async (ms) => { wartezeiten.push(ms) },
      },
    )
    assert.equal(ergebnis.protokoll[0].wartezeitMs, 0, 'Erster Versuch: keine Wartezeit')
    assert.ok(ergebnis.protokoll[1].wartezeitMs > 0, 'Zweiter Versuch: mit Wartezeit')
    assert.equal(wartezeiten.length, 2, 'Vor erstem Versuch wird nicht gewartet')
  })

  test('aufWiederholung wird fuer jeden Versuch aufgerufen', async () => {
    const callbacks: number[] = []
    await mitWiederholung(
      async () => 'fail',
      {
        bewerte: () => ({ erfolg: false, phase: 'verbindung' as TransportPhase, fehler: 'ETIMEDOUT' }),
        maxVersuche: 3,
        warte: sofort,
        aufWiederholung: (p) => { callbacks.push(p.versuch) },
      },
    )
    assert.deepEqual(callbacks, [1, 2, 3])
  })

  test('maxVersuche=1 → kein Retry', async () => {
    const ergebnis = await mitWiederholung(
      async () => 'x',
      {
        bewerte: () => ({ erfolg: false, phase: 'verbindung' as TransportPhase, fehler: 'ETIMEDOUT' }),
        maxVersuche: 1,
        warte: sofort,
      },
    )
    assert.equal(ergebnis.versuche, 1)
    assert.equal(ergebnis.aufgegeben?.grund, 'versuche_erschoepft')
  })
})

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

describe('Retry-Konstanten', () => {
  test('MAX_VERSUCHE ist mindestens 2', () => {
    assert.ok(MAX_VERSUCHE >= 2)
  })

  test('MAX_WARTEZEIT_MS ist groesser als BASIS_WARTEZEIT_MS', () => {
    assert.ok(MAX_WARTEZEIT_MS > BASIS_WARTEZEIT_MS)
  })
})
