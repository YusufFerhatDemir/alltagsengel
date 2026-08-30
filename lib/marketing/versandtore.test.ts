// Die drei Tore vor dem scharfen Versand — node:test
// Ausführen: npx tsx --test lib/marketing/versandtore.test.ts
//
// pruefeVersandtore ist rein und deshalb hier prüfbar. Es beantwortet die
// Frage, die vor jedem Massenversand steht: darf dieser Lauf loslaufen?

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kuerzeAdresse, pruefeVersandtore, type Kampagne } from './versand'
import { AN_WERT, MARKETING_FLAG } from './freigabe'

/** Kampagne mit Trockenlauf und gültiger Freigabe für 10 Empfänger. */
function kampagne(ueber: Partial<Kampagne> = {}): Kampagne {
  return {
    id: 'k1', organization_id: 'org', name: 'Test', template_key: 'kunde_entlastungsbetrag',
    segment_key: 'kunden_ohne_buchung', status: 'entwurf',
    dry_run_am: '2026-08-30T10:00:00Z', empfaenger_anzahl: 10,
    freigegeben_am: '2026-08-30T11:00:00Z', freigegeben_fuer_anzahl: 10,
    versendet_am: null,
    ...ueber,
  }
}

/**
 * Die Tore lesen den Schalter aus process.env. Für die Fälle, in denen
 * NICHT der Schalter geprüft werden soll, wird er scharf gestellt und
 * hinterher zurückgesetzt.
 */
