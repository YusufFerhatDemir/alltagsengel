// ═══════════════════════════════════════════════════════════════
// Password-Validation Tests — node:test (keine neue Dependency)
// ═══════════════════════════════════════════════════════════════
//
// Ausführen:  npx tsx --test lib/password-validation.test.ts
// Oder:       npm run test:unit   (siehe package.json)
//
// Wir testen vor allem die HIBP-k-Anonymity-Logik:
//  - SHA-1 korrekt
//  - Prefix/Suffix-Split
//  - Fail-safe bei Netzfehler / Timeout / Server-Error
//  - Integration in validatePasswordAsync({ checkBreach })
//
// Mock-Strategie: globaler `fetch` wird per Reflection ersetzt.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPasswordBreach, validatePasswordAsync } from './password-validation'

// ── Mock-Helper für globales fetch ──────────────────────────────
const originalFetch = globalThis.fetch

function mockFetch(handler: (url: string) => { status: number; body: string } | Promise<{ status: number; body: string }>) {
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url
    const { status, body } = await handler(url)
    return new Response(body, { status })
  }) as typeof fetch
}

function mockFetchThrows(error: Error) {
  globalThis.fetch = (async () => {
    throw error
  }) as typeof fetch
}

function restoreFetch() {
  globalThis.fetch = originalFetch
}

// ── HIBP checkPasswordBreach ────────────────────────────────────

// SHA-1 von "P@ssw0rd" = "21BD12DC183F740EE76F27B78EB39C8AD972A757"
// Prefix: 21BD1, Suffix: 2DC183F740EE76F27B78EB39C8AD972A757

test('checkPasswordBreach: bekanntes Passwort gibt true zurück', async () => {
  mockFetch((url) => {
    assert.equal(url, 'https://api.pwnedpasswords.com/range/21BD1', 'sendet nur die ersten 5 Hex-Zeichen')
    // Echte HIBP-Response-Zeile mit passendem Suffix
    return {
      status: 200,
      body: [
        '000000000000000000000000000000AAAAA:5',
        '2DC183F740EE76F27B78EB39C8AD972A757:3303003', // ← unser Passwort
        'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1',
      ].join('\n'),
    }
  })

  try {
    const result = await checkPasswordBreach('P@ssw0rd')
    assert.equal(result, true, 'Passwort mit Treffer in Range-Response soll true liefern')
  } finally {
    restoreFetch()
  }
})

test('checkPasswordBreach: unbekanntes Passwort gibt false zurück', async () => {
  mockFetch(() => ({
    status: 200,
    body: [
      '000000000000000000000000000000AAAAA:5',
      'ABCDEF1234567890ABCDEF1234567890ABC:10',
    ].join('\n'),
  }))

  try {
    const result = await checkPasswordBreach('ein-absolut-zufaelliges-passwort-29Zv!')
    assert.equal(result, false, 'Keine Match-Zeile → false')
  } finally {
    restoreFetch()
  }
})

test('checkPasswordBreach: Netzfehler gibt false zurück (fail-safe)', async () => {
  mockFetchThrows(new TypeError('fetch failed'))

  try {
    const result = await checkPasswordBreach('irgendein-passwort!')
    assert.equal(result, false, 'Bei Exception darf User nicht blockiert werden')
  } finally {
    restoreFetch()
  }
})

test('checkPasswordBreach: HTTP 500 gibt false zurück', async () => {
  mockFetch(() => ({ status: 500, body: 'Server Error' }))

  try {
    const result = await checkPasswordBreach('noch-ein-passwort!')
    assert.equal(result, false, 'Non-OK Response → false (nicht werfen)')
  } finally {
    restoreFetch()
  }
})

test('checkPasswordBreach: leeres Passwort gibt false zurück', async () => {
  const result = await checkPasswordBreach('')
  assert.equal(result, false, 'Empty-String-Guard')
})

test('checkPasswordBreach: Padding-Eintrag (count=0) wird ignoriert', async () => {
  // HIBP sendet bei Add-Padding:true zufällige Dummy-Hashes mit count=0.
  // Die duerfen keinen false-positive verursachen, selbst wenn zufaellig
  // unser Suffix matcht.
  mockFetch(() => ({
    status: 200,
    body: '2DC183F740EE76F27B78EB39C8AD972A757:0', // match, aber count=0
  }))

  try {
    const result = await checkPasswordBreach('P@ssw0rd')
    assert.equal(result, false, 'Padding-Eintrag mit count=0 darf nicht als Treffer zaehlen')
  } finally {
    restoreFetch()
  }
})

test('checkPasswordBreach: Suffix-Vergleich ist case-insensitive', async () => {
  mockFetch(() => ({
    status: 200,
    // Lowercase suffix in response (defensiv — echte API ist uppercase)
    body: '2dc183f740ee76f27b78eb39c8ad972a757:100',
  }))

  try {
    const result = await checkPasswordBreach('P@ssw0rd')
    assert.equal(result, true, 'Lowercase-Response soll trotzdem matchen')
  } finally {
    restoreFetch()
  }
})

// ── validatePasswordAsync Integration ───────────────────────────

test('validatePasswordAsync: checkBreach=false skippt HIBP', async () => {
  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    return new Response('', { status: 200 })
  }) as typeof fetch

  try {
    await validatePasswordAsync('Gp7#kL9@mN2$xR8', [], { checkBreach: false })
    assert.equal(fetchCalled, false, 'Bei checkBreach=false darf kein Fetch laufen')
  } finally {
    restoreFetch()
  }
})

test('validatePasswordAsync: Breach-Treffer liefert deutsche Fehlermeldung', async () => {
  // Wir mocken einen Treffer für das übergebene Passwort.
  // Passwort: "Korrekt-Horse-Battery-Staple-2024!"
  // SHA-1 hashen um ersten 5 Zeichen zu finden
  const encoder = new TextEncoder()
  const data = encoder.encode('Korrekt-Horse-Battery-Staple-2024!')
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  const prefix = hashHex.slice(0, 5)
  const suffix = hashHex.slice(5)

  mockFetch((url) => {
    assert.equal(url, `https://api.pwnedpasswords.com/range/${prefix}`)
    return { status: 200, body: `${suffix}:42000\n` }
  })

  try {
    const result = await validatePasswordAsync(
      'Korrekt-Horse-Battery-Staple-2024!',
      [],
      { checkBreach: true }
    )
    assert.equal(result.valid, false, 'Passwort in Leak-DB ist nicht valide')
    const hasBreachError = result.errors.some(e =>
      e.includes('Datenleak') || e.includes('Datenleck')
    )
    assert.equal(hasBreachError, true, `Fehlermeldung soll "Datenleak" enthalten. Got: ${JSON.stringify(result.errors)}`)
  } finally {
    restoreFetch()
  }
})

test('validatePasswordAsync: zu kurzes Passwort triggert KEIN HIBP-Fetch', async () => {
  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    return new Response('', { status: 200 })
  }) as typeof fetch

  try {
    // Regex-Fehler bei < 8 Zeichen → HIBP skippt, spart Netz
    const result = await validatePasswordAsync('Abc1!', [], { checkBreach: true })
    assert.equal(result.valid, false)
    assert.equal(fetchCalled, false, 'Bei Regex-Fehlern kein unnoetiges Fetch')
  } finally {
    restoreFetch()
  }
})
