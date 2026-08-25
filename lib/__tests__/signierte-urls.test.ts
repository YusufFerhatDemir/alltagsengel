// ═══════════════════════════════════════════════════════════════
// Signierte Storage-URLs — Laufzeiten als Regressionsschranke
// ═══════════════════════════════════════════════════════════════
//
// Eine signierte Supabase-Storage-URL ist ein INHABERTOKEN: sie traegt
// ihre Berechtigung selbst, wird am Storage-Dienst geprueft und kennt
// deshalb weder RLS noch Rolle noch Organisation noch den Kontostatus.
// Wer den Link hat, kommt an die Datei — auch nach Rollenwechsel, nach
// Deaktivierung des Kontos und aus einem fremden Mandanten heraus.
// Die einzige wirksame Begrenzung ist die Laufzeit.
//
// Das Rechnungs-PDF stand auf 30 Tagen und wurde zugleich dauerhaft in
// invoice_packages.pdf_url abgelegt — also in jedem Backup. Das ist hier
// festgenagelt, weil der Wert sonst beim naechsten „geht ja nicht mehr"
// wieder nach oben rutscht.
//
// Der Quelltext wird gelesen statt der Aufruf ausgefuehrt: die
// Signierstellen haengen an Supabase, und geprueft werden soll die Zahl.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RECHNUNGS_PDF_URL_TTL_SEKUNDEN } from '../pdf/rechnung-paket'

const WURZEL = join(import.meta.dirname, '..', '..')
const lies = (p: string) => readFileSync(join(WURZEL, p), 'utf8')

/** Obergrenze fuer den Link auf ein Rechnungs-PDF. */
const MAX_RECHNUNGS_TTL_SEKUNDEN = 60 * 60 // 1 Stunde

describe('Laufzeit der Rechnungs-PDF-URL', () => {
  test('betraegt 10 Minuten', () => {
    assert.equal(RECHNUNGS_PDF_URL_TTL_SEKUNDEN, 600)
  })

  test('bleibt unter einer Stunde — 30 Tage waren der Ausgangsbefund', () => {
    assert.ok(
      RECHNUNGS_PDF_URL_TTL_SEKUNDEN <= MAX_RECHNUNGS_TTL_SEKUNDEN,
      `TTL ${RECHNUNGS_PDF_URL_TTL_SEKUNDEN}s ueberschreitet ${MAX_RECHNUNGS_TTL_SEKUNDEN}s`,
    )
    assert.ok(RECHNUNGS_PDF_URL_TTL_SEKUNDEN < 60 * 60 * 24 * 30)
  })

  test('Erzeugung und Download-Route signieren mit derselben Konstante', () => {
    // Zwei Zahlen an zwei Stellen laufen auseinander; die Download-Route
    // hatte bereits 10 Minuten, waehrend die Erzeugung auf 30 Tagen stand.
    for (const datei of ['lib/pdf/rechnung-paket.ts', 'app/api/rechnungen/[id]/pdf/route.ts']) {
      const quelle = lies(datei)
      assert.ok(
        quelle.includes('createSignedUrl(storagePath, RECHNUNGS_PDF_URL_TTL_SEKUNDEN)'),
        `${datei} signiert nicht ueber die gemeinsame Konstante`,
      )
    }
  })

  test('keine Rechnungs-URL wird mehr auf Tage signiert', () => {
    const quelle = lies('lib/pdf/rechnung-paket.ts')
    assert.equal(/createSignedUrl\([^)]*60 \* 60 \* 24/.test(quelle), false)
  })
})

// ───────────────────────────────────────────────────────────────
describe('Laufzeiten, die eine Geschaeftsentscheidung brauchen', () => {
  // Diese drei Stellen stehen weiter auf 7 Tagen. Kuerzen ginge nur mit
  // einer Re-Signier-Route (Muster: GET /api/rechnungen/[id]/pdf), weil
  // die erzeugte URL jeweils in der Datenbank landet und direkt geoeffnet
  // wird. Der Test haelt fest, dass die offene Entscheidung im Quelltext
  // markiert bleibt, statt stillschweigend zu verschwinden.
  const OFFEN = [
    'lib/upload-document.ts',
    'lib/upload-service-proof.ts',
    'app/api/native/leistungsnachweis-upload/route.ts',
  ]

  for (const datei of OFFEN) {
    test(`${datei} ist als BUSINESS_INPUT_REQUIRED markiert`, () => {
      const quelle = lies(datei)
      assert.ok(quelle.includes('BUSINESS_INPUT_REQUIRED'), `${datei}: Markierung fehlt`)
      assert.ok(quelle.includes('createSignedUrl'), `${datei}: signiert gar nicht mehr`)
    })
  }

  test('7 Tage sind die Obergrenze — 30 Tage kommen nirgends zurueck', () => {
    for (const datei of OFFEN) {
      assert.equal(
        /createSignedUrl\([^)]*60 \* 60 \* 24 \* (?!7\b)\d+/.test(lies(datei)),
        false,
        `${datei}: Laufzeit ueber 7 Tage`,
      )
    }
  })
})
