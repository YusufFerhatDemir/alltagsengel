// ═══════════════════════════════════════════════════════════════════
// Zaun: jeder Weg, der aus service_records eine Forderung oder einen
// amtlichen Nachweis macht, muss Storno lesen UND ausfiltern
// ═══════════════════════════════════════════════════════════════════
//
// WARUM ALS QUELLTEXT-PRUEFUNG
// Der Fehler ist per Konstruktion eine WEGLASSUNG: 'STORNIERT' hat kein
// Gegenstueck im status-Werteset, deshalb kommt ein Widerruf durch jeden
// Filter der Form .in('status', ['complete','signed','invoiced']) — und
// zwar unauffaellig, weil die Abfrage weiter Zeilen liefert. Ein
// funktionaler Test faengt genau die Stelle, die er anfaehrt; neu
// hinzukommende Abfragen faengt er nicht.
//
// Diese Datei ist deshalb ausdruecklich ein ZAUN, kein Ersatz fuer die
// funktionalen Tests in storno-und-nachweisstand-ketten.test.ts: sie
// prueft, dass jeder aufgezaehlte Weg (a) die beiden Storno-Spalten
// mitliest — ohne sie filtert ohneStornierte() naemlich nichts — und
// (b) den Filter auch anwendet.
//
// Kommt ein Weg hinzu, gehoert er in die Liste. Faellt einer weg, wird
// dieser Test rot, statt still gruen zu bleiben.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const WURZEL = process.cwd()

interface Geldweg {
  datei: string
  /** Was auf diesem Weg entsteht — steht in der Fehlermeldung. */
  ergebnis: string
}

const GELDWEGE: Geldweg[] = [
  { datei: 'app/api/leistungsnachweis/route.ts', ergebnis: 'Leistungsnachweis-PDF für die Pflegekasse' },
  { datei: 'lib/abrechnung/leistungsnachweis-pdf.ts', ergebnis: 'Leistungsnachweis-PDF je Verordnung' },
  { datei: 'lib/abrechnung/kassenabrechnung-engine.ts', ergebnis: 'EDIFACT-Kassenabrechnung (§ 105)' },
  { datei: 'lib/abrechnung/sgb-v/versand.ts', ergebnis: '§ 302-Abrechnungslauf an die Kasse' },
  { datei: 'app/api/billing/sgb-v/vorschau/route.ts', ergebnis: '§ 302-Vorschau' },
  { datei: 'app/api/billing/dta/dry-run/route.ts', ergebnis: 'DTA-Trockenlauf' },
  { datei: 'app/api/billing/auto-invoice/route.ts', ergebnis: 'automatische Rechnungserstellung' },
  { datei: 'app/api/billing/invoices/create/route.ts', ergebnis: 'Rechnungserstellung' },
  { datei: 'app/api/billing/monthly-closing/route.ts', ergebnis: 'Monatsabschluss-Übersicht' },
  { datei: 'lib/abrechnung/monatsabschluss.ts', ergebnis: 'Monatsabschluss je Klient' },
  { datei: 'lib/billing/core/sammelrechnung.ts', ergebnis: 'Sammelrechnungslauf' },
  { datei: 'lib/analytics/pruefmappe.ts', ergebnis: 'Prüfmappe (MD-Prüfung)' },
  { datei: 'lib/analytics/bonusEngine.ts', ergebnis: 'Bonusberechnung' },
]

describe('Storno-Zaun — Nachweis- und Abrechnungswege', () => {
  for (const weg of GELDWEGE) {
    describe(weg.datei, () => {
      const pfad = join(WURZEL, weg.datei)

      it('existiert (sonst prüft der Zaun einen leeren String)', () => {
        expect(existsSync(pfad)).toBe(true)
      })

      it(`filtert stornierte Nachweise — sonst steht der Widerruf im/in der ${weg.ergebnis}`, () => {
        const quelle = readFileSync(pfad, 'utf8')
        expect(
          quelle.includes('ohneStornierte') || quelle.includes('istStorniert'),
          `${weg.datei} liest service_records für "${weg.ergebnis}", wendet aber weder `
          + 'ohneStornierte() noch istStorniert() an. Ein stornierter Nachweis bleibt wegen '
          + "des fehlenden status-Gegenstücks auf status='signed' stehen und kommt durch "
          + "jeden .in('status', …)-Filter.",
        ).toBe(true)
      })

      it('liest proof_status UND billing_status mit — ohne sie filtert nichts', () => {
        const quelle = readFileSync(pfad, 'utf8')
        // Beide Spalten müssen irgendwo in einem select() stehen. Fehlen sie,
        // sind beide Felder undefined und ohneStornierte() entfernt nichts —
        // der Aufruf sähe geprüft aus und wäre wirkungslos.
        expect(quelle).toContain('proof_status')
        expect(quelle).toContain('billing_status')
      })
    })
  }
})

// ── Zweiter Zaun: Mandant beim Dienstschluessel ────────────────────
//
// organization_id ist auf ocr_results, review_errors und geo_events
// NOT NULL mit Default current_org_id(). Diese Funktion liest auth.uid();
// beim Dienstschluessel gibt es keinen angemeldeten Nutzer und die
// Fallback-Kette endet in der fest verdrahteten Stamm-Organisation
// (live aus pg_proc gelesen). Ein Insert ohne organization_id legt die
// Zeile deshalb im Bestand der Stamm-Organisation ab — gleich welcher
// Mandant sie ausgeloest hat.

const MANDANTEN_WEGE = [
  { datei: 'app/api/native/leistungsnachweis-upload/route.ts', tabelle: 'ocr_results' },
  { datei: 'app/api/native/geo-events/route.ts', tabelle: 'geo_events' },
  { datei: 'app/api/admin/ocr/route.ts', tabelle: 'ocr_results' },
]

describe('Mandanten-Zaun — Dienstschlüssel-Inserts setzen organization_id', () => {
  for (const weg of MANDANTEN_WEGE) {
    it(`${weg.datei} schreibt organization_id ausdrücklich`, () => {
      const quelle = readFileSync(join(WURZEL, weg.datei), 'utf8')
      expect(quelle).toContain(`.from('${weg.tabelle}')`)
      expect(
        /organization_id:\s*(auth\.organizationId|orgId|organizationId)/.test(quelle),
        `${weg.datei} schreibt in ${weg.tabelle}, setzt aber keine organization_id. `
        + 'Der Default current_org_id() greift beim Dienstschlüssel nicht und legt die '
        + 'Zeile in der Stamm-Organisation ab.',
      ).toBe(true)
    })
  }
})
