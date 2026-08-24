// ═══════════════════════════════════════════════════════════════
// Welle 5n — Anforderungskatalog (DiPA-Zulassungsmatrix)
// ═══════════════════════════════════════════════════════════════
//
// 6 reine Funktionen + Konstanten-Integrität:
//   zeitklasseVon, antragsBlocker, katalogFortschritt,
//   katalogNachKategorie, katalogNachKlasse, internOffen
//
// Keine externen Abhängigkeiten — Datei hat ZERO imports.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  ANFORDERUNGSKATALOG,
  KATEGORIE_LABELS,
  STAND_LABELS,
  KLASSE_LABELS,
  ZEITKLASSE,
  ZEITKLASSE_LABELS,
  zeitklasseVon,
  antragsBlocker,
  katalogFortschritt,
  katalogNachKategorie,
  katalogNachKlasse,
  internOffen,
  type KatalogEintrag,
  type KatalogKategorie,
  type ErfuellungsStand,
  type Bearbeitungsklasse,
} from '../coach/anforderungskatalog'

// ---------------------------------------------------------------------------
// Fixtures — kleine synthetische Kataloge für Unit-Tests
// ---------------------------------------------------------------------------

const eintrag = (
  overrides: Partial<KatalogEintrag> & Pick<KatalogEintrag, 'id'>
): KatalogEintrag => ({
  kategorie: 'datenschutz',
  formulierung: 'Test',
  quelle: 'Test',
  anforderungstextGeprueft: true,
  stand: 'offen',
  klasse: 'A',
  nachweis: null,
  nachweisDateien: [],
  gapId: null,
  verantwortlich: 'technik',
  ...overrides,
})

const MINI_KATALOG: KatalogEintrag[] = [
  eintrag({ id: 'T-01', klasse: 'A', stand: 'erfuellt', kategorie: 'datenschutz' }),
  eintrag({ id: 'T-02', klasse: 'B', stand: 'in_arbeit', kategorie: 'datenschutz' }),
  eintrag({ id: 'T-03', klasse: 'C', stand: 'offen', kategorie: 'datensicherheit' }),
  eintrag({ id: 'T-04', klasse: 'D', stand: 'offen', kategorie: 'interoperabilitaet' }),
  eintrag({ id: 'T-05', klasse: 'E', stand: 'nicht_anwendbar', kategorie: 'barrierefreiheit' }),
  eintrag({ id: 'T-06', klasse: 'A', stand: 'offen', kategorie: 'datenschutz', anforderungstextGeprueft: false }),
]

// ---------------------------------------------------------------------------
// Konstanten-Integrität
// ---------------------------------------------------------------------------

describe('ANFORDERUNGSKATALOG — Struktur', () => {
  test('enthält 48 Einträge', () => {
    assert.equal(ANFORDERUNGSKATALOG.length, 48)
  })

  test('alle IDs sind eindeutig', () => {
    const ids = ANFORDERUNGSKATALOG.map(e => e.id)
    assert.equal(new Set(ids).size, ids.length, 'Doppelte IDs gefunden')
  })

  test('alle IDs beginnen mit AK-', () => {
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(e.id.startsWith('AK-'), `ID "${e.id}" beginnt nicht mit AK-`)
    }
  })

  test('jede Kategorie ist in KATEGORIE_LABELS definiert', () => {
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(e.kategorie in KATEGORIE_LABELS, `Kategorie "${e.kategorie}" nicht in Labels`)
    }
  })

  test('jeder Stand ist gültig', () => {
    const gueltig: ErfuellungsStand[] = ['offen', 'in_arbeit', 'erfuellt', 'nicht_anwendbar']
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(gueltig.includes(e.stand), `Stand "${e.stand}" ungültig bei ${e.id}`)
    }
  })

  test('jede Klasse ist gültig', () => {
    const gueltig: Bearbeitungsklasse[] = ['A', 'B', 'C', 'D', 'E']
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(gueltig.includes(e.klasse), `Klasse "${e.klasse}" ungültig bei ${e.id}`)
    }
  })

  test('alle haben eine Formulierung', () => {
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(e.formulierung.length > 0, `Formulierung leer bei ${e.id}`)
    }
  })

  test('alle haben eine Quelle', () => {
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(e.quelle.length > 0, `Quelle leer bei ${e.id}`)
    }
  })

  test('nachweisDateien ist immer ein Array', () => {
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(Array.isArray(e.nachweisDateien), `nachweisDateien kein Array bei ${e.id}`)
    }
  })

  test('verantwortlich ist einer der vier gültigen Werte', () => {
    const gueltig = ['technik', 'fachlich', 'extern', 'geschaeftsfuehrung']
    for (const e of ANFORDERUNGSKATALOG) {
      assert.ok(gueltig.includes(e.verantwortlich), `verantwortlich "${e.verantwortlich}" ungültig bei ${e.id}`)
    }
  })
})

