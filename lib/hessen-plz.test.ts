// ═══════════════════════════════════════════════════════════════
// Hessen-PLZ + Engel-Matching Tests — node:test (keine neue Dependency)
// ═══════════════════════════════════════════════════════════════
//
// Ausführen:  npx tsx --test lib/hessen-plz.test.ts
// Oder:       npm run test:unit   (siehe package.json)
//
// Getestet wird die Compliance-Logik (Kassenleistung nur Hessen)
// und der Offline-Fallback des Standort-Matchings — inkl. der
// echten Fälle aus dem Datenbestand (Frankfurt-Griesheim 65933
// ist Frankfurt, NICHT Wiesbaden!).
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHessenPlz, normalizePlz, resolvePlz } from './hessen-plz'
import { matchPlz, matchPlzOffline } from './plz-match'

// ── normalizePlz / resolvePlz ───────────────────────────────────

test('normalizePlz extrahiert PLZ aus Freitext', () => {
  assert.equal(normalizePlz('65933 Frankfurt am Main '), '65933')
  assert.equal(normalizePlz('60311'), '60311')
  assert.equal(normalizePlz('Frankfurt am Main'), null)
  assert.equal(normalizePlz(''), null)
  assert.equal(normalizePlz(null), null)
  assert.equal(normalizePlz(undefined), null)
  assert.equal(normalizePlz('123'), null) // zu kurz
})

test('resolvePlz: postal_code hat Vorrang, sonst location', () => {
  assert.equal(resolvePlz('60311', '65183 Wiesbaden'), '60311')
  assert.equal(resolvePlz(null, '65183 Wiesbaden'), '65183')
  assert.equal(resolvePlz(null, 'Usingen'), null)
  assert.equal(resolvePlz(null, null), null)
})

// ── isHessenPlz: Kern-Fälle aus dem echten Datenbestand ─────────

test('Hessen: Frankfurt, Wiesbaden, Offenbach, Darmstadt, Kassel', () => {
  for (const plz of [
    '60311', '60439', '60529',       // Frankfurt
    '65929', '65933',                // Frankfurt-Höchst/Griesheim (65er!)
    '65183', '65207',                // Wiesbaden
    '63065', '63450',                // Offenbach, Hanau
    '63225',                         // Langen
    '64283', '64720',                // Darmstadt, Michelstadt
    '34117', '34497',                // Kassel, Korbach
    '35037', '35390', '35578',       // Marburg, Gießen, Wetzlar
    '36037', '36088', '36251',       // Fulda, Hünfeld, Bad Hersfeld
    '37269', '37213',                // Eschwege, Witzenhausen
    '61348', '61250',                // Bad Homburg, Usingen
    '65549',                         // Limburg
    '65326', '65399',                // Aarbergen, Kiedrich
  ]) {
    assert.equal(isHessenPlz(plz), true, `${plz} muss Hessen sein`)
  }
})

test('Nicht Hessen: Nachbarländer und Rest-Deutschland', () => {
  for (const plz of [
    '55118',                         // Mainz (RLP)
    '63739', '63939',                // Aschaffenburg, Wörth am Main (Bayern)
    '86830',                         // Schwabmünchen (Bayern)
    '10115',                         // Berlin
    '41352',                         // Korschenbroich (NRW)
    '59063',                         // Hamm (NRW)
    '68159',                         // Mannheim (BW)
    '69117',                         // Heidelberg (BW)
    '36404', '36448',                // Vacha, Bad Liebenstein (Thüringen)
    '34346', '34355',                // Hann. Münden, Staufenberg (Niedersachsen)
    '34414',                         // Warburg (NRW)
    '37073',                         // Göttingen (Niedersachsen)
    '65582', '65623',                // Diez, Hahnstätten (RLP)
  ]) {
    assert.equal(isHessenPlz(plz), false, `${plz} darf NICHT Hessen sein`)
  }
})

test('Grenzfälle: hessische Exklaven mit fremdem PLZ-Präfix', () => {
  for (const plz of [
    '55246', '55252',                // Mainz-Kostheim/-Kastel (Wiesbaden!)
    '68519', '68623', '68642',       // Viernheim, Lampertheim, Bürstadt
    '69434', '69488', '69509',       // Neckarsteinach, Birkenau, Mörlenbach
  ]) {
    assert.equal(isHessenPlz(plz), true, `${plz} ist Hessen (Exklave)`)
  }
})

test('Fail-safe: unbekannte/fehlende PLZ → keine Kassenleistung', () => {
  assert.equal(isHessenPlz(null), false)
  assert.equal(isHessenPlz(undefined), false)
  assert.equal(isHessenPlz(''), false)
  assert.equal(isHessenPlz('abc'), false)
  assert.equal(isHessenPlz('99999'), false)
})

// ── matchPlzOffline: Standort-Matching (Fallback-Pfad) ──────────

