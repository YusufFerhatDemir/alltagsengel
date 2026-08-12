// PflegeCoach Anspruchsprüfung — node:test
// Ausführen: npx tsx --test lib/coach/anspruch.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANSPRUCH_KRITERIEN, ANSPRUCH_KRITERIEN_VERSION, pruefeAnspruch } from './anspruch'

const basis = {
  pflegegrad: 3,
  pflegegradBeantragt: false,
  haeuslicheVersorgung: true,
  nutzungDurch: 'pflegebeduerftig' as const,
}

test('Pflegegrad 2–5 in häuslicher Versorgung → Antrag möglich', () => {
  for (const pg of [2, 3, 4, 5]) {
    const r = pruefeAnspruch({ ...basis, pflegegrad: pg })
    assert.equal(r.ergebnis, 'anspruch_moeglich')
    assert.equal(r.kriterienVersion, ANSPRUCH_KRITERIEN_VERSION)
  }
})

test('Pflegegrad 1 → möglich, aber mit ausdrücklichem Klärungshinweis', () => {
  const r = pruefeAnspruch({ ...basis, pflegegrad: 1 })
  assert.equal(r.ergebnis, 'anspruch_moeglich')
  assert.ok(r.hinweise.some(h => h.includes('Pflegegrad 1')))
})

test('kein Pflegegrad und keiner beantragt → kein Anspruch, mit Weg zum Antrag', () => {
  const r = pruefeAnspruch({ ...basis, pflegegrad: 0 })
  assert.equal(r.ergebnis, 'kein_anspruch')
  assert.ok(r.naechsterSchritt.toLowerCase().includes('pflegegrad'))
})

test('Pflegegrad beantragt, aber offen → unklar statt Ablehnung', () => {
  const r = pruefeAnspruch({ ...basis, pflegegrad: 0, pflegegradBeantragt: true })
  assert.equal(r.ergebnis, 'anspruch_unklar')
})

test('stationäre Versorgung → kein Anspruch (Produktgrenze)', () => {
  const r = pruefeAnspruch({ ...basis, haeuslicheVersorgung: false })
  assert.equal(r.ergebnis, 'kein_anspruch')
})

test('Pflegegrad unbekannt → unklar, nie Ablehnung', () => {
  const r = pruefeAnspruch({ ...basis, pflegegrad: null })
  assert.equal(r.ergebnis, 'anspruch_unklar')
})

test('ungültiger Pflegegrad → unklar statt Absturz', () => {
  const r = pruefeAnspruch({ ...basis, pflegegrad: 9 })
  assert.equal(r.ergebnis, 'anspruch_unklar')
})

test('jedes Ergebnis weist auf die Entscheidungshoheit der Pflegekasse hin', () => {
  const faelle = [
    { ...basis },
    { ...basis, pflegegrad: 0 },
    { ...basis, pflegegrad: 0, pflegegradBeantragt: true },
    { ...basis, haeuslicheVersorgung: false },
  ]
  for (const f of faelle) {
    const r = pruefeAnspruch(f)
    assert.ok(
      r.hinweise.some(h => h.includes('Pflegekasse')),
      `Hinweis auf die Pflegekasse fehlt: ${JSON.stringify(f)}`
    )
    assert.ok(r.naechsterSchritt.length > 0)
  }
})

test('unverifizierte Kriterien sind als solche gekennzeichnet', () => {
  const pg1 = ANSPRUCH_KRITERIEN.find(k => k.key === 'pflegegrad_1_sonderfall')
  assert.ok(pg1)
  assert.equal(pg1.verifiziert, false)
  // Jedes Kriterium nennt seine Quelle — sonst wäre es eine Behauptung.
  for (const k of ANSPRUCH_KRITERIEN) assert.ok(k.quelle.length > 0)
})
