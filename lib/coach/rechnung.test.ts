// PflegeCoach Rechnungen — node:test
// Ausführen: npx tsx --test lib/coach/rechnung.test.ts
//
// Schwerpunkte: die Brutto-Zerlegung (sie muss cent-genau auf den
// tatsächlich eingezogenen Betrag aufgehen) und die Prüfung der
// Pflichtangaben nach § 14 Abs. 4 UStG.

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  bereiteRechnungAuf, istRechnungsnummerGueltig, pruefeRechnungsangaben,
  rechnungHtml, rechnungsnummer, rechnungssteller, zerlegeBrutto,
  type RechnungsDaten,
} from './rechnung'

const GESICHERT = ['COACH_STEUERNUMMER', 'COACH_UST_ID_NR', 'COACH_UST_KLEINUNTERNEHMER', 'COACH_UST_SATZ']
let sicherung: Record<string, string | undefined> = {}

beforeEach(() => {
  sicherung = Object.fromEntries(GESICHERT.map(k => [k, process.env[k]]))
  for (const k of GESICHERT) delete process.env[k]
})

afterEach(() => {
  for (const [k, v] of Object.entries(sicherung)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

function daten(ueber: Partial<RechnungsDaten> = {}): RechnungsDaten {
  return {
    nummer: 'PC-2026-000001',
    datum: '2026-08-14',
    leistung_von: '2026-08-14',
    leistung_bis: '2026-09-13',
    tarif: 'monatlich',
    tarif_bezeichnung: 'Monatlich',
    brutto_cent: 1900,
    empfaenger: {
      name: 'Maria Beispiel',
      anschrift: ['Musterweg 1', '60311 Frankfurt am Main', 'Deutschland'],
      email: 'maria@example.org',
    },
    ...ueber,
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ─── Nummernkreis ──────────────────────────────────────────────

test('Rechnungsnummer: Präfix, Jahr, sechs Stellen', () => {
  assert.equal(rechnungsnummer(2026, 1), 'PC-2026-000001')
  assert.equal(rechnungsnummer(2026, 123456), 'PC-2026-123456')
  assert.equal(istRechnungsnummerGueltig('PC-2026-000001'), true)
})

test('Rechnungsnummer: fremde und unvollständige Formate werden abgewiesen', () => {
  // Insbesondere der Pflege-Nummernkreis darf hier nicht durchrutschen.
  const falsch = ['RE-2026-000001', 'PC-2026-1', 'PC-26-000001', 'PC-2026-0000001', '', 'PC-2026-00000A']
  for (const wert of falsch) {
    assert.equal(istRechnungsnummerGueltig(wert), false, wert)
  }
})

// ─── Brutto-Zerlegung ──────────────────────────────────────────

test('zerlegeBrutto: Steuersatz 0 lässt den vollen Betrag als Netto stehen', () => {
  assert.deepEqual(zerlegeBrutto(1900, 0), { nettoCent: 1900, steuerCent: 0 })
})

test('zerlegeBrutto: rechnet 19 % aus dem Brutto heraus', () => {
  assert.deepEqual(zerlegeBrutto(1190, 19), { nettoCent: 1000, steuerCent: 190 })
})

test('zerlegeBrutto: geht immer cent-genau auf den Bruttobetrag auf', () => {
  // Der eigentliche Punkt: Eingezogen wird der Bruttobetrag. Eine
  // Rechnung, deren Summe um einen Cent von der Abbuchung abweicht, ist
  // wertlos.
  for (const brutto of [1, 99, 1900, 1999, 19000, 12345, 999999]) {
    for (const satz of [7, 19]) {
      const { nettoCent, steuerCent } = zerlegeBrutto(brutto, satz)
      assert.equal(nettoCent + steuerCent, brutto, `${brutto} @ ${satz}%`)
      assert.ok(nettoCent >= 0 && steuerCent >= 0, `${brutto} @ ${satz}%`)
    }
  }
})

// ─── Pflichtangaben ────────────────────────────────────────────

test('Pflichtangaben: fehlende Steuernummer wird als Lücke gemeldet', () => {
  // Im heutigen Zustand der Gesellschaft ist genau das der Fall — die
  // Nummer ist laut Impressum noch nicht zugeteilt.
  const p = pruefeRechnungsangaben(daten())
  assert.equal(p.vollstaendig, false)
  assert.ok(p.fehlend.join(' ').includes('Steuernummer'))
})

test('Pflichtangaben: Steuernummer ODER USt-IdNr. genügt', () => {
  process.env.COACH_STEUERNUMMER = '045 123 45678'
  assert.equal(pruefeRechnungsangaben(daten()).vollstaendig, true)
  delete process.env.COACH_STEUERNUMMER
  process.env.COACH_UST_ID_NR = 'DE123456789'
  assert.equal(pruefeRechnungsangaben(daten()).vollstaendig, true)
})

test('Pflichtangaben: ungültige Nummer, fehlender Empfänger, Entgelt 0', () => {
  process.env.COACH_STEUERNUMMER = '045 123 45678'

  const nummer = pruefeRechnungsangaben(daten({ nummer: 'XYZ' }))
  assert.equal(nummer.vollstaendig, false)
  assert.ok(nummer.fehlend.join(' ').includes('Rechnungsnummer'))

  const empfaenger = pruefeRechnungsangaben(
    daten({ empfaenger: { name: '  ', anschrift: ['', '  '], email: '' } })
  )
  assert.equal(empfaenger.vollstaendig, false)
  assert.ok(empfaenger.fehlend.join(' ').includes('Name'))
  assert.ok(empfaenger.fehlend.join(' ').includes('Anschrift'))

  const entgelt = pruefeRechnungsangaben(daten({ brutto_cent: 0 }))
  assert.equal(entgelt.vollstaendig, false)
  assert.ok(entgelt.fehlend.join(' ').includes('Entgelt'))
})

// ─── Rechnungssteller ──────────────────────────────────────────

test('Rechnungssteller ist die Gesellschaft, nicht die vertretende Person', () => {
  // § 14 UStG verlangt den leistenden Unternehmer — das ist die
  // Gesellschaft. Zugleich Namens-Policy: persönliche Namen stehen
  // ausschließlich in Impressum und Datenschutzerklärung.
  const s = rechnungssteller()
  assert.equal(s.name, 'Alltagsengel UG (haftungsbeschränkt)')
  assert.ok(!JSON.stringify(s).includes('Yusuf'))
  assert.ok(!JSON.stringify(s).includes('Demir'))
})

test('Rechnungssteller erfindet keine Steuernummer', () => {
  const s = rechnungssteller()
  assert.equal(s.steuernummer, null)
  assert.equal(s.ustIdNr, null)
})

// ─── Aufbereitung ──────────────────────────────────────────────

test('Kleinunternehmer: Pflichthinweis statt Steuerbetrag', () => {
  const r = bereiteRechnungAuf(daten())
  assert.ok(r.steuerHinweis?.includes('§ 19 UStG'))
  assert.equal(r.steuersatzProzent, 0)
  assert.equal(r.position.steuerCent, 0)
  assert.equal(r.position.nettoCent, 1900)
})

test('Regelbesteuerung: Steuer ausgewiesen, kein Hinweis', () => {
  process.env.COACH_UST_KLEINUNTERNEHMER = 'false'
  process.env.COACH_UST_SATZ = '19'
  const r = bereiteRechnungAuf(daten({ brutto_cent: 1190 }))
  assert.equal(r.steuerHinweis, null)
  assert.equal(r.position.nettoCent, 1000)
  assert.equal(r.position.steuerCent, 190)
})

test('Leistungszeitraum wird deutsch formatiert', () => {
  assert.equal(bereiteRechnungAuf(daten()).position.zeitraum, '14.08.2026 – 13.09.2026')
})

test('Zahlungshinweis stellt klar, dass nichts zu überweisen ist', () => {
  // Sonst überweist jemand den bereits eingezogenen Betrag ein zweites Mal.
  assert.ok(bereiteRechnungAuf(daten()).zahlungshinweis.includes('überweisen Sie nichts'))
})

// ─── HTML ──────────────────────────────────────────────────────

test('Rechnungs-HTML enthält alle Kopfangaben', () => {
  const html = rechnungHtml(bereiteRechnungAuf(daten()), esc)
  for (const teil of ['PC-2026-000001', 'Maria Beispiel', 'Alltagsengel UG (haftungsbeschränkt)', 'HRB 140351', '14.08.2026']) {
    assert.ok(html.includes(teil), teil)
  }
})

test('Rechnungs-HTML maskiert Nutzereingaben im Empfängerblock', () => {
  // Empfängername und Anschrift stammen aus einem Formular.
  const html = rechnungHtml(
    bereiteRechnungAuf(
      daten({
        empfaenger: {
          name: '<script>alert(1)</script>',
          anschrift: ['<img src=x onerror=alert(2)>'],
          email: 'x@example.org',
        },
      })
    ),
    esc
  )
  // Geprüft wird, dass kein TAG entsteht — nicht, dass die Zeichenfolge
  // verschwindet. „onerror=" als reiner Text ist harmlos; gefährlich wäre
  // nur ein unmaskiertes '<', das den Browser ein Element öffnen lässt.
  assert.ok(!html.includes('<script'))
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&lt;img'))
})

test('Rechnungs-HTML lässt die Steuernummernzeile weg, solange keine hinterlegt ist', () => {
  const html = rechnungHtml(bereiteRechnungAuf(daten()), esc)
  assert.ok(!html.includes('Steuernummer:'))
  assert.ok(!html.includes('USt-IdNr.:'))
})

test('Rechnungs-HTML zeigt die USt-IdNr. bevorzugt vor der Steuernummer', () => {
  process.env.COACH_UST_ID_NR = 'DE123456789'
  process.env.COACH_STEUERNUMMER = '045 123 45678'
  const html = rechnungHtml(bereiteRechnungAuf(daten()), esc)
  assert.ok(html.includes('USt-IdNr.: DE123456789'))
  assert.ok(!html.includes('Steuernummer:'))
})
