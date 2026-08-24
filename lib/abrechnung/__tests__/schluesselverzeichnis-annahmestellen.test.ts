/**
 * Schlüsselverzeichnis — Datenannahmestellen-Lookup und Tarifbereiche
 *
 * `schluesselverzeichnis.test.ts` prüft den statischen Katalog: Prüfziffern,
 * Kassenarten, Leistungsschlüssel, die synchrone Kassenerkennung. Nicht
 * geprüft war bisher `findeDatenannahmestelleAsync` — also genau der Weg,
 * den die Abrechnung im Betrieb nimmt, weil er die org-eigene Konfiguration
 * aus der Datenbank vorzieht.
 *
 * Dieser Weg hatte schon einmal einen stillen Totalausfall: die Kassenart
 * wurde über eine verschachtelte Negation hergeleitet, die für JEDE
 * Nicht-AOK-Kasse `null` ergab — die Datenbank wurde dann gar nicht erst
 * befragt, und jede Organisation bekam für BKK, IKK, TK und BARMER die
 * hardcodierte Annahmestelle, egal was sie konfiguriert hatte. Ein
 * Regressionstest hätte das gesehen; es gab keinen.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findeDatenannahmestelle,
  findeDatenannahmestelleAsync,
  erkenneKassenSchluessel,
  tarifkennzeichenFuerBundesland,
  TARIFBEREICH_JE_BUNDESLAND,
  TARIFKENNZEICHEN_HESSEN,
  DATENANNAHMESTELLEN,
  KASSENART_LABEL,
  ERSATZ_BESCHAEFTIGTENNUMMER,
  type Kassenart,
} from '../schluesselverzeichnis'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '11111111-1111-4111-8111-111111111111'

/** Antwortgeber, der jede Abfrage auf `datenannahmestellen` leer beantwortet. */
const leer = () => ({ data: null })

// ═══════════════════════════════════════════════════════════════
// findeDatenannahmestelleAsync — DB zuerst
// ═══════════════════════════════════════════════════════════════

test('eine org-eigene Annahmestelle sticht den hardcodierten Katalog', async () => {
  const fake = erstelleFakeSupabase(() => ({
    data: { ik_nummer: '660500345', name: 'Eigene Annahmestelle', zustaendig_fuer: 'BKK' },
  }))

  const stelle = await findeDatenannahmestelleAsync(fake.client, 'BKK VerbundPlus', 'hessen', ORG)

  assert.equal(stelle?.ik, '660500345')
  assert.equal(stelle?.name, 'Eigene Annahmestelle')
  assert.equal(
    stelle?.kassenart, 'BK',
    'Die Kassenart kommt aus dem Erkenner, nicht aus der DB-Zeile — sonst '
    + 'könnte eine Fehleingabe die Kassenart der Sendung umdefinieren.',
  )
})

test('der Lookup ist auf Organisation, Kassenart und Aktivkennzeichen eingegrenzt', async () => {
  const fake = erstelleFakeSupabase(leer)
  await findeDatenannahmestelleAsync(fake.client, 'BKK VerbundPlus', 'hessen', ORG)

  const abfrage = fake.ersterAuf('datenannahmestellen')
  assert.ok(abfrage, 'Bei bekannter Kassenart und gesetzter Organisation muss die DB befragt werden.')
  assert.ok(
    hatFilter(abfrage, 'eq', 'organization_id', ORG),
    'Ohne Org-Fence läse eine Organisation die Annahmestellen einer anderen — '
    + 'und lieferte ihre Abrechnung dorthin.',
  )
  assert.ok(hatFilter(abfrage, 'eq', 'kassenart', 'BK'))
  assert.ok(hatFilter(abfrage, 'eq', 'aktiv', true), 'Deaktivierte Stellen dürfen nicht gezogen werden.')
  assert.ok(hatFilter(abfrage, 'eq', 'bundesland', 'hessen'))
})

