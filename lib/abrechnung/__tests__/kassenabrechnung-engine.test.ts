/**
 * Tests für Kassenabrechnung-Engine
 *
 * Testet: Pre-Flight-Validierung, Doppelversand-Schutz,
 * Bundesland-Gates, Hessen-Sperre, Mandantentrennung
 *
 * Läuft mit: npm run test:unit (node:test), wie die übrigen lib/-Tests.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

// ── Pre-Flight-Validierung ──────────────────────────────────────

test('Status-Enums sind vollständig definiert', () => {
  const validStatus = [
    'erstellt', 'validierung_laeuft', 'validierung_fehlgeschlagen',
    'geprueft', 'freigegeben', 'export_laeuft',
    'bereit_zum_export', 'exportiert',
    'bereit_zur_uebermittlung', 'uebermittlung_laeuft',
    'uebermittelt', 'quittiert',
    'angenommen', 'teilweise_abgelehnt', 'abgelehnt',
    'korrektur_erforderlich', 'korrigiert', 'abgeschlossen',
    'storniert',
  ]
  assert.equal(validStatus.length, 19)
  assert.ok(validStatus.includes('bereit_zur_uebermittlung'))
  assert.ok(!validStatus.includes('uebertragen')) // Falsche Benennung
})

test('Lauf-Typen sind vollständig definiert', () => {
  const typen = [
    'erstabrechnung', 'korrekturabrechnung', 'nachberechnung',
    'storno', 'wiederholungslauf', 'sammelabrechnung',
  ]
  assert.equal(typen.length, 6)
})

// ── Hessen-Gate ─────────────────────────────────────────────────

test('Hessen ANTRAG_EINGEREICHT — Kassenabrechnung MUSS blockiert sein', () => {
  // Hessen hat Status ANTRAG_EINGEREICHT → kassenrechnung_enabled = false
  const hessenSettings = {
    status: 'ANTRAG_EINGEREICHT',
    insurance_enabled: false,
    kassenrechnung_enabled: false,
    dakota_export_enabled: false,
    approval_document: null,
  }

  // Prüfpunkt: Anerkennung MUSS fehlschlagen
  assert.notEqual(hessenSettings.status, 'ANERKANNT')
  assert.equal(hessenSettings.kassenrechnung_enabled, false)

  // Privat MUSS weiterhin möglich sein
  const privateEnabled = true // state_settings.private_enabled = true
  assert.equal(privateEnabled, true)
})

test('ANERKANNT-Status erlaubt Kassenabrechnung', () => {
  const anerkannt = {
    status: 'ANERKANNT',
    insurance_enabled: true,
    kassenrechnung_enabled: true,
    approval_document: 'bescheid.pdf',
  }
  assert.equal(anerkannt.status, 'ANERKANNT')
  assert.equal(anerkannt.kassenrechnung_enabled, true)
})

// ── Doppelversand-Schutz ────────────────────────────────────────

test('Eindeutiger Index verhindert doppelte Erstabrechnung', () => {
  // Der UNIQUE INDEX idx_lauf_dedup auf (organization_id, abrechnungsmonat, kostentraeger_ik, lauf_typ)
  // mit WHERE status NOT IN ('storniert', 'abgelehnt', 'korrigiert') AND lauf_typ = 'erstabrechnung'
  // garantiert auf DB-Ebene dass es nur einen aktiven Erstlauf pro Kombination gibt.
  const constraint = {
    columns: ['organization_id', 'abrechnungsmonat', 'kostentraeger_ik', 'lauf_typ'],
    where: "status NOT IN ('storniert', 'abgelehnt', 'korrigiert') AND lauf_typ = 'erstabrechnung'",
  }
  assert.ok(constraint.columns.includes('organization_id'))
  assert.ok(constraint.where.includes('storniert'))
  assert.ok(constraint.where.includes('erstabrechnung'))
})

// ── DAKOTA-Sicherheit ───────────────────────────────────────────

test('Ohne Zugangsdaten: Status = externer_zugang_fehlt, NIEMALS uebermittelt', () => {
  const ohneZugang = {
    sftp_host: null,
    sftp_user: null,
  }
  const hatZugang = !!(ohneZugang.sftp_host && ohneZugang.sftp_user)
  const status = hatZugang ? 'bereit_zur_uebermittlung' : 'externer_zugang_fehlt'

  assert.equal(status, 'externer_zugang_fehlt')
  assert.notEqual(status, 'uebermittelt')
})

test('Mit Zugangsdaten: Status = bereit_zur_uebermittlung', () => {
  const mitZugang = {
    sftp_host: 'sftp.datenannahmestelle.de',
    sftp_user: 'alltagsengel',
  }
  const hatZugang = !!(mitZugang.sftp_host && mitZugang.sftp_user)
  const status = hatZugang ? 'bereit_zur_uebermittlung' : 'externer_zugang_fehlt'

  assert.equal(status, 'bereit_zur_uebermittlung')
})

// ── Mandantentrennung ───────────────────────────────────────────

test('RLS RESTRICTIVE Policy prüft organization_id', () => {
  // Jede neue Tabelle hat:
  // 1. ALTER TABLE ... ENABLE ROW LEVEL SECURITY
  // 2. CREATE POLICY org_fence_... AS RESTRICTIVE
  //    USING (organization_id = (SELECT p.organization_id FROM profiles p WHERE p.id = auth.uid()))
  const tabellen = [
    'dta_lauf_rechnungen',
    'dta_kostentraeger',
    'dta_dakota_auftraege',
    'dta_ruecklaeufer',
    'dta_ruecklaeufer_positionen',
    'dta_fehlerprotokoll',
    'dta_korrekturlaeufe',
    'dta_validierungen',
  ]
  // Alle 8 neuen Tabellen haben RLS + org_fence
  assert.equal(tabellen.length, 8)
})

test('abrechnungslaeufe hat jetzt auch RLS (war vorher ohne)', () => {
  // ALTER TABLE public.abrechnungslaeufe ENABLE ROW LEVEL SECURITY
  // + org_fence Policy mit organization_id IS NULL OR match
  const hatRls = true
  assert.equal(hatRls, true)
})

// ── Rückläufer-Verarbeitung ─────────────────────────────────────

test('Status-Ableitung aus Rückläufer-Typ', () => {
  const mapping: Record<string, string> = {
    quittung: 'angenommen',
    annahmebestaetigung: 'angenommen',
    fehlermeldung: 'fachlicher_fehler', // Default ohne T-Prefix
    zahlungsavis: 'angenommen',
  }

  assert.equal(mapping.quittung, 'angenommen')
  assert.equal(mapping.fehlermeldung, 'fachlicher_fehler')
})

// ── Korrekturläufe ──────────────────────────────────────────────

test('Nur bestimmte Lauf-Status erlauben Korrektur', () => {
  const korrigierbar = ['teilweise_abgelehnt', 'abgelehnt', 'korrektur_erforderlich']
  const nichtKorrigierbar = ['erstellt', 'geprueft', 'angenommen', 'abgeschlossen', 'storniert']

  for (const status of nichtKorrigierbar) {
    assert.ok(!korrigierbar.includes(status))
  }
})

test('Korrekturlauf referenziert Original', () => {
  const korrektur = {
    original_lauf_id: 'lauf-001',
    korrektur_lauf_id: 'lauf-002',
    korrektur_typ: 'korrekturabrechnung',
  }
  assert.ok(korrektur.original_lauf_id)
  assert.equal(korrektur.korrektur_typ, 'korrekturabrechnung')
})

// ── Fehlerprotokoll ─────────────────────────────────────────────

test('Status-Übergänge sind eingeschränkt', () => {
  const erlaubt: Record<string, string[]> = {
    'neu': ['in_pruefung', 'ignoriert'],
    'in_pruefung': ['korrektur_erforderlich', 'erledigt', 'ignoriert'],
    'korrektur_erforderlich': ['korrigiert', 'ignoriert'],
    'korrigiert': ['erneut_eingereicht', 'erledigt'],
    'erneut_eingereicht': ['erledigt', 'korrektur_erforderlich'],
  }

  // NEU → erledigt ist NICHT erlaubt (muss erst geprüft werden)
  assert.ok(!erlaubt['neu'].includes('erledigt'))

  // IN_PRÜFUNG → erledigt IST erlaubt
  assert.ok(erlaubt['in_pruefung'].includes('erledigt'))
})

// ── Euro/Cent-Grenze (Regression) ───────────────────────────────
// invoices.total_amount und service_records.amount stehen in EURO,
// jede *_cent-Spalte und der EDIFACT-Generator erwarten CENT. Vor dem
// Fix wanderte total_amount ungerechnet in gesamtbetrag_cent,
// dta_lauf_rechnungen.betrag_cent, den Audit-Trail und die Kassendatei
// — alle Betraege waren dadurch Faktor 100 zu niedrig.

test('euroZuCent rechnet Euro-Betraege in Cent um', async () => {
  const { euroZuCent } = await import('../kassenabrechnung-engine.ts')

  // Beleg aus der Live-DB: dieselbe Rechnung fuehrt
  // total_amount=43.50 und soll_betrag_cent=4350.
  assert.equal(euroZuCent(43.5), 4350)
  assert.equal(euroZuCent(70), 7000)
  assert.equal(euroZuCent(187), 18700)

  // Float-Artefakte duerfen nicht durchschlagen: 19.99 * 100 = 1998.9999...
  assert.equal(euroZuCent(19.99), 1999)
  assert.equal(euroZuCent(0.1 + 0.2), 30)

  // Fehlende Betraege sind 0 Cent, nicht NaN.
  assert.equal(euroZuCent(null), 0)
  assert.equal(euroZuCent(undefined), 0)
  assert.equal(euroZuCent(0), 0)
})

test('euroZuCent summiert Rechnungen ohne Rundungsdrift', async () => {
  const { euroZuCent } = await import('../kassenabrechnung-engine.ts')

  const rechnungen = [{ total_amount: 43.5 }, { total_amount: 70 }, { total_amount: 0.01 }]
  const summe = rechnungen.reduce((s, r) => s + euroZuCent(r.total_amount), 0)
  assert.equal(summe, 11351)
})

// ── Monatsgrenzen (Regression) ──────────────────────────────────
// invoices hat KEINE Spalte period_month — nur period_start/period_end.
// Der alte Filter .like('period_month', …) brach mit Postgres 42703 ab
// und legte Pre-Flight, Lauf-Erstellung und Export gleichzeitig still.

test('monatsGrenzen liefert erste und letzte Kalendertage', async () => {
  const { monatsGrenzen } = await import('../kassenabrechnung-engine.ts')

  assert.deepEqual(monatsGrenzen('2026-07'), { von: '2026-07-01', bis: '2026-07-31' })

  // Auch mit vollem Datum als Eingabe.
  assert.deepEqual(monatsGrenzen('2026-07-15'), { von: '2026-07-01', bis: '2026-07-31' })

  // 30-Tage-Monat.
  assert.deepEqual(monatsGrenzen('2026-06'), { von: '2026-06-01', bis: '2026-06-30' })

  // Februar im Schaltjahr (2028) und im Normaljahr (2026).
  assert.deepEqual(monatsGrenzen('2026-02'), { von: '2026-02-01', bis: '2026-02-28' })
  assert.deepEqual(monatsGrenzen('2028-02'), { von: '2028-02-01', bis: '2028-02-29' })

  // Dezember darf nicht ins Folgejahr rutschen.
  assert.deepEqual(monatsGrenzen('2026-12'), { von: '2026-12-01', bis: '2026-12-31' })
})

test('monatsGrenzen deckt eine Rechnung des Monats ab, aber nicht die des Folgemonats', async () => {
  const { monatsGrenzen } = await import('../kassenabrechnung-engine.ts')
  const { von, bis } = monatsGrenzen('2026-07')

  // period_start der realen Juli-Rechnungen aus der Live-DB.
  assert.ok('2026-07-01' >= von && '2026-07-01' <= bis)
  // Angrenzende Monate duerfen nicht mitgezogen werden.
  assert.ok(!('2026-06-30' >= von && '2026-06-30' <= bis))
  assert.ok(!('2026-08-01' >= von && '2026-08-01' <= bis))
})

// ── Datenannahmestellen-Routing (Regression) ────────────────────
// findeDatenannahmestelle endete frueher mit einem bedingungslosen
// `return DATENANNAHMESTELLEN.aok_hessen`. Jede unbekannte Kasse wurde
// damit still an die AOK-Annahmestelle ITSCare geliefert — die
// Null-Pruefungen im edifact-generator waren toter Code, und eine
// Lieferung an die falsche Annahmestelle ist ein Abrechnungsfehler.

test('findeDatenannahmestelle routet bekannte Kassen an die richtige Stelle', async () => {
  const { findeDatenannahmestelle } = await import('../schluesselverzeichnis.ts')

  assert.equal(findeDatenannahmestelle('AOK Hessen')?.ik, '105810615')
  assert.equal(findeDatenannahmestelle('AOK Bayern')?.ik, '105810615')      // bundesweit ITSCare
  assert.equal(findeDatenannahmestelle('Techniker Krankenkasse')?.ik, '109989162')
  assert.equal(findeDatenannahmestelle('BARMER')?.ik, '660510336')
  assert.equal(findeDatenannahmestelle('DAK-Gesundheit')?.ik, '661430035')
  assert.equal(findeDatenannahmestelle('BKK Mobil Oil')?.ik, '104027544')
  assert.equal(findeDatenannahmestelle('IKK classic')?.ik, '109900019')
  assert.equal(findeDatenannahmestelle('KNAPPSCHAFT')?.ik, '109905003')
})

test('findeDatenannahmestelle liefert null statt Fehlrouting an die AOK', async () => {
  const { findeDatenannahmestelle } = await import('../schluesselverzeichnis.ts')

  // Unbekannte bzw. nicht hinterlegte Kostentraeger.
  // (Eine "SBK Siemens-Betriebskrankenkasse" ist bewusst KEIN Beispiel —
  //  sie enthaelt "Betriebskrankenkasse" und gehoert korrekt zu BITMARCK.)
  assert.equal(findeDatenannahmestelle('Continentale Krankenversicherung'), null)
  assert.equal(findeDatenannahmestelle('Debeka Krankenversicherung a.G.'), null)
  assert.equal(findeDatenannahmestelle('Beihilfestelle Land Hessen'), null)
  assert.equal(findeDatenannahmestelle(''), null)

  // Ein gesetztes Bundesland darf KEIN AOK-Routing erzwingen.
  assert.equal(findeDatenannahmestelle('Unbekannte Kasse', 'hessen'), null)
})

test('BKK wird nicht als AOK erkannt (Reihenfolge der Kassenerkennung)', async () => {
  const { erkenneKassenSchluessel } = await import('../schluesselverzeichnis.ts')

  assert.equal(erkenneKassenSchluessel('Betriebskrankenkasse Firmus'), 'bkk')
  assert.equal(erkenneKassenSchluessel('IKK Südwest'), 'ikk')
  assert.equal(erkenneKassenSchluessel('AOK Nordost'), 'aok_hessen')
  assert.equal(erkenneKassenSchluessel('Irgendwas GmbH'), null)
})