describe('KATEGORIE_LABELS', () => {
  test('10 Kategorien definiert', () => {
    assert.equal(Object.keys(KATEGORIE_LABELS).length, 10)
  })

  test('alle Labels sind nicht-leer', () => {
    for (const [k, v] of Object.entries(KATEGORIE_LABELS)) {
      assert.ok(v.length > 0, `Label leer für ${k}`)
    }
  })
})

describe('STAND_LABELS', () => {
  test('4 Stände definiert', () => {
    assert.equal(Object.keys(STAND_LABELS).length, 4)
  })

  test('enthält alle gültigen Stände', () => {
    assert.ok('offen' in STAND_LABELS)
    assert.ok('in_arbeit' in STAND_LABELS)
    assert.ok('erfuellt' in STAND_LABELS)
    assert.ok('nicht_anwendbar' in STAND_LABELS)
  })
})

describe('KLASSE_LABELS', () => {
  test('5 Klassen definiert', () => {
    assert.equal(Object.keys(KLASSE_LABELS).length, 5)
  })

  test('enthält A bis E', () => {
    for (const k of ['A', 'B', 'C', 'D', 'E']) {
      assert.ok(k in KLASSE_LABELS, `Klasse ${k} fehlt`)
    }
  })
})

describe('ZEITKLASSE', () => {
  test('alle Werte sind gültige Zeitklassen', () => {
    const gueltig = ['A', 'B', 'C', 'D', 'E']
    for (const [id, klasse] of Object.entries(ZEITKLASSE)) {
      assert.ok(gueltig.includes(klasse), `ZEITKLASSE[${id}] = "${klasse}" ungültig`)
    }
  })

  test('alle Schlüssel sind echte Katalog-IDs', () => {
    const ids = new Set(ANFORDERUNGSKATALOG.map(e => e.id))
    for (const id of Object.keys(ZEITKLASSE)) {
      assert.ok(ids.has(id), `ZEITKLASSE enthält unbekannte ID "${id}"`)
    }
  })

  test('enthält mindestens die drei Eingangsblocker', () => {
    assert.equal(ZEITKLASSE['AK-SEC-01'], 'A')
    assert.equal(ZEITKLASSE['AK-SEC-05'], 'A')
    assert.equal(ZEITKLASSE['AK-NN-01'], 'A')
  })
})

describe('ZEITKLASSE_LABELS', () => {
  test('5 Labels definiert', () => {
    assert.equal(Object.keys(ZEITKLASSE_LABELS).length, 5)
  })

  test('A bis E sind alle vorhanden', () => {
    for (const k of ['A', 'B', 'C', 'D', 'E']) {
      assert.ok(k in ZEITKLASSE_LABELS, `Zeitklasse-Label ${k} fehlt`)
    }
  })
})

// ---------------------------------------------------------------------------
// zeitklasseVon
// ---------------------------------------------------------------------------

describe('zeitklasseVon', () => {
  test('bekannte ID → Zeitklasse', () => {
    assert.equal(zeitklasseVon('AK-SEC-01'), 'A')
  })

  test('REG-04 → D', () => {
    assert.equal(zeitklasseVon('AK-REG-04'), 'D')
  })

  test('REG-05 → E', () => {
    assert.equal(zeitklasseVon('AK-REG-05'), 'E')
  })

  test('unbekannte ID → null', () => {
    assert.equal(zeitklasseVon('FANTASIE-99'), null)
  })

  test('leerer String → null', () => {
    assert.equal(zeitklasseVon(''), null)
  })

  test('ID ohne Zeitklasse (z.B. PROD-01) → null', () => {
    // AK-PROD-01 hat keine Zeitklasse-Zuordnung
    assert.equal(zeitklasseVon('AK-PROD-01'), null)
  })
})