test('ohne Bundesland entfällt nur der Bundesland-Filter, nicht der Org-Fence', async () => {
  const fake = erstelleFakeSupabase(leer)
  await findeDatenannahmestelleAsync(fake.client, 'BKK VerbundPlus', null, ORG)

  const abfrage = fake.ersterAuf('datenannahmestellen')
  assert.equal(hatFilter(abfrage, 'eq', 'bundesland'), false)
  assert.ok(hatFilter(abfrage, 'eq', 'organization_id', ORG))
})

test('für JEDE bekannte Kassenart wird die Datenbank befragt, nicht nur für die AOK', async () => {
  // Das ist der Regressionstest zum Modulkopf: früher kam der DB-Weg nur bei
  // der AOK überhaupt zustande.
  const namen = ['Techniker Krankenkasse', 'BARMER', 'DAK-Gesundheit', 'IKK classic',
    'BKK VerbundPlus', 'KKH', 'hkk', 'Knappschaft', 'AOK Hessen']

  for (const name of namen) {
    const fake = erstelleFakeSupabase(leer)
    await findeDatenannahmestelleAsync(fake.client, name, 'hessen', ORG)
    assert.equal(
      fake.auf('datenannahmestellen').length, 1,
      `"${name}" hat keine DB-Abfrage ausgelöst — für diese Kassenart lässt sich `
      + 'keine abweichende Annahmestelle konfigurieren.',
    )
  }
})

test('ohne Organisation wird gar nicht erst in die Datenbank geschaut', async () => {
  const fake = erstelleFakeSupabase(leer)
  const stelle = await findeDatenannahmestelleAsync(fake.client, 'AOK Hessen', 'hessen', null)

  assert.equal(fake.auf('datenannahmestellen').length, 0)
  assert.equal(stelle?.ik, DATENANNAHMESTELLEN.aok_hessen.ik, 'Es bleibt beim hardcodierten Katalog.')
})

test('eine unbekannte Kasse löst keine Abfrage aus und liefert null', async () => {
  const fake = erstelleFakeSupabase(leer)
  const stelle = await findeDatenannahmestelleAsync(fake.client, 'Continentale Versicherung', 'hessen', ORG)

  assert.equal(fake.auf('datenannahmestellen').length, 0)
  assert.equal(
    stelle, null,
    'Kein stilles Routing zur AOK: eine Lieferung an die falsche Annahmestelle '
    + 'ist ein Abrechnungsfehler, kein Schönheitsfehler.',
  )
})

test('findet die Datenbank nichts, gilt der hardcodierte Katalog', async () => {
  const fake = erstelleFakeSupabase(leer)
  const stelle = await findeDatenannahmestelleAsync(fake.client, 'Techniker Krankenkasse', 'hessen', ORG)

  assert.equal(fake.auf('datenannahmestellen').length, 1)
  assert.deepEqual(stelle, DATENANNAHMESTELLEN.tk)
})

test('ein Datenbankfehler führt auf den Katalog zurück — aber nicht lautlos', async () => {
  const fake = erstelleFakeSupabase(() => ({
    data: null,
    error: { message: 'permission denied for table datenannahmestellen', code: '42501' },
  }))
  const stelle = await findeDatenannahmestelleAsync(fake.client, 'BARMER', 'hessen', ORG)

  assert.deepEqual(
    stelle, DATENANNAHMESTELLEN.barmer,
    'Der Abrechnungslauf darf an einer kaputten Abfrage nicht scheitern …',
  )
  // … und der Fehler muss protokolliert sein. Das prüft dieser Test nicht
  // direkt (der Logger schreibt nach stderr); die Zusicherung steht als
  // Kommentar in schluesselverzeichnis.ts. Was hier zählt: die Abfrage wurde
  // gestellt, das Ergebnis also nicht mit "nichts konfiguriert" verwechselt.
  assert.equal(fake.auf('datenannahmestellen').length, 1)
})

