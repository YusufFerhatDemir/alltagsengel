// ═══════════════════════════════════════════════════════════════
// Welle 6 — Mahnungstexte (lib/billing/dunning/mahnung-pdf.ts)
// ═══════════════════════════════════════════════════════════════
//
// generateMahnungHtml() und generateMahnungEmail() bauen aus einem
// Datensatz das Mahnschreiben. Beide sind rein: Daten rein, Text raus.
// Der Supabase-Teil des Moduls (createMahnungDocument) bleibt außen vor.
//
// Alle Beträge und Namen hier sind TESTWERTE. Geprüft wird, dass die
// Stufe den richtigen Wortlaut zieht, der Platzhalter {deadline} ersetzt
// wird und Fremdtext im HTML maskiert ankommt.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { generateMahnungHtml, generateMahnungEmail, DUNNING_TEXTS, type MahnungData } from '../billing/dunning/mahnung-pdf'
import { DUNNING_LABELS, type DunningLevel } from '../billing/core/dunning'

const STUFEN = Object.keys(DUNNING_TEXTS) as DunningLevel[]

function daten(ueberschreibung: Partial<MahnungData> = {}): MahnungData {
  return {
    creditorName: 'Testgläubiger',
    creditorAddress: ['Teststraße 1', '60311 Frankfurt am Main'],
    creditorEmail: 'test@example.org',
    debtorName: 'Testschuldner',
    debtorAddress: ['Musterweg 2', '60311 Frankfurt am Main'],
    invoiceNumber: 'TEST-0001',
    invoiceDate: '2026-06-01',
    invoiceAmount: '100,00 €',
    paidAmount: '0,00 €',
    openAmount: '100,00 €',
    dueDate: '2026-06-15',
    dunningLevel: 'mahnung_1',
    dunningFee: '2,50 €',
    totalDue: '102,50 €',
    paymentDeadline: '2026-07-01',
    date: '2026-06-20',
    referenceNumber: 'AZ-TEST-1',
    ...ueberschreibung,
  }
}

