// Segmentregeln und Engagement-Score — node:test
// Ausführen: npx tsx --test lib/marketing/segmente.test.ts  (oder npm run test:unit)
//
// Die Regeln sind reine Funktionen mit ausdrücklichem Bezugsdatum. Genau
// deshalb sind sie hier prüfbar: „inaktiv seit 30 Tagen" wäre gegen die
// Systemuhr nicht testbar, und der Trockenlauf von gestern hätte ein
// anderes Ergebnis als der Versand von heute.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEGMENTE, engagementScore, engagementStufe, filtereRegion, filtereSegment,
  istAusgeschieden, istSegmentKey, segmentAus, tageSeit,
} from './segmente'
import type { MarketingKontakt } from './typen'

const HEUTE = new Date('2026-08-30T12:00:00Z')
const vorTagen = (n: number) => new Date(HEUTE.getTime() - n * 86_400_000).toISOString()

function kontakt(ueber: Partial<MarketingKontakt> = {}): MarketingKontakt {
  return {
    userId: 'u1', email: 'a@example.com', anzeigename: 'A', rolle: 'kunde',
    plz: '60311', bundesland: 'Hessen', istTestkonto: false, istGeloescht: false, istDipaNutzer: false,
    registrierungVollstaendig: true, registriertAm: vorTagen(10),
    letzteAktivitaet: vorTagen(10), letzteBuchung: null, anzahlBuchungen: 0,
    verfuegbarkeitsFenster: 0, qualifiziert: false, einsatzfreigabe: false,
    fuehrungszeugnisGueltigBis: null, vertragsstatus: null, ausgetretenAm: null,
    ...ueber,
  }
}

// ── Grundbedingung ────────────────────────────────────────────────────────

test('KEIN Segment nimmt ein Testkonto auf', () => {
  const test_ = kontakt({ istTestkonto: true, rolle: 'engel', anzahlBuchungen: 3, einsatzfreigabe: true, verfuegbarkeitsFenster: 2, qualifiziert: true })
  for (const s of SEGMENTE) {
    assert.equal(s.passt(test_, HEUTE), false, `Segment ${s.key} nimmt ein Testkonto auf`)
  }
})

test('KEIN Segment nimmt ein zur Löschung vorgemerktes Konto auf', () => {
  const weg = kontakt({ istGeloescht: true, rolle: 'engel', anzahlBuchungen: 3, einsatzfreigabe: true, verfuegbarkeitsFenster: 2, qualifiziert: true })
  for (const s of SEGMENTE) {
    assert.equal(s.passt(weg, HEUTE), false, `Segment ${s.key} nimmt ein gelöschtes Konto auf`)
  }
})

test('KEIN Segment nimmt einen Kontakt ohne Adresse auf', () => {
  const ohne = kontakt({ email: '', rolle: 'engel', einsatzfreigabe: true, verfuegbarkeitsFenster: 2 })
  for (const s of SEGMENTE) {
    assert.equal(s.passt(ohne, HEUTE), false, `Segment ${s.key} nimmt einen Kontakt ohne Adresse auf`)
  }
})

// ── Beschäftigungsstand: ausgeschiedene Mitarbeitende ─────────────────────
//
// Der Befund vom 31.08.2026: `ladeMarketingKontakte` las `caregivers` ohne
// jede Bedingung auf den Beschäftigungsstand. Wer das Unternehmen verlassen
// hatte, stand am nächsten Tag weiter in JEDEM Engel-Segment. Die
// Einwilligung fing das nicht ab — sie wurde beim Austritt ja nicht
// widerrufen.

const ENGEL_SEGMENTE = SEGMENTE.filter((s) => s.zielgruppe === 'engel')

test('acht Engel-Segmente sind es, und alle prüfen den Beschäftigungsstand', () => {
  // Die Zahl steht hier, damit ein NEU hinzugefügtes Engel-Segment diesen
  // Test rot macht und nicht still an der Prüfung vorbeiläuft.
  assert.equal(ENGEL_SEGMENTE.length, 8)
})