test('zwei Organisationen bekommen ihre jeweils eigene Annahmestelle', async () => {
  function fuerOrg(orgId: string) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      const gefragt = a.filter.find(f => f.methode === 'eq' && f.spalte === 'organization_id')?.wert
      if (gefragt === ORG) return { data: { ik_nummer: '660500345', name: 'Stelle A', zustaendig_fuer: 'BK' } }
      if (gefragt === FREMDE_ORG) return { data: { ik_nummer: '109905003', name: 'Stelle B', zustaendig_fuer: 'BK' } }
      return { data: null }
    })
  }

  const a = await findeDatenannahmestelleAsync(fuerOrg(ORG).client, 'BKK VerbundPlus', 'hessen', ORG)
  const b = await findeDatenannahmestelleAsync(fuerOrg(FREMDE_ORG).client, 'BKK VerbundPlus', 'hessen', FREMDE_ORG)

  assert.equal(a?.name, 'Stelle A')
  assert.equal(b?.name, 'Stelle B')
})

test('die synchrone und die asynchrone Variante stimmen ohne DB-Treffer überein', async () => {
  const fake = erstelleFakeSupabase(leer)
  for (const name of ['AOK Hessen', 'BARMER', 'IKK classic', 'Unbekannte Kasse e. V.']) {
    assert.deepEqual(
      await findeDatenannahmestelleAsync(fake.client, name, 'hessen', null),
      findeDatenannahmestelle(name),
      `"${name}": die beiden Wege dürfen ohne DB-Treffer nicht auseinanderlaufen.`,
    )
  }
})

// ═══════════════════════════════════════════════════════════════
// Kassenerkennung — Robustheit
// ═══════════════════════════════════════════════════════════════

test('Leerstring, Leerzeichen und fehlender Wert ergeben null', () => {
  assert.equal(erkenneKassenSchluessel(''), null)
  assert.equal(erkenneKassenSchluessel('   '), null)
  assert.equal(erkenneKassenSchluessel(undefined as unknown as string), null)
  assert.equal(erkenneKassenSchluessel(null as unknown as string), null)
})

test('Gross- und Kleinschreibung des Kassennamens spielt keine Rolle', () => {
  for (const schreibweise of ['BARMER', 'Barmer', 'barmer', 'BaRmEr']) {
    assert.equal(erkenneKassenSchluessel(schreibweise), 'barmer', schreibweise)
  }
})

test('"TK" wird nur als eigenständiges Wort erkannt', () => {
  assert.equal(erkenneKassenSchluessel('TK'), 'tk')
  assert.equal(erkenneKassenSchluessel('TK Hessen'), 'tk')
  assert.equal(erkenneKassenSchluessel('Techniker Krankenkasse'), 'tk')
  assert.equal(
    erkenneKassenSchluessel('Atkins Betreuung e. V.'), null,
    'Ein "tk" mitten im Wort darf keine Techniker Krankenkasse ergeben.',
  )
})

test('jeder erkannte Schlüssel hat einen Eintrag im Annahmestellen-Katalog', () => {
  const namen = ['Techniker Krankenkasse', 'BARMER', 'DAK-Gesundheit', 'HEK',
    'KKH Kaufmännische Krankenkasse', 'hkk', 'Knappschaft', 'IKK classic',
    'BKK VerbundPlus', 'AOK Hessen']

  for (const name of namen) {
    const schluessel = erkenneKassenSchluessel(name)
    assert.ok(schluessel, `"${name}" wurde nicht erkannt.`)
    assert.ok(
      DATENANNAHMESTELLEN[schluessel!],
      `Schlüssel "${schluessel}" hat keinen Katalogeintrag — findeDatenannahmestelle `
      + 'würde undefined statt null liefern und die Null-Prüfungen der Aufrufer umgehen.',
    )
  }
})

test('jede Kassenart im Katalog hat ein Label', () => {
  for (const [schluessel, stelle] of Object.entries(DATENANNAHMESTELLEN)) {
    assert.ok(
      KASSENART_LABEL[stelle.kassenart as Kassenart],
      `Kassenart "${stelle.kassenart}" (${schluessel}) hat kein Label.`,
    )
  }
})

// ═══════════════════════════════════════════════════════════════
// Tarifbereiche
// ═══════════════════════════════════════════════════════════════