// ───────────────────────────────────────────────────────────────
describe('DUNNING_TEXTS', () => {
  test('deckt die vier Mahnstufen ab', () => {
    assert.deepEqual(STUFEN.sort(), ['erinnerung', 'letzte_mahnung', 'mahnung_1', 'mahnung_2'])
  })

  test('jede Stufe hat Betreff, Text und Grußformel', () => {
    for (const stufe of STUFEN) {
      const t = DUNNING_TEXTS[stufe]
      assert.ok(t.subject.trim().length > 0, `${stufe}: kein Betreff`)
      assert.ok(t.body.trim().length > 0, `${stufe}: kein Text`)
      assert.ok(t.closing.trim().length > 0, `${stufe}: keine Grußformel`)
    }
  })

  test('jeder Text trägt genau einen Platzhalter-Typ: {deadline}', () => {
    for (const stufe of STUFEN) {
      const platzhalter = [...DUNNING_TEXTS[stufe].body.matchAll(/\{([a-zA-Z_]+)\}/g)].map((m) => m[1])
      assert.ok(platzhalter.length > 0, `${stufe}: keine Zahlungsfrist im Text`)
      assert.deepEqual([...new Set(platzhalter)], ['deadline'], `${stufe}: unbekannter Platzhalter`)
    }
  })

  test('Betreffzeilen sind eindeutig', () => {
    const betreffe = STUFEN.map((s) => DUNNING_TEXTS[s].subject)
    assert.equal(new Set(betreffe).size, betreffe.length)
  })

  test('die letzte Mahnung kündigt das gerichtliche Verfahren an und grüßt förmlicher', () => {
    const t = DUNNING_TEXTS.letzte_mahnung
    assert.ok(t.body.includes('gerichtliches Mahnverfahren'))
    assert.equal(t.closing, 'Hochachtungsvoll')
  })

  test('die Zahlungserinnerung bleibt im freundlichen Ton und schließt ein Versehen ein', () => {
    const t = DUNNING_TEXTS.erinnerung
    assert.ok(t.body.includes('Versehen'))
    assert.ok(t.body.includes('gegenstandslos'))
    assert.equal(t.closing, 'Mit freundlichen Grüßen')
  })

  test('kein Text nennt einen persönlichen Namen als Absender', () => {
    for (const stufe of STUFEN) {
      assert.equal(/mein Name|ich heiße/i.test(DUNNING_TEXTS[stufe].body), false, stufe)
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('generateMahnungHtml', () => {
  test('erzeugt ein vollständiges HTML-Dokument', () => {
    const html = generateMahnungHtml(daten())
    assert.ok(html.startsWith('<!DOCTYPE html>'))
    assert.ok(html.includes('</html>'))
  })

  test('jede Stufe erzeugt ein Dokument mit ihrem eigenen Betreff', () => {
    for (const stufe of STUFEN) {
      const html = generateMahnungHtml(daten({ dunningLevel: stufe }))
      assert.ok(html.includes(DUNNING_TEXTS[stufe].subject), `${stufe}: Betreff fehlt`)
    }
  })

  test('unbekannte Stufe wirft, statt ein leeres Schreiben zu erzeugen', () => {
    assert.throws(
      () => generateMahnungHtml(daten({ dunningLevel: 'offen' })),
      /Kein Mahnungstext/,
    )
    assert.throws(() => generateMahnungHtml(daten({ dunningLevel: 'bezahlt' })), /Kein Mahnungstext/)
  })

  test('{deadline} wird durch das deutsche Datum ersetzt', () => {
    const html = generateMahnungHtml(daten({ paymentDeadline: '2026-07-01' }))
    assert.equal(html.includes('{deadline}'), false, 'Platzhalter blieb stehen')
    assert.ok(html.includes('01.07.2026'))
  })

  test('trägt Beträge, Rechnungsnummer und Aktenzeichen', () => {
    const html = generateMahnungHtml(daten())
    assert.ok(html.includes('TEST-0001'))
    assert.ok(html.includes('102,50 €'))
    assert.ok(html.includes('AZ-TEST-1'))
  })

  test('die Mahngebührzeile fehlt, wenn keine Gebühr anfällt', () => {
    const ohne = generateMahnungHtml(daten({ dunningLevel: 'erinnerung', dunningFee: '0,00 €' }))
    assert.equal(ohne.includes('Mahngebühr'), false)
  })

  test('die Mahngebührzeile erscheint mit dem Stufen-Label, sobald eine Gebühr anfällt', () => {
    const mit = generateMahnungHtml(daten({ dunningLevel: 'mahnung_2', dunningFee: '5,00 €' }))
    assert.ok(mit.includes('Mahngebühr'))
    assert.ok(mit.includes(DUNNING_LABELS.mahnung_2))
  })

  test('IBAN wird in Viererblöcken dargestellt', () => {
    const html = generateMahnungHtml(daten({ creditorIban: 'DE02120300000000202051' }))
    assert.ok(html.includes('DE02 1203 0000 0000 2020 51'), 'IBAN nicht gruppiert')
  })

  test('bereits gruppierte IBAN wird nicht doppelt zerlegt', () => {
    const html = generateMahnungHtml(daten({ creditorIban: 'DE02 1203 0000 0000 2020 51' }))
    assert.ok(html.includes('DE02 1203 0000 0000 2020 51'))
  })

  test('ohne IBAN erscheint keine IBAN-Zeile', () => {
    assert.equal(generateMahnungHtml(daten()).includes('IBAN:'), false)
  })

  test('Fremdtext aus der Empfängeranschrift wird maskiert', () => {
    // Die Anschrift kommt aus clients.* — also aus Fremdeingabe.
    const html = generateMahnungHtml(daten({ debtorAddress: ['<script>alert(1)</script>'] }))
    assert.equal(html.includes('<script>alert(1)</script>'), false)
    assert.ok(html.includes('&lt;script&gt;'))
  })

  test('Fremdtext aus dem Gläubigernamen wird maskiert', () => {
    const html = generateMahnungHtml(daten({ creditorName: '<b>fett</b>' }))
    assert.equal(html.includes('<b>fett</b>'), false)
    assert.ok(html.includes('&lt;b&gt;fett&lt;/b&gt;'))
  })

  test('Anführungszeichen und Ampersand werden maskiert', () => {
    const html = generateMahnungHtml(daten({ creditorName: 'Meier & "Söhne"' }))
    assert.ok(html.includes('&amp;'))
    assert.ok(html.includes('&quot;'))
    assert.equal(html.includes('Meier & "Söhne"'), false)
  })

  test('mehrzeilige Anschriften werden mit <br> verbunden', () => {
    const html = generateMahnungHtml(daten({ debtorAddress: ['Zeile A', 'Zeile B'] }))
    assert.ok(html.includes('Zeile A<br>Zeile B'))
  })
})

// ───────────────────────────────────────────────────────────────
describe('generateMahnungEmail', () => {
  test('Betreff nennt Stufe und Rechnungsnummer', () => {
    const mail = generateMahnungEmail(daten())
    assert.equal(mail.subject, `${DUNNING_TEXTS.mahnung_1.subject} — Rechnung Nr. TEST-0001`)
  })

  test('unbekannte Stufe wirft', () => {
    assert.throws(() => generateMahnungEmail(daten({ dunningLevel: 'offen' })), /Kein Mahnungstext/)
  })

  test('der Text ist mit dem PDF-Wortlaut identisch — keine zweite Fassung', () => {
    for (const stufe of STUFEN) {
      const mail = generateMahnungEmail(daten({ dunningLevel: stufe, paymentDeadline: '2026-07-01' }))
      const erwartet = DUNNING_TEXTS[stufe].body.replace(/\{deadline\}/g, '01.07.2026')
      assert.ok(mail.body.includes(erwartet), `${stufe}: Wortlaut weicht ab`)
    }
  })

  test('{deadline} bleibt nirgends stehen', () => {
    for (const stufe of STUFEN) {
      assert.equal(generateMahnungEmail(daten({ dunningLevel: stufe })).body.includes('{deadline}'), false, stufe)
    }
  })

  test('nennt Betrag, Frist, Empfänger und Verwendungszweck', () => {
    const mail = generateMahnungEmail(daten())
    assert.ok(mail.body.includes('102,50 €'))
    assert.ok(mail.body.includes('Zahlungsfrist: 01.07.2026'))
    assert.ok(mail.body.includes('Testgläubiger'))
    assert.ok(mail.body.includes('Verwendungszweck: AZ-TEST-1'))
  })

  test('nennt die Mahngebühr nur, wenn eine anfällt', () => {
    assert.ok(generateMahnungEmail(daten({ dunningFee: '2,50 €' })).body.includes('Mahngebühr: 2,50 €'))
    assert.equal(
      generateMahnungEmail(daten({ dunningLevel: 'erinnerung', dunningFee: '0,00 €' })).body.includes('Mahngebühr'),
      false,
    )
  })

  test('schließt mit dem Hinweis auf eine gekreuzte Zahlung', () => {
    assert.ok(generateMahnungEmail(daten()).body.includes('bereits erfolgt'))
  })

  test('unterschreibt mit dem Gläubigernamen, nicht mit einer Person', () => {
    const mail = generateMahnungEmail(daten())
    assert.ok(mail.body.trimEnd().length > 0)
    assert.ok(mail.body.includes(DUNNING_TEXTS.mahnung_1.closing))
    assert.ok(mail.body.includes('Testgläubiger'))
  })

  test('der Mailtext wird NICHT HTML-maskiert — er ist Klartext', () => {
    const mail = generateMahnungEmail(daten({ invoiceNumber: 'R&D-1' }))
    assert.ok(mail.subject.includes('R&D-1'))
    assert.equal(mail.subject.includes('&amp;'), false)
  })
})
