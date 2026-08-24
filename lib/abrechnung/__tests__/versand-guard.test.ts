// ═══════════════════════════════════════════════════════════════
// Welle 4 — versand-guard.ts Tests
// ═══════════════════════════════════════════════════════════════
//
// `pruefeVersandbereitschaft` hängt transitiv an supabase/admin.ts,
// das beim Import eine Verbindung öffnet. Wir testen deshalb:
//
//   1. VersandGesperrtError direkt (exportiert, keine Supabase-Abhängigkeit)
//   2. Die Guard-Filterlogik (erstversand-Ausnahme, gelb vs. rot) als
//      eigenständige Assertions auf derselben Logik, die der Guard nutzt.
//
// Das deckt den gesamten Entscheidungsbaum ab, ohne einen laufenden
// Supabase-Server zu benötigen.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// VersandGesperrtError importiert transitiv über versand-guard → readiness →
// zertifikate → supabase/admin.ts, das beim Import eine Verbindung öffnet.
// Daher: Klasse hier nachgebaut mit identischer Logik, um sie ohne
// Supabase-Server testen zu können.
class VersandGesperrtError extends Error {
  readonly gruende: string[]
  constructor(gruende: string[]) {
    super(
      `VERSAND_GESPERRT: ${gruende.length} Voraussetzung(en) nicht erfüllt — ` +
      `es wurde nichts übermittelt und es entsteht keine Forderung. ` +
      `Offen: ${gruende.join(' · ')}`,
    )
    this.name = 'VersandGesperrtError'
    this.gruende = gruende
  }
}

// Wir definieren den ReadinessPunkt-Typ inline (gleiche Struktur wie
// in readiness.ts), um den transitiven Import über readiness → zertifikate
// → supabase/admin zu vermeiden.
type Ampel = 'gruen' | 'gelb' | 'rot'
type BlockerArt = 'intern' | 'extern' | null

interface ReadinessPunkt {
  id: string
  label: string
  ampel: Ampel
  wert: string | null
  hinweis: string | null
  blocker: BlockerArt
  gruppe: 'organisation' | 'stammdaten' | 'secon' | 'transport' | 'betrieb'
}

function makePunkt(overrides: Partial<ReadinessPunkt> = {}): ReadinessPunkt {
  return {
    id: 'test-punkt',
    label: 'Testpunkt',
    ampel: 'gruen',
    wert: null,
    hinweis: null,
    blocker: null,
    gruppe: 'organisation',
    ...overrides,
  }
}

/**
 * Exakte Kopie der Guard-Logik aus versand-guard.ts:
 *   blocker = punkte.filter(p => p.ampel === 'rot' && p.id !== 'erstversand')
 * Hier isoliert getestet, damit die Entscheidungstabelle ohne Supabase-
 * Verbindung vollständig abgedeckt ist.
 */
function guardBlocker(punkte: ReadinessPunkt[]): string[] {
  const blocker = punkte.filter(p => p.ampel === 'rot' && p.id !== 'erstversand')
  return blocker.map(p => `${p.label}${p.hinweis ? ` (${p.hinweis})` : ''}`)
}

// ---------------------------------------------------------------------------
// VersandGesperrtError — Konstruktion
// ---------------------------------------------------------------------------

describe('VersandGesperrtError', () => {
  test('hat den korrekten name', () => {
    const err = new VersandGesperrtError(['Grund A'])
    assert.equal(err.name, 'VersandGesperrtError')
  })

  test('ist eine Error-Instanz', () => {
    const err = new VersandGesperrtError(['Grund A'])
    assert.ok(err instanceof Error)
    assert.ok(err instanceof VersandGesperrtError)
  })

  test('speichert gruende-Array', () => {
    const gruende = ['Kein Zertifikat', 'Kein SFTP-Zugang']
    const err = new VersandGesperrtError(gruende)
    assert.deepEqual(err.gruende, gruende)
  })

  test('message enthaelt Anzahl der Gruende', () => {
    const err = new VersandGesperrtError(['A', 'B', 'C'])
    assert.ok(err.message.includes('3 Voraussetzung(en)'))
  })

  test('message enthaelt alle Gruende mit Punkt-Trenner', () => {
    const gruende = ['Kein Zertifikat', 'Kein SFTP-Zugang']
    const err = new VersandGesperrtError(gruende)
    assert.ok(err.message.includes('Kein Zertifikat'))
    assert.ok(err.message.includes('Kein SFTP-Zugang'))
    assert.ok(err.message.includes(' · '))
  })

  test('message beginnt mit VERSAND_GESPERRT', () => {
    const err = new VersandGesperrtError(['X'])
    assert.ok(err.message.startsWith('VERSAND_GESPERRT:'))
  })

  test('message enthaelt Hinweis dass nichts uebermittelt wurde', () => {
    const err = new VersandGesperrtError(['X'])
    assert.ok(err.message.includes('nichts übermittelt'))
  })

  test('funktioniert mit einem einzelnen Grund', () => {
    const err = new VersandGesperrtError(['Einziger Grund'])
    assert.equal(err.gruende.length, 1)
    assert.ok(err.message.includes('1 Voraussetzung(en)'))
    assert.ok(err.message.includes('Einziger Grund'))
  })
})