test('alle 16 Bundesländer haben einen Tarifbereich', () => {
  assert.equal(
    Object.keys(TARIFBEREICH_JE_BUNDESLAND).length, 16,
    'Fehlt ein Land, bricht tarifkennzeichenFuerBundesland dort ab — das ist '
    + 'gewollt, muss aber bei einer Expansion auffallen.',
  )
})

test('kein Tarifbereich ist doppelt vergeben', () => {
  const werte = Object.values(TARIFBEREICH_JE_BUNDESLAND)
  assert.equal(
    new Set(werte).size, werte.length,
    'Zwei Länder mit demselben Tarifbereich hiesse: die Abrechnung läuft unter '
    + 'dem Landesvertrag des falschen Landes.',
  )
})

test('jeder Tarifbereich ist zweistellig numerisch', () => {
  for (const [land, bereich] of Object.entries(TARIFBEREICH_JE_BUNDESLAND)) {
    assert.match(bereich, /^\d{2}$/, `${land}: "${bereich}"`)
  }
})

test('Hessen ergibt genau die als Konstante hinterlegte Kennung', () => {
  assert.equal(tarifkennzeichenFuerBundesland('hessen'), TARIFKENNZEICHEN_HESSEN)
  assert.equal(TARIFKENNZEICHEN_HESSEN, '06000')
})

test('ein Sondertarif wird angehängt, nicht ersetzt', () => {
  assert.equal(tarifkennzeichenFuerBundesland('hessen', '001'), '06001')
  assert.equal(tarifkennzeichenFuerBundesland('bayern', '123'), '02123')
  assert.equal(
    tarifkennzeichenFuerBundesland('berlin', '000'), '23000',
    'Berlin trägt 23, nicht 03 — die Reihenfolge im Katalog ist nicht die Nummer.',
  )
})

test('ein zweistelliger oder alphanumerischer Sondertarif wird abgelehnt', () => {
  assert.throws(() => tarifkennzeichenFuerBundesland('hessen', '01'), /dreistellig/)
  assert.throws(() => tarifkennzeichenFuerBundesland('hessen', '0001'), /dreistellig/)
  assert.throws(() => tarifkennzeichenFuerBundesland('hessen', 'A01'), /dreistellig/)
  assert.throws(() => tarifkennzeichenFuerBundesland('hessen', ''), /dreistellig/)
})

test('ein Bundesland in falscher Schreibweise bricht ab, statt Hessen zu unterstellen', () => {
  assert.throws(() => tarifkennzeichenFuerBundesland('Hessen'), /Kein Tarifbereich/)
  assert.throws(() => tarifkennzeichenFuerBundesland('nordrhein-westfalen'), /Kein Tarifbereich/)
  assert.throws(() => tarifkennzeichenFuerBundesland(''), /Kein Tarifbereich/)
})

test('die Fehlermeldung nennt die erlaubten Bundesländer', () => {
  // Ohne die Liste sucht der Bearbeiter die Schreibweise im Quelltext.
  assert.throws(
    () => tarifkennzeichenFuerBundesland('Bayern'),
    (err: unknown) => err instanceof Error && err.message.includes('bayern') && err.message.includes('hessen'),
  )
})

// ═══════════════════════════════════════════════════════════════
// Ersatz-Beschäftigtennummern
// ═══════════════════════════════════════════════════════════════

test('die drei Ersatz-Beschäftigtennummern sind verschieden', () => {
  const werte = Object.values(ERSATZ_BESCHAEFTIGTENNUMMER)
  assert.equal(
    new Set(werte).size, werte.length,
    'Zwei gleiche Ersatznummern hiesse: der Grund für die fehlende Nummer ist '
    + 'aus dem ELS nicht mehr ablesbar.',
  )
})

test('keine Ersatznummer kollidiert mit einer echten Beschäftigtennummer', () => {
  for (const [grund, nummer] of Object.entries(ERSATZ_BESCHAEFTIGTENNUMMER)) {
    assert.match(nummer, /^99999999[6-8]$/, `${grund}: "${nummer}" liegt ausserhalb des reservierten Bereichs.`)
  }
})