test('Frankfurt-Kunde sieht Frankfurter Engel (auch 65er-West!)', () => {
  assert.equal(matchPlzOffline('60311', '60439'), true)  // FFM Mitte ↔ Nordwest
  assert.equal(matchPlzOffline('60329', '65933'), true)  // FFM Mitte ↔ Griesheim
  assert.equal(matchPlzOffline('60385', '60311'), true)
})

test('Wiesbaden-Zentrum ↔ Frankfurt matcht NICHT — auch nicht 65er↔65er', () => {
  // Seit c4195df (25-km-Radius + exakte PLZ-Koordinaten statt grober
  // Zonen-Zentroide): 65183 (Wiesbaden-Zentrum) ↔ 65933 (FFM-Griesheim)
  // liegt exakt bei 25,16 km — knapp über dem 25-km-Radius, matcht also
  // weiterhin NICHT (Toleranz-Puffer entfällt, weil beide PLZ exakte
  // Koordinaten haben).
  assert.equal(matchPlzOffline('65183', '60311'), false) // WI ↔ FFM Mitte
  assert.equal(matchPlzOffline('65183', '65933'), false) // WI-Zentrum ↔ FFM-Griesheim (beide 65!)
  assert.equal(matchPlzOffline('60311', '65183'), false) // umgekehrt
})

test('Wiesbaden-Randgebiet ↔ Frankfurt-Griesheim matcht — 21 km Luftlinie', () => {
  // 65207 liegt im Nordosten Wiesbadens, deutlich näher an FFM-Griesheim
  // als das Wiesbadener Zentrum (65183). Mit exakten PLZ-Koordinaten
  // (statt der alten Zonen-Näherung) beträgt die reale Distanz ~21 km —
  // innerhalb des 25-km-Radius. Das ist kein Bug: der alte Test erwartete
  // "false", weil die alte Zonen-Zentroid-Logik (15-km-Radius + 5-km-
  // Unschärfe-Puffer) hier ungenauer war. Siehe c4195df.
  assert.equal(matchPlzOffline('65207', '65933'), true)
})

test('Sinnvolle Nachbarschaften matchen', () => {
  assert.equal(matchPlzOffline('63225', '60311'), true)  // Langen ↔ FFM
  assert.equal(matchPlzOffline('55118', '65183'), true)  // Mainz ↔ Wiesbaden
  assert.equal(matchPlzOffline('63065', '60311'), true)  // Offenbach ↔ FFM
})

test('Weit entfernte Regionen matchen nicht', () => {
  assert.equal(matchPlzOffline('60311', '86830'), false) // FFM ↔ Schwabmünchen
  assert.equal(matchPlzOffline('60311', '36088'), false) // FFM ↔ Hünfeld
  assert.equal(matchPlzOffline('65183', '55246'), true)  // WI ↔ Kastel (quasi ein Ort)
  assert.equal(matchPlzOffline('60311', '10115'), false) // FFM ↔ Berlin
})

test('Fallback bei unbekannter Zone: gleiche Leitregion (2 Stellen)', () => {
  // 999xx existiert nicht in der Zonen-Tabelle → Leitregions-Vergleich
  assert.equal(matchPlzOffline('99998', '99999'), true)
  assert.equal(matchPlzOffline('99999', '88888'), false)
})

// ── matchPlz: kompletter Ablauf (Zonen primär, Geocode-Fallback) ─

const noGeo = async () => null

test('matchPlz: identische PLZ matcht ohne jede Berechnung', async () => {
  assert.equal(await matchPlz('99999', '99999', noGeo), true)
})

test('matchPlz: bekannte Zonen nutzen NICHT die Geocoding-API', async () => {
  let called = 0
  const spy = async () => { called++; return null }
  assert.equal(await matchPlz('60311', '65933', spy), true)   // FFM ↔ Griesheim
  assert.equal(await matchPlz('65183', '65933', spy), false)  // WI-Zentrum ↔ Griesheim (25,16 km, knapp über Radius)
  assert.equal(await matchPlz('65207', '65933', spy), true)   // WI-Randgebiet ↔ Griesheim (21 km, s. hessen-plz.test.ts oben)
  assert.equal(called, 0)
})

test('matchPlz: unbekannte Zone → Geocode-Distanz entscheidet', async () => {
  const coords: Record<string, { lat: number; lng: number }> = {
    '99999': { lat: 51.00, lng: 10.00 },
    '88888': { lat: 51.05, lng: 10.05 }, // ~6,5 km entfernt
    '77777': { lat: 52.00, lng: 12.00 }, // weit weg
  }
  const geo = async (plz: string) => coords[plz] ?? null
  assert.equal(await matchPlz('99999', '88888', geo), true)
  assert.equal(await matchPlz('99999', '77777', geo), false)
})

test('matchPlz: Zone unbekannt + Geocode down → Leitregion', async () => {
  assert.equal(await matchPlz('99998', '99999', noGeo), true)
  assert.equal(await matchPlz('99999', '88888', noGeo), false)
})