test('KEIN Engel-Segment nimmt eine ausgeschiedene Person auf', () => {
  // Bewusst mit ALLEN Merkmalen ausgestattet, die ein Segment sonst
  // aufnehmen würde: freigegeben, qualifiziert, mit Fenstern, mit
  // Einsätzen, frisch registriert. Bleibt trotzdem draußen.
  const weg = kontakt({
    rolle: 'engel', vertragsstatus: 'ausgeschieden',
    einsatzfreigabe: true, verfuegbarkeitsFenster: 3, qualifiziert: true,
    anzahlBuchungen: 5, letzteAktivitaet: vorTagen(200), registriertAm: vorTagen(5),
    fuehrungszeugnisGueltigBis: vorTagen(-400),
  })
  for (const s of ENGEL_SEGMENTE) {
    assert.equal(s.passt(weg, HEUTE), false, `Segment ${s.key} nimmt eine ausgeschiedene Person auf`)
  }
})

test('Gegenprobe: dieselbe Person mit aktivem Vertrag wird von Engel-Segmenten aufgenommen', () => {
  // Ohne diese Gegenprobe bewiese der Test oben nichts — er wäre auch dann
  // grün, wenn die Segmente NIEMANDEN mehr aufnähmen.
  const da = kontakt({
    rolle: 'engel', vertragsstatus: 'aktiv',
    einsatzfreigabe: true, verfuegbarkeitsFenster: 3, qualifiziert: true,
    anzahlBuchungen: 5, letzteAktivitaet: vorTagen(200), registriertAm: vorTagen(5),
    fuehrungszeugnisGueltigBis: vorTagen(-400),
  })
  const treffer = ENGEL_SEGMENTE.filter((s) => s.passt(da, HEUTE)).map((s) => s.key)
  assert.deepEqual(treffer.sort(), [
    'engel_alle', 'engel_inaktiv_60t', 'engel_neu_30t', 'engel_qualifiziert', 'engel_verfuegbar',
  ])
})

test('jeder Vertragsstatus außer aktiv gilt als ausgeschieden', () => {
  for (const st of ['gekuendigt', 'ausgeschieden', 'ruhend']) {
    assert.equal(istAusgeschieden(kontakt({ vertragsstatus: st }), HEUTE), true, st)
  }
  assert.equal(istAusgeschieden(kontakt({ vertragsstatus: 'aktiv' }), HEUTE), false)
})

test('ein ungepflegter Vertragsstatus ist KEIN Austritt', () => {
  // Fail-open ist hier richtig: andersherum fiele jeder Bestand ohne
  // gepflegten Vertragsstatus schlagartig aus dem Verteiler — ein stiller
  // Totalausfall, der wie ein leeres Segment aussieht.
  assert.equal(istAusgeschieden(kontakt({ vertragsstatus: null, ausgetretenAm: null }), HEUTE), false)
  assert.equal(SEGMENTE.find((s) => s.key === 'engel_alle')!
    .passt(kontakt({ rolle: 'engel', vertragsstatus: null }), HEUTE), true)
})

test('ein Austrittsdatum in der Zukunft ist eine laufende Kündigungsfrist', () => {
  // Gekündigt, aber noch beschäftigt: der Dienstplan der nächsten Wochen
  // geht diese Person weiterhin etwas an.
  assert.equal(istAusgeschieden(kontakt({ ausgetretenAm: vorTagen(-30) }), HEUTE), false)
  assert.equal(istAusgeschieden(kontakt({ ausgetretenAm: vorTagen(1) }), HEUTE), true)
})

test('das Austrittsdatum greift am Tag des Austritts', () => {
  const heuteIso = HEUTE.toISOString().slice(0, 10)
  assert.equal(istAusgeschieden(kontakt({ ausgetretenAm: heuteIso }), HEUTE), true)
})