// ---------------------------------------------------------------------------
// antragsBlocker
// ---------------------------------------------------------------------------

describe('antragsBlocker', () => {
  test('Default: liefert nur Einträge mit Zeitklasse A die nicht erfüllt sind', () => {
    const blocker = antragsBlocker()
    for (const b of blocker) {
      assert.equal(ZEITKLASSE[b.id], 'A', `${b.id} hat keine Zeitklasse A`)
      assert.notEqual(b.stand, 'erfuellt', `${b.id} ist erfuellt, sollte kein Blocker sein`)
      assert.notEqual(b.stand, 'nicht_anwendbar', `${b.id} ist nicht_anwendbar`)
    }
  })

  test('Blocker-Anzahl > 0 (es gibt offene Punkte im Katalog)', () => {
    const blocker = antragsBlocker()
    assert.ok(blocker.length > 0, 'Es sollte noch offene Blocker geben')
  })

  test('benutzerdefinierter Katalog: nur Zeitklasse-A-Einträge', () => {
    // T-06 hat Klasse A und Stand offen → Blocker
    // T-01 hat Klasse A aber stand erfuellt → kein Blocker
    // Für ZEITKLASSE muss die ID im echten ZEITKLASSE-Record stehen
    // Da T-06 nicht im echten ZEITKLASSE steht, wird es nicht als Blocker erkannt
    const custom: KatalogEintrag[] = [
      eintrag({ id: 'AK-SEC-01', klasse: 'D', stand: 'offen' }),  // Zeitklasse A, offen → Blocker
      eintrag({ id: 'AK-SEC-01', klasse: 'D', stand: 'erfuellt' }), // Zeitklasse A, erfuellt → kein Blocker
    ]
    // Nur der erste sollte Blocker sein — aber IDs sind gleich, also filter nach stand
    const blocker = antragsBlocker(custom)
    assert.equal(blocker.length, 1)
    assert.equal(blocker[0].stand, 'offen')
  })

  test('alle erfüllt → leere Liste', () => {
    const alle_ok: KatalogEintrag[] = [
      eintrag({ id: 'AK-SEC-01', stand: 'erfuellt' }),
      eintrag({ id: 'AK-SEC-05', stand: 'erfuellt' }),
      eintrag({ id: 'AK-NN-01', stand: 'nicht_anwendbar' }),
    ]
    assert.equal(antragsBlocker(alle_ok).length, 0)
  })

  test('leerer Katalog → leere Liste', () => {
    assert.equal(antragsBlocker([]).length, 0)
  })
})

// ---------------------------------------------------------------------------
// katalogFortschritt
// ---------------------------------------------------------------------------

