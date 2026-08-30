// Freigaberiegel für den Werbeversand — node:test
// Ausführen: npx tsx --test lib/marketing/freigabe.test.ts
//
// Die Semantik ist absichtlich dieselbe wie bei den Versand-Schaltern für
// Rechnung und Mahnung (lib/config/versand-flags.ts): exakter Wert '1',
// keine Trimmung, Umgebungstrennung. Der SCHALTER ist getrennt, weil
// Werbung auf einer anderen Rechtsgrundlage steht als Vertragspost.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AN_WERT, MARKETING_FLAG, NICHT_PRODUKTION_ERLAUBT,
  istTestversandZiel, leseMarketingFreigabe,
} from './freigabe'

const produktion = { VERCEL_ENV: 'production' }

test('ohne Schalter ist der Versand aus — das ist der Normalzustand', () => {
  const s = leseMarketingFreigabe({ ...produktion })
  assert.equal(s.aktiv, false)
  assert.equal(s.befund, 'aus_fehlt')
})

test("nur der exakte Wert '1' schaltet ein", () => {
  assert.equal(leseMarketingFreigabe({ ...produktion, [MARKETING_FLAG]: AN_WERT }).aktiv, true)
  for (const unsinn of ['true', 'yes', 'ja', 'an', ' 1', '1 ', '01', 'TRUE']) {
    const s = leseMarketingFreigabe({ ...produktion, [MARKETING_FLAG]: unsinn })
    assert.equal(s.aktiv, false, `„${unsinn}" schaltet fälschlich ein`)
    assert.equal(s.befund, 'aus_ungueltig', `„${unsinn}" wird nicht als ungültig gemeldet`)
  }
})

test("'0' ist ein eigener, benannter Befund", () => {
  const s = leseMarketingFreigabe({ ...produktion, [MARKETING_FLAG]: '0' })
  assert.equal(s.aktiv, false)
  assert.equal(s.befund, 'aus_explizit')
})

test('außerhalb der Produktion bleibt der Schalter wirkungslos', () => {
  // Eine für „All Environments" gesetzte Vercel-Variable stünde sonst
  // auch in jedem Branch-Preview — und würde dort echte Werbung an echte
  // Empfänger schicken, gegen dieselbe Produktionsdatenbank.
  const s = leseMarketingFreigabe({ VERCEL_ENV: 'preview', [MARKETING_FLAG]: AN_WERT })
  assert.equal(s.aktiv, false)
  assert.equal(s.befund, 'aus_umgebung')
})

test('die Ausnahme lässt einen begleiteten Test außerhalb der Produktion zu', () => {
  const s = leseMarketingFreigabe({
    VERCEL_ENV: 'preview', [MARKETING_FLAG]: AN_WERT, [NICHT_PRODUKTION_ERLAUBT]: AN_WERT,
  })
  assert.equal(s.aktiv, true)
  assert.ok(s.grund.includes(NICHT_PRODUKTION_ERLAUBT))
})

test('der Rohwert taucht in keiner Begründung auf', () => {
  // Der Grund wandert in Betriebsantworten und Protokolle. Ein
  // Konfigurationswert unbekannter Herkunft hat dort nichts verloren.
  const geheim = 'streng-geheimer-wert-42'
  const s = leseMarketingFreigabe({ ...produktion, [MARKETING_FLAG]: geheim })
  assert.equal(s.grund.includes(geheim), false)
})

// ── Testversand-Ziel ──────────────────────────────────────────────────────

test('Testversand geht NUR an eigene Adressen', () => {
  assert.equal(istTestversandZiel('info@alltagsengel.care'), true)
  assert.equal(istTestversandZiel('team@mail.alltagsengel.care'), true)
  // Ohne diese Grenze wäre der Testversand der Weg, den ganzen Riegel zu
  // umgehen: eine Kampagne „testweise" an eine Kundenadresse ist kein
  // Test, sondern ein Versand.
  assert.equal(istTestversandZiel('kunde@gmail.com'), false)
  assert.equal(istTestversandZiel('a@alltagsengel.care.example.com'), false)
  assert.equal(istTestversandZiel('alltagsengel.care@gmail.com'), false)
  assert.equal(istTestversandZiel(''), false)
  assert.equal(istTestversandZiel('ohne-at'), false)
})

test('Groß-/Kleinschreibung hebelt die Ziel-Prüfung nicht aus', () => {
  assert.equal(istTestversandZiel('  INFO@AllTagsEngel.CARE '), true)
})