test('Austritt sperrt NUR die Engel-Post, nicht den Kunden-Newsletter', () => {
  // Eine ausgeschiedene Mitarbeiterin, die zugleich Kundin ist, hat den
  // Newsletter als Kundin bestellt — nicht als Mitarbeiterin.
  const exMitarbeiterinAlsKundin = kontakt({
    rolle: 'kunde', vertragsstatus: 'ausgeschieden', ausgetretenAm: vorTagen(10),
  })
  assert.equal(
    SEGMENTE.find((s) => s.key === 'kunden_alle')!.passt(exMitarbeiterinAlsKundin, HEUTE),
    true,
  )
})

// ── Katalog ───────────────────────────────────────────────────────────────

test('unbekanntes Segment wirft statt leer zu liefern', () => {
  // Fail-closed: ein leeres Segment bei Tippfehler hieße stiller Versand
  // an niemanden — und der zweite Versuch wäre ein Doppelversand.
  assert.throws(() => segmentAus('gibt_es_nicht'), /Unbekanntes Segment/)
  assert.equal(istSegmentKey('gibt_es_nicht'), false)
})

test('Segmentschlüssel sind eindeutig', () => {
  const keys = SEGMENTE.map((s) => s.key)
  assert.equal(new Set(keys).size, keys.length)
})

// ── Reaktivierungsstufen ──────────────────────────────────────────────────

test('Reaktivierungsstufen greifen erst ab der jeweiligen Frist', () => {
  const k = (tage: number) => kontakt({ anzahlBuchungen: 2, letzteAktivitaet: vorTagen(tage) })

  assert.equal(segmentAus('kunden_inaktiv_30t').passt(k(29), HEUTE), false)
  assert.equal(segmentAus('kunden_inaktiv_30t').passt(k(30), HEUTE), true)
  assert.equal(segmentAus('kunden_inaktiv_60t').passt(k(30), HEUTE), false)
  assert.equal(segmentAus('kunden_inaktiv_60t').passt(k(61), HEUTE), true)
  assert.equal(segmentAus('kunden_inaktiv_90t').passt(k(61), HEUTE), false)
  assert.equal(segmentAus('kunden_inaktiv_90t').passt(k(95), HEUTE), true)
})

test('Reaktivierung meint nur Kundschaft MIT früherer Buchung', () => {
  // Wer nie gebucht hat, gehört in „nie gebucht" — nicht in die
  // Reaktivierung. Sonst bekäme er eine Mail über „Ihren letzten Termin".
  const nie = kontakt({ anzahlBuchungen: 0, letzteAktivitaet: vorTagen(200) })
  assert.equal(segmentAus('kunden_inaktiv_30t').passt(nie, HEUTE), false)
  assert.equal(segmentAus('kunden_ohne_buchung').passt(nie, HEUTE), true)
})

test('nie aktiv gewesen zählt als inaktiv', () => {
  const k = kontakt({ anzahlBuchungen: 1, letzteAktivitaet: null })
  assert.equal(segmentAus('kunden_inaktiv_90t').passt(k, HEUTE), true)
})

// ── Engel ─────────────────────────────────────────────────────────────────

test('Führungszeugnis: fehlend und bald ablaufend zählen beide', () => {
  const s = segmentAus('engel_ohne_fuehrungszeugnis')
  const engel = (bis: string | null) => kontakt({ rolle: 'engel', fuehrungszeugnisGueltigBis: bis })

  assert.equal(s.passt(engel(null), HEUTE), true, 'fehlend')
  // Läuft in 30 Tagen ab → innerhalb der 60-Tage-Frist.
  assert.equal(s.passt(engel(vorTagen(-30)), HEUTE), true, 'läuft bald ab')
  // Läuft erst in 200 Tagen ab.
  assert.equal(s.passt(engel(vorTagen(-200)), HEUTE), false, 'noch lange gültig')
  // Bereits abgelaufen.
  assert.equal(s.passt(engel(vorTagen(10)), HEUTE), true, 'abgelaufen')
})