describe('katalogFortschritt', () => {
  test('Default: gesamt = 48', () => {
    const f = katalogFortschritt()
    assert.equal(f.gesamt, 48)
  })

  test('Summe der Stände = gesamt', () => {
    const f = katalogFortschritt()
    assert.equal(f.erfuellt + f.inArbeit + f.offen + f.nichtAnwendbar, f.gesamt)
  })

  test('quote ist zwischen 0 und 1', () => {
    const f = katalogFortschritt()
    assert.ok(f.quote >= 0 && f.quote <= 1, `quote=${f.quote} außerhalb [0,1]`)
  })

  test('Mini-Katalog: korrekte Zählung', () => {
    const f = katalogFortschritt(MINI_KATALOG)
    assert.equal(f.gesamt, 6)
    assert.equal(f.erfuellt, 1)   // T-01
    assert.equal(f.inArbeit, 1)   // T-02
    assert.equal(f.offen, 3)      // T-03, T-04, T-06
    assert.equal(f.nichtAnwendbar, 1) // T-05
  })

  test('ungeprueft: Einträge mit anforderungstextGeprueft=false', () => {
    const f = katalogFortschritt(MINI_KATALOG)
    assert.equal(f.ungeprueft, 1) // T-06
  })

  test('quote: nur geprüfte erfüllte zählen, ohne nicht_anwendbar', () => {
    // relevant = 5 (alle außer T-05)
    // geprüft + erfüllt = 1 (T-01, weil T-06 ist ungeprüft)
    // quote = 1/5 = 0.2
    const f = katalogFortschritt(MINI_KATALOG)
    assert.equal(f.quote, 0.2)
  })

  test('leerer Katalog → quote = 0', () => {
    const f = katalogFortschritt([])
    assert.equal(f.quote, 0)
    assert.equal(f.gesamt, 0)
  })

  test('alle nicht_anwendbar → quote = 0 (kein Division-by-Zero)', () => {
    const alle_na: KatalogEintrag[] = [
      eintrag({ id: 'X-1', stand: 'nicht_anwendbar' }),
      eintrag({ id: 'X-2', stand: 'nicht_anwendbar' }),
    ]
    const f = katalogFortschritt(alle_na)
    assert.equal(f.quote, 0)
  })

  test('alle erfüllt + geprüft → quote = 1', () => {
    const alle_ok: KatalogEintrag[] = [
      eintrag({ id: 'X-1', stand: 'erfuellt', anforderungstextGeprueft: true }),
      eintrag({ id: 'X-2', stand: 'erfuellt', anforderungstextGeprueft: true }),
    ]
    const f = katalogFortschritt(alle_ok)
    assert.equal(f.quote, 1)
  })

  test('erfüllt aber NICHT geprüft → zählt NICHT für quote', () => {
    const trügerisch: KatalogEintrag[] = [
      eintrag({ id: 'X-1', stand: 'erfuellt', anforderungstextGeprueft: false }),
    ]
    const f = katalogFortschritt(trügerisch)
    assert.equal(f.erfuellt, 1) // gezählt als erfüllt
    assert.equal(f.quote, 0)    // aber NICHT in der Quote
  })
})

// ---------------------------------------------------------------------------
// katalogNachKategorie
// ---------------------------------------------------------------------------

describe('katalogNachKategorie', () => {
  test('Default: gruppiert alle 10 Kategorien', () => {
    const gruppen = katalogNachKategorie()
    const kategorien = gruppen.map(g => g.kategorie)
    assert.ok(kategorien.length >= 10, `Nur ${kategorien.length} Kategorien`)
  })

  test('jede Gruppe hat mindestens einen Eintrag', () => {
    for (const g of katalogNachKategorie()) {
      assert.ok(g.eintraege.length > 0, `Kategorie ${g.kategorie} ist leer`)
    }
  })

  test('Summe aller Gruppen-Einträge = 48', () => {
    const summe = katalogNachKategorie().reduce((s, g) => s + g.eintraege.length, 0)
    assert.equal(summe, 48)
  })

  test('Mini-Katalog: 3 Gruppen (datenschutz, datensicherheit, interoperabilitaet + barrierefreiheit)', () => {
    const gruppen = katalogNachKategorie(MINI_KATALOG)
    assert.equal(gruppen.length, 4)
  })

  test('datenschutz-Gruppe enthält 3 Einträge im Mini-Katalog', () => {
    const gruppen = katalogNachKategorie(MINI_KATALOG)
    const ds = gruppen.find(g => g.kategorie === 'datenschutz')
    assert.ok(ds)
    assert.equal(ds.eintraege.length, 3) // T-01, T-02, T-06
  })

  test('leerer Katalog → leere Liste', () => {
    assert.equal(katalogNachKategorie([]).length, 0)
  })

  test('Reihenfolge folgt KATEGORIE_LABELS', () => {
    const gruppen = katalogNachKategorie()
    const labelKeys = Object.keys(KATEGORIE_LABELS) as KatalogKategorie[]
    const gruppenKeys = gruppen.map(g => g.kategorie)
    // Jede Gruppe sollte in der KATEGORIE_LABELS-Reihenfolge erscheinen
    let lastIdx = -1
    for (const k of gruppenKeys) {
      const idx = labelKeys.indexOf(k)
      assert.ok(idx > lastIdx, `${k} ist nicht in aufsteigender Labels-Reihenfolge`)
      lastIdx = idx
    }
  })
})

// ---------------------------------------------------------------------------
// katalogNachKlasse
// ---------------------------------------------------------------------------

