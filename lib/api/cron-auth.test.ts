import { test } from 'node:test'
import assert from 'node:assert/strict'
import { istCronGeheimnis, pruefeCronGeheimnis } from './cron-auth'

function anfrage(header?: string): Request {
  return new Request('https://alltagsengel.care/api/cron/x', {
    headers: header ? { authorization: header } : {},
  })
}

const urspruenglich = process.env.CRON_SECRET
function mitGeheimnis(wert: string | undefined, fn: () => void) {
  if (wert === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = wert
  try { fn() } finally {
    if (urspruenglich === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = urspruenglich
  }
}

// Der eigentliche Regressionsfall: /api/cron/drip und /api/cron/indexnow
// verglichen ohne Null-Riegel gegen `Bearer ${undefined}`. Wer den Text
// "Bearer undefined" schickte, kam bei nicht gesetztem CRON_SECRET durch.
test('ohne gesetztes CRON_SECRET wird jeder Aufruf abgewiesen', () => {
  mitGeheimnis(undefined, () => {
    for (const h of [undefined, 'Bearer undefined', 'Bearer ', 'Bearer null']) {
      const antwort = pruefeCronGeheimnis(anfrage(h))
      assert.ok(antwort, `Header ${String(h)} haette abgewiesen werden muessen`)
      assert.equal(antwort.status, 401)
    }
  })
})

test('istCronGeheimnis ist ohne gesetztes CRON_SECRET immer falsch', () => {
  mitGeheimnis(undefined, () => {
    assert.equal(istCronGeheimnis('undefined'), false)
    assert.equal(istCronGeheimnis(''), false)
    assert.equal(istCronGeheimnis(null), false)
  })
})

test('korrektes Geheimnis passiert, falsches nicht', () => {
  mitGeheimnis('s3hr-geheim', () => {
    assert.equal(pruefeCronGeheimnis(anfrage('Bearer s3hr-geheim')), null)
    assert.equal(pruefeCronGeheimnis(anfrage('Bearer s3hr-geheiX'))?.status, 401)
    // Praefix darf nicht reichen — Laengenpruefung vor timingSafeEqual.
    assert.equal(pruefeCronGeheimnis(anfrage('Bearer s3hr'))?.status, 401)
    assert.equal(pruefeCronGeheimnis(anfrage('s3hr-geheim'))?.status, 401)
    assert.equal(pruefeCronGeheimnis(anfrage())?.status, 401)
    assert.equal(istCronGeheimnis('s3hr-geheim'), true)
    assert.equal(istCronGeheimnis('Bearer s3hr-geheim'), false)
  })
})
