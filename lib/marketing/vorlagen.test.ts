// Kampagnen-Vorlagen — node:test
// Ausführen: npx tsx --test lib/marketing/vorlagen.test.ts
//
// Die drei geprüften Regeln sind keine Stilfragen. Jede von ihnen wäre bei
// einem Versand an die gesamte Kundschaft ein eigener Befund:
//   — ohne Abmeldelink: Verstoß gegen Art. 21 DSGVO, bei jedem Empfänger,
//   — persönlicher Name: Verstoß gegen die Kundenkommunikations-Regel,
//   — 125 € statt 131 €: eine falsche Angabe an Menschen, die danach ihre
//     Leistung planen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENTLASTUNG_MONATLICH_EUR } from '@/lib/config/budget-constants'
import {
  VORLAGEN, anredeFuer, istVorlagenKey, pruefeVorlage, rendere, textTeilAus,
  vorlageAus, werteFuer,
} from './vorlagen'
import type { MarketingKontakt } from './typen'

const werte = { anrede: 'Hallo,', abmeldelink: 'https://x/ab', entlastungsbetrag: '131', siteUrl: 'https://x' }

// ── Jede Vorlage im Katalog ───────────────────────────────────────────────

test('JEDE Vorlage trägt einen Abmeldelink', () => {
  for (const v of VORLAGEN) {
    assert.ok(
      v.html.includes('{{abmeldelink}}'),
      `Vorlage ${v.templateKey} hat keinen Abmeldelink — sie wäre nicht versandfähig`,
    )
  }
})

test('JEDE Vorlage besteht die Prüfung', () => {
  for (const v of VORLAGEN) {
    const befund = pruefeVorlage(v)
    assert.ok(befund.ok, `Vorlage ${v.templateKey}: ${befund.fehler.join(' ')}`)
  }
})

test('KEINE Vorlage nennt einen persönlichen Namen', () => {
  // Kundenkommunikations-Regel: Absender und Unterschrift sind immer
  // „Alltagsengel", nie eine Person.
  const namen = /\b(Yusuf|Cilcioglu|Abdullah|Eylem)\b/i
  for (const v of VORLAGEN) {
    assert.equal(namen.test(v.html), false, `Vorlage ${v.templateKey} nennt einen persönlichen Namen`)
    assert.equal(namen.test(v.betreff), false, `Betreff von ${v.templateKey} nennt einen persönlichen Namen`)
  }
})

test('JEDE Vorlage unterschreibt mit „Ihr Team von Alltagsengel"', () => {
  for (const v of VORLAGEN) {
    assert.ok(
      v.html.includes('Ihr Team von Alltagsengel'),
      `Vorlage ${v.templateKey} hat keine Alltagsengel-Unterschrift`,
    )
  }
})

test('KEINE Vorlage schreibt einen Geldbetrag hart hinein', () => {
  // Der Entlastungsbetrag kommt aus ENTLASTUNG_MONATLICH_EUR. Stünde er
  // als Zahl im Text, driftete er bei der nächsten Reform.
  for (const v of VORLAGEN) {
    assert.equal(
      /\b1(25|31)\s*(?:€|EUR|Euro)/i.test(v.html), false,
      `Vorlage ${v.templateKey} schreibt einen Betrag hart hinein — {{entlastungsbetrag}} verwenden`,
    )
  }
})

test('Vorlagenschlüssel sind eindeutig', () => {
  const keys = VORLAGEN.map((v) => v.templateKey)
  assert.equal(new Set(keys).size, keys.length)
})

test('es gibt Vorlagen für Kundschaft UND für Engel', () => {
  assert.ok(VORLAGEN.filter((v) => v.zielgruppe === 'kunde').length >= 9)
  assert.ok(VORLAGEN.filter((v) => v.zielgruppe === 'engel').length >= 6)
})

// ── Prüfung fängt echte Fehler ────────────────────────────────────────────

test('eine Vorlage ohne Abmeldelink fällt durch', () => {
  const befund = pruefeVorlage({ betreff: 'x', html: '<p>ohne</p>' })
  assert.equal(befund.ok, false)
  assert.ok(befund.fehler.some((f) => f.includes('abmeldelink')))
})

test('125 € als Entlastungsbetrag fällt durch', () => {
  const befund = pruefeVorlage({ betreff: 'x', html: '<p>125 € monatlich</p>{{abmeldelink}}' })
  assert.equal(befund.ok, false)
  assert.ok(befund.fehler.some((f) => f.includes('125')))
  assert.ok(befund.fehler.some((f) => f.includes(String(ENTLASTUNG_MONATLICH_EUR))))
})

test('ein leerer Betreff fällt durch', () => {
  const befund = pruefeVorlage({ betreff: '   ', html: '{{abmeldelink}}' })
  assert.equal(befund.ok, false)
})

// ── Rendern ───────────────────────────────────────────────────────────────

test('der Entlastungsbetrag kommt aus der Konstanten und ist 131', () => {
  assert.equal(ENTLASTUNG_MONATLICH_EUR, 131)
  const kontakt = { anzeigename: '', email: 'a@b.de' } as MarketingKontakt
  assert.equal(werteFuer(kontakt, 'https://x/ab').entlastungsbetrag, '131')
})

test('rendere ersetzt alle Platzhalter und lässt keine stehen', () => {
  for (const v of VORLAGEN) {
    const html = rendere(v.html, werte)
    assert.equal(/\{\{[a-zA-Z]+\}\}/.test(html), false, `Vorlage ${v.templateKey} lässt Platzhalter stehen`)
  }
})

test('rendere wertet NICHTS aus — Text bleibt Text', () => {
  // Bewusst keine Vorlagensprache: sonst wäre das Vorlagenfeld eine
  // Ausführungsstelle in einer Mail an die gesamte Kundschaft.
  const bösartig = '{{anrede}} <img src=x onerror=alert(1)> {{gibtEsNicht}}'
  const raus = rendere(bösartig, werte)
  assert.ok(raus.includes('{{gibtEsNicht}}'), 'unbekannte Platzhalter bleiben unangetastet')
  assert.ok(raus.startsWith('Hallo,'))
})

test('unbekannte Vorlage wirft statt still zu liefern', () => {
  assert.throws(() => vorlageAus('gibt_es_nicht'), /Unbekannte Vorlage/)
  assert.equal(istVorlagenKey('gibt_es_nicht'), false)
})

test('Anrede ist neutral, wenn kein Name vorliegt', () => {
  // Eine geratene Anrede („Frau"/„Herr") wäre schlimmer als eine neutrale:
  // das Geschlecht liegt im Verteiler nicht durchgängig vor.
  assert.equal(anredeFuer({ anzeigename: '' } as MarketingKontakt), 'Hallo,')
  assert.equal(anredeFuer({ anzeigename: 'Anna Muster' } as MarketingKontakt), 'Hallo Anna Muster,')
})

test('der Textteil trägt den Abmeldelink mit', () => {
  for (const v of VORLAGEN) {
    const text = textTeilAus(rendere(v.html, werte))
    assert.ok(text.includes('https://x/ab'), `Textteil von ${v.templateKey} verliert den Abmeldelink`)
    assert.equal(/<[a-z]/i.test(text), false, `Textteil von ${v.templateKey} enthält noch Markup`)
  }
})