describe('katalogNachKlasse', () => {
  test('Default: alle 5 Klassen A–E vorhanden', () => {
    const result = katalogNachKlasse()
    for (const k of ['A', 'B', 'C', 'D', 'E'] as Bearbeitungsklasse[]) {
      assert.ok(k in result, `Klasse ${k} fehlt`)
    }
  })

  test('Summe aller gesamt = 48', () => {
    const result = katalogNachKlasse()
    const summe = Object.values(result).reduce((s, v) => s + v.gesamt, 0)
    assert.equal(summe, 48)
  })

  test('offen ≤ gesamt für jede Klasse', () => {
    const result = katalogNachKlasse()
    for (const [k, v] of Object.entries(result)) {
      assert.ok(v.offen <= v.gesamt, `Klasse ${k}: offen (${v.offen}) > gesamt (${v.gesamt})`)
    }
  })

  test('Mini-Katalog: korrekte Verteilung', () => {
    const result = katalogNachKlasse(MINI_KATALOG)
    // A: T-01 (erfuellt), T-06 (offen) → gesamt=2, offen=1
    assert.equal(result.A.gesamt, 2)
    assert.equal(result.A.offen, 1)
    // B: T-02 (in_arbeit) → gesamt=1, offen=1
    assert.equal(result.B.gesamt, 1)
    assert.equal(result.B.offen, 1)
    // C: T-03 (offen) → gesamt=1, offen=1
    assert.equal(result.C.gesamt, 1)
    assert.equal(result.C.offen, 1)
    // D: T-04 (offen) → gesamt=1, offen=1
    assert.equal(result.D.gesamt, 1)
    assert.equal(result.D.offen, 1)
    // E: T-05 (nicht_anwendbar) → gesamt=1, offen=0
    assert.equal(result.E.gesamt, 1)
    assert.equal(result.E.offen, 0)
  })

  test('leerer Katalog → alle Klassen mit 0/0', () => {
    const result = katalogNachKlasse([])
    for (const k of ['A', 'B', 'C', 'D', 'E'] as Bearbeitungsklasse[]) {
      assert.equal(result[k].gesamt, 0)
      assert.equal(result[k].offen, 0)
    }
  })
})

// ---------------------------------------------------------------------------
// internOffen
// ---------------------------------------------------------------------------

describe('internOffen', () => {
  test('Default: nur Klassen A/B/C, nicht erfüllt', () => {
    const offen = internOffen()
    for (const e of offen) {
      assert.ok(['A', 'B', 'C'].includes(e.klasse), `${e.id} hat Klasse ${e.klasse}`)
      assert.notEqual(e.stand, 'erfuellt')
      assert.notEqual(e.stand, 'nicht_anwendbar')
    }
  })

  test('keine D- oder E-Einträge', () => {
    const offen = internOffen()
    const deEintraege = offen.filter(e => e.klasse === 'D' || e.klasse === 'E')
    assert.equal(deEintraege.length, 0, 'D/E-Einträge in internOffen gefunden')
  })

  test('Mini-Katalog: T-02, T-03, T-06 (A/B/C + nicht erfüllt)', () => {
    const offen = internOffen(MINI_KATALOG)
    const ids = offen.map(e => e.id).sort()
    assert.deepEqual(ids, ['T-02', 'T-03', 'T-06'])
  })

  test('T-01 (erfüllt) und T-04 (Klasse D) und T-05 (nicht_anwendbar) nicht enthalten', () => {
    const offen = internOffen(MINI_KATALOG)
    const ids = new Set(offen.map(e => e.id))
    assert.ok(!ids.has('T-01'), 'T-01 (erfüllt) sollte nicht enthalten sein')
    assert.ok(!ids.has('T-04'), 'T-04 (Klasse D) sollte nicht enthalten sein')
    assert.ok(!ids.has('T-05'), 'T-05 (nicht_anwendbar) sollte nicht enthalten sein')
  })

  test('leerer Katalog → leere Liste', () => {
    assert.equal(internOffen([]).length, 0)
  })

  test('alle erfüllt → leere Liste', () => {
    const alle_ok: KatalogEintrag[] = [
      eintrag({ id: 'X-1', klasse: 'A', stand: 'erfuellt' }),
      eintrag({ id: 'X-2', klasse: 'B', stand: 'erfuellt' }),
      eintrag({ id: 'X-3', klasse: 'C', stand: 'nicht_anwendbar' }),
    ]
    assert.equal(internOffen(alle_ok).length, 0)
  })
})