test('verfügbare Engel brauchen Einsatzfreigabe UND ein Zeitfenster', () => {
  const s = segmentAus('engel_verfuegbar')
  assert.equal(s.passt(kontakt({ rolle: 'engel', einsatzfreigabe: true, verfuegbarkeitsFenster: 0 }), HEUTE), false)
  assert.equal(s.passt(kontakt({ rolle: 'engel', einsatzfreigabe: false, verfuegbarkeitsFenster: 3 }), HEUTE), false)
  assert.equal(s.passt(kontakt({ rolle: 'engel', einsatzfreigabe: true, verfuegbarkeitsFenster: 3 }), HEUTE), true)
})

test('Engel-Segmente nehmen keine Kundschaft auf und umgekehrt', () => {
  const kunde = kontakt({ rolle: 'kunde' })
  const engel = kontakt({ rolle: 'engel' })
  assert.equal(segmentAus('engel_alle').passt(kunde, HEUTE), false)
  assert.equal(segmentAus('kunden_alle').passt(engel, HEUTE), false)
})

// ── Engagement ────────────────────────────────────────────────────────────

test('Engagement-Score bleibt in 0..100', () => {
  const viel = kontakt({ anzahlBuchungen: 99, letzteAktivitaet: vorTagen(0), plz: '60311' })
  const nichts = kontakt({ anzahlBuchungen: 0, letzteAktivitaet: null, plz: null, registrierungVollstaendig: false })
  assert.ok(engagementScore(viel, HEUTE) <= 100)
  assert.equal(engagementScore(nichts, HEUTE), 0)
})

test('ohne jede Aktivität ist der Score 0 und nicht „unbekannt"', () => {
  const k = kontakt({ anzahlBuchungen: 0, letzteAktivitaet: null, plz: null, registrierungVollstaendig: false })
  assert.equal(engagementStufe(engagementScore(k, HEUTE)), 'kalt')
})

test('mehr Buchungen und frischere Aktivität ergeben nie einen kleineren Score', () => {
  const wenig = kontakt({ anzahlBuchungen: 1, letzteAktivitaet: vorTagen(120) })
  const viel = kontakt({ anzahlBuchungen: 4, letzteAktivitaet: vorTagen(2) })
  assert.ok(engagementScore(viel, HEUTE) > engagementScore(wenig, HEUTE))
})

// ── Region ────────────────────────────────────────────────────────────────

test('leere PLZ-Liste schränkt nicht ein, eine unbrauchbare schon', () => {
  const liste = [kontakt({ plz: '60311' }), kontakt({ plz: '10115' })]
  assert.equal(filtereRegion(liste, []).length, 2)
  assert.equal(filtereRegion(liste, ['603']).length, 1)
  // Nur Unsinn drin: das Ergebnis ist LEER, nicht „alles". Ein
  // Regionsfilter, der bei unbrauchbarer Eingabe auf „alle" zurückfällt,
  // wäre eine stille Ausweitung des Empfängerkreises.
  assert.equal(filtereRegion(liste, ['abc']).length, 0)
})

test('Kontakte ohne PLZ fallen aus einem Regionsfilter heraus', () => {
  assert.equal(filtereRegion([kontakt({ plz: null })], ['603']).length, 0)
})

// ── Hilfsfunktionen ───────────────────────────────────────────────────────

test('tageSeit ist null-tolerant und behandelt Unsinn als unbekannt', () => {
  assert.equal(tageSeit(null, HEUTE), null)
  assert.equal(tageSeit('kein datum', HEUTE), null)
  assert.equal(tageSeit(vorTagen(5), HEUTE), 5)
})

test('filtereSegment reicht das Bezugsdatum durch', () => {
  const k = kontakt({ anzahlBuchungen: 1, letzteAktivitaet: vorTagen(45) })
  assert.equal(filtereSegment([k], 'kunden_inaktiv_30t', HEUTE).length, 1)
  // Dasselbe Datum, 40 Tage früher betrachtet: da war er noch keine 30
  // Tage inaktiv.
  const frueher = new Date(HEUTE.getTime() - 40 * 86_400_000)
  assert.equal(filtereSegment([k], 'kunden_inaktiv_30t', frueher).length, 0)
})