function mitScharfemSchalter<T>(fn: () => T): T {
  const vorher = { flag: process.env[MARKETING_FLAG], env: process.env.VERCEL_ENV }
  process.env[MARKETING_FLAG] = AN_WERT
  process.env.VERCEL_ENV = 'production'
  try {
    return fn()
  } finally {
    if (vorher.flag === undefined) delete process.env[MARKETING_FLAG]
    else process.env[MARKETING_FLAG] = vorher.flag
    if (vorher.env === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = vorher.env
  }
}

test('ohne scharfen Schalter ist der Versand gesperrt — auch mit Freigabe', () => {
  const vorher = process.env[MARKETING_FLAG]
  delete process.env[MARKETING_FLAG]
  try {
    const tore = pruefeVersandtore(kampagne(), 10)
    assert.equal(tore.erlaubt, false)
    assert.ok(tore.gruende.some((g) => g.includes(MARKETING_FLAG)))
  } finally {
    if (vorher !== undefined) process.env[MARKETING_FLAG] = vorher
  }
})

test('mit allen drei Toren offen darf versendet werden', () => {
  mitScharfemSchalter(() => {
    assert.equal(pruefeVersandtore(kampagne(), 10).erlaubt, true)
  })
})

test('ohne Freigabe ist der Versand gesperrt', () => {
  mitScharfemSchalter(() => {
    const tore = pruefeVersandtore(
      kampagne({ freigegeben_am: null, freigegeben_fuer_anzahl: null }), 10,
    )
    assert.equal(tore.erlaubt, false)
    assert.ok(tore.gruende.some((g) => g.includes('Freigabe')))
  })
})

test('DER KERN: eine gewachsene Empfängerzahl entwertet die Freigabe', () => {
  // „Ich habe 10 Empfänger freigegeben" darf nicht die Grundlage für einen
  // Versand an 1000 sein. Das Segment kann zwischen Freigabe und Versand
  // wachsen — jemand trägt Einwilligungen nach, ein Import läuft, eine
  // Sperre wird aufgehoben.
  mitScharfemSchalter(() => {
    const tore = pruefeVersandtore(kampagne(), 1000)
    assert.equal(tore.erlaubt, false)
    assert.ok(tore.gruende.some((g) => g.includes('1000') && g.includes('10')))
  })
})

test('eine GESCHRUMPFTE Empfängerzahl entwertet die Freigabe NICHT', () => {
  // Weniger Empfänger als freigegeben ist unbedenklich: es gehen weniger
  // Mails raus als der freigebende Mensch verantwortet hat. Eine Sperre
  // hier würde jede Abmeldung zwischen Freigabe und Versand zum Blocker
  // machen.
  mitScharfemSchalter(() => {
    assert.equal(pruefeVersandtore(kampagne(), 3).erlaubt, true)
  })
})

test('eine bereits versendete Kampagne lässt sich nicht erneut versenden', () => {
  mitScharfemSchalter(() => {
    const tore = pruefeVersandtore(kampagne({ versendet_am: '2026-08-30T12:00:00Z' }), 10)
    assert.equal(tore.erlaubt, false)
    assert.ok(tore.gruende.some((g) => g.includes('bereits versendet')))
  })
})

test('pausierte und abgebrochene Kampagnen laufen nicht', () => {
  mitScharfemSchalter(() => {
    for (const status of ['pausiert', 'abgebrochen']) {
      const tore = pruefeVersandtore(kampagne({ status }), 10)
      assert.equal(tore.erlaubt, false, `Status ${status} läuft fälschlich`)
    }
  })
})

test('mehrere geschlossene Tore werden ALLE genannt', () => {
  // Ein Befund nach dem anderen zu melden hieße: nach jedem Beheben ein
  // neuer Anlauf. Die Antwort nennt alles auf einmal.
  const vorher = process.env[MARKETING_FLAG]
  delete process.env[MARKETING_FLAG]
  try {
    const tore = pruefeVersandtore(
      kampagne({ freigegeben_am: null, freigegeben_fuer_anzahl: null, status: 'pausiert' }), 10,
    )
    assert.ok(tore.gruende.length >= 3, `nur ${tore.gruende.length} Gründe genannt`)
  } finally {
    if (vorher !== undefined) process.env[MARKETING_FLAG] = vorher
  }
})

// ── Anzeige ───────────────────────────────────────────────────────────────

test('gekürzte Adressen geben die Domäne preis, nicht die Person', () => {
  assert.equal(kuerzeAdresse('maximilian@example.com'), 'ma********@example.com')
  assert.equal(kuerzeAdresse('ab@example.com'), 'ab*@example.com')
  assert.equal(kuerzeAdresse('unsinn'), '***')
})

// ── Abmeldelink ───────────────────────────────────────────────────────────

test('der Abmeldelink zeigt auf den MARKETING-Weg, nicht auf den Newsletter-Weg', async () => {
  // Der Newsletter-Weg setzt nur newsletter_subscribers.active = false.
  // Das genügt für Werbepost nicht: eine Einwilligung kann auch ohne
  // Verteilerzeile bestehen, und ohne Sperrlisten-Eintrag hebt die
  // nächste Anmeldung den Widerspruch wieder auf.
  const { marketingAbmeldelink } = await import('./versand')
  process.env.NEWSLETTER_ABMELDE_SECRET ??= 'test-secret-mindestens-16-zeichen'

  const link = marketingAbmeldelink('max@example.com', 'https://alltagsengel.care')
  assert.ok(link.includes('/api/marketing/abmeldung?'), `falscher Pfad: ${link}`)
  assert.equal(link.includes('/api/newsletter/unsubscribe'), false)
  assert.ok(link.includes('email=max%40example.com'))
  assert.ok(/[?&]token=[0-9a-f]{64}/.test(link), 'kein vollständiges Token im Link')
})

test('der Abmeldelink ist für dieselbe Adresse stabil und je Adresse verschieden', async () => {
  // Stabil, weil ein Link in einer zwei Jahre alten Mail noch
  // funktionieren muss (Art. 21 DSGVO). Verschieden, weil sonst ein
  // Link jede beliebige Adresse abmelden könnte.
  const { marketingAbmeldelink } = await import('./versand')
  process.env.NEWSLETTER_ABMELDE_SECRET ??= 'test-secret-mindestens-16-zeichen'

  assert.equal(
    marketingAbmeldelink('a@example.com', 'https://x'),
    marketingAbmeldelink('a@example.com', 'https://x'),
  )
  assert.notEqual(
    marketingAbmeldelink('a@example.com', 'https://x'),
    marketingAbmeldelink('b@example.com', 'https://x'),
  )
})

test('Groß-/Kleinschreibung ergibt denselben Abmeldelink', async () => {
  const { marketingAbmeldelink } = await import('./versand')
  process.env.NEWSLETTER_ABMELDE_SECRET ??= 'test-secret-mindestens-16-zeichen'
  assert.equal(
    marketingAbmeldelink('A@Example.COM', 'https://x'),
    marketingAbmeldelink('a@example.com', 'https://x'),
  )
})