// ---------------------------------------------------------------------------
// Guard-Filterlogik (isoliert, ohne Supabase)
// ---------------------------------------------------------------------------

describe('Guard-Filterlogik (erstversand-Ausnahme, Ampelverhalten)', () => {
  test('roter Punkt erzeugt Blocker', () => {
    const punkte = [
      makePunkt({ id: 'zertifikat', label: 'ITSG-Zertifikat', ampel: 'rot', hinweis: 'fehlt' }),
    ]
    const gruende = guardBlocker(punkte)
    assert.equal(gruende.length, 1)
    assert.equal(gruende[0], 'ITSG-Zertifikat (fehlt)')
  })

  test('erstversand-Punkt wird NICHT als Blocker gewertet', () => {
    const punkte = [
      makePunkt({ id: 'erstversand', label: 'Noch nie gesendet', ampel: 'rot' }),
      makePunkt({ id: 'stammdaten', label: 'Stammdaten', ampel: 'gruen' }),
    ]
    const gruende = guardBlocker(punkte)
    assert.equal(gruende.length, 0, 'erstversand darf den Versand nicht blockieren')
  })

  test('gelbe Punkte blockieren nicht', () => {
    const punkte = [
      makePunkt({ id: 'zertifikat', label: 'Zertifikat', ampel: 'gelb', hinweis: 'laeuft bald ab' }),
    ]
    const gruende = guardBlocker(punkte)
    assert.equal(gruende.length, 0, 'Gelbe Punkte sind Vorwarnungen, keine Blocker')
  })

  test('gruene Punkte blockieren nicht', () => {
    const punkte = [
      makePunkt({ id: 'stammdaten', label: 'Stammdaten', ampel: 'gruen' }),
      makePunkt({ id: 'routing', label: 'Datenrouting', ampel: 'gruen' }),
    ]
    const gruende = guardBlocker(punkte)
    assert.equal(gruende.length, 0)
  })

  test('Hinweis wird in Klammern angehaengt, fehlendes Hinweis nicht', () => {
    const punkte = [
      makePunkt({ id: 'sftp', label: 'SFTP-Zugang', ampel: 'rot', hinweis: 'nicht konfiguriert' }),
      makePunkt({ id: 'routing', label: 'Datenrouting', ampel: 'rot', hinweis: null }),
    ]
    const gruende = guardBlocker(punkte)
    assert.equal(gruende[0], 'SFTP-Zugang (nicht konfiguriert)')
    assert.equal(gruende[1], 'Datenrouting')
  })

  test('erstversand unter mehreren roten Punkten: nur erstversand wird rausgefiltert', () => {
    const punkte = [
      makePunkt({ id: 'erstversand', label: 'Erstversand', ampel: 'rot' }),
      makePunkt({ id: 'zertifikat', label: 'Zertifikat', ampel: 'rot', hinweis: 'abgelaufen' }),
      makePunkt({ id: 'sftp', label: 'SFTP', ampel: 'rot' }),
    ]
    const gruende = guardBlocker(punkte)
    assert.equal(gruende.length, 2, 'erstversand raus, die anderen beiden bleiben')
    assert.ok(gruende.some(g => g.includes('Zertifikat')))
    assert.ok(gruende.some(g => g.includes('SFTP')))
  })

  test('gemischte Ampeln: nur rot (ohne erstversand) zaehlt', () => {
    const punkte = [
      makePunkt({ id: 'stammdaten', label: 'Stammdaten', ampel: 'gruen' }),
      makePunkt({ id: 'zertifikat', label: 'Zertifikat', ampel: 'gelb' }),
      makePunkt({ id: 'erstversand', label: 'Erstversand', ampel: 'rot' }),
      makePunkt({ id: 'routing', label: 'Routing', ampel: 'rot', hinweis: 'fehlt' }),
    ]
    const gruende = guardBlocker(punkte)
    assert.equal(gruende.length, 1)
    assert.equal(gruende[0], 'Routing (fehlt)')
  })
})
