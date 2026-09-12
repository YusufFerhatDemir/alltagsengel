/**
 * Vergütungsaussagen in Kundentexten gegen die Konstante.
 * @see lib/pricing/quelle.ts
 *
 * ── WAS DIESER TEST PRÜFT UND WAS NICHT ───────────────────────────────
 * Er entscheidet **keinen Preis**. Er verlangt nur, dass jede live
 * ausgelieferte Aussage über unsere eigene Vergütung entweder zur
 * Konstante `ENGEL_HOURLY_RATE` passt oder in
 * `VERGUETUNG_ABWEICHUNGEN` benannt ist.
 *
 * Der Bestand vom 12.09.2026 (drei Abweichungen) ist damit eingefroren:
 * sichtbar, gezählt und mit Begründung — aber jede VIERTE macht den Lauf
 * rot. Das ist der Unterschied zwischen einem bekannten offenen Punkt und
 * einem unbemerkt wachsenden.
 *
 * ── WARUM DIE ZAHL NICHT AUS DEM TEXT GERECHNET WIRD ──────────────────
 * „14–18 €/Stunde bei Betreuungsdiensten" ist eine Aussage über den MARKT,
 * nicht über uns — und völlig zulässig. Ein Test, der jede Zahl neben dem
 * Wort „Stunde" anmahnt, würde solche Sätze verbieten und wäre nach dem
 * dritten Fehlalarm abgeschaltet. Deshalb zählt dieser Test Dateien, nicht
 * Sätze, und die Einordnung steht im Katalog.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PREISE_IM_CODE, PREISE_IN_DER_DB, preisImCode, VERGUETUNG_ABWEICHUNGEN,
} from '@/lib/pricing/quelle'
import { ENGEL_HOURLY_RATE, CUSTOMER_HOURLY_RATE } from '@/lib/pricing/b2c-constants'
import { ENTLASTUNG_MONATLICH_EUR } from '@/lib/config/budget-constants'

const WURZEL = join(__dirname, '..', '..')

/**
 * Aussagen über die EIGENE Vergütung. Verlangt die Nähe einer
 * Selbstbezeichnung („bei Alltagsengel", „Vergütung", „Gehalt", „verdienst
 * du") — eine reine Marktangabe trifft das nicht.
 */
// „bis" UND „und" gehören beide hinein: die FAQ schreibt „zwischen 15 und
// 25 € pro Stunde". Ohne das Wort „und" übersah das Muster genau die
// Stelle, an der eine Spanne als Zusage formuliert ist — aufgefallen, weil
// der Bestandstest zwei von drei Einträgen fand.
const SPANNE = String.raw`(\d{1,2})\s*(?:–|-|bis|und)\s*(\d{1,2})\s*€`
const EIGENE_VERGUETUNG = new RegExp(
  `(?:Vergütung|Gehalt|verdien\\w*|Stundenlohn|bei Alltagsengel)[^.]{0,80}?${SPANNE}`
  + `|${SPANNE}[^.]{0,60}?(?:pro Stunde|/Stunde|je Stunde)`,
  'i',
)

function dateienUnter(verzeichnis: string, endung = '.tsx'): string[] {
  const raus: string[] = []
  const lauf = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e.startsWith('.')) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) lauf(p)
      else if (p.endsWith(endung)) raus.push(p)
    }
  }
  lauf(join(WURZEL, verzeichnis))
  return raus
}

describe('Preiskatalog', () => {
  it('jeder Code-Preis nennt Besitzer, Einheit und Verbraucherrelevanz', () => {
    for (const p of PREISE_IM_CODE) {
      expect(p.was.length, p.key).toBeGreaterThan(15)
      expect(p.besitzer, p.key).toBe('code')
      expect(p.wert, p.key).not.toBeNull()
      expect(typeof p.wert, p.key).toBe('number')
    }
  })

  it('die Werte spiegeln die Konstanten, statt sie zu kopieren', () => {
    expect(preisImCode('engel_stunde')!.wert).toBe(ENGEL_HOURLY_RATE)
    expect(preisImCode('kunde_stunde_b2c')!.wert).toBe(CUSTOMER_HOURLY_RATE)
    expect(preisImCode('entlastung_monat')!.wert).toBe(ENTLASTUNG_MONATLICH_EUR)
  })

  it('Entlastungsbetrag ist 131 €, nie 125 €', () => {
    expect(preisImCode('entlastung_monat')!.wert).toBe(131)
  })

  it('DB-Preise sind als Wegweiser geführt, ohne gespiegelten Wert', () => {
    expect(PREISE_IN_DER_DB.length).toBeGreaterThanOrEqual(4)
    for (const p of PREISE_IN_DER_DB) {
      expect(p.besitzer, p.key).not.toBe('code')
      expect(p).not.toHaveProperty('wert')
    }
  })

  it('jede Preisart hat genau einen Besitzer — kein Wert an zwei Orten', () => {
    const keys = [...PREISE_IM_CODE.map(p => p.key), ...PREISE_IN_DER_DB.map(p => p.key)]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('Vergütungsaussagen in Kundentexten', () => {
  it('jede abweichende Datei ist benannt — eine neue macht den Lauf rot', () => {
    const gefunden: string[] = []
    for (const pfad of [...dateienUnter('app'), ...dateienUnter('components')]) {
      const rel = pfad.slice(WURZEL.length + 1)
      const inhalt = readFileSync(pfad, 'utf8')
      if (!EIGENE_VERGUETUNG.test(inhalt)) continue
      gefunden.push(rel)
    }
    const neu = gefunden.filter(d => !(d in VERGUETUNG_ABWEICHUNGEN))
    expect(
      neu,
      `Neue abweichende Vergütungsaussage(n): ${neu.join(', ')} — entweder auf ` +
      `${ENGEL_HOURLY_RATE} € bringen oder mit Begründung in VERGUETUNG_ABWEICHUNGEN aufnehmen.`,
    ).toEqual([])
  })

  it('der Bestand vom 12.09.2026 ist noch da — verschwindet er, gehört der Katalog gekürzt', () => {
    const vorhanden = Object.keys(VERGUETUNG_ABWEICHUNGEN).filter(d => {
      try { return EIGENE_VERGUETUNG.test(readFileSync(join(WURZEL, d), 'utf8')) } catch { return false }
    })
    expect(vorhanden.length, 'Behobene Abweichungen aus VERGUETUNG_ABWEICHUNGEN entfernen')
      .toBe(Object.keys(VERGUETUNG_ABWEICHUNGEN).length)
  })

  it('jede Abweichung ist begründet, nicht nur gelistet', () => {
    for (const [datei, grund] of Object.entries(VERGUETUNG_ABWEICHUNGEN)) {
      expect(grund.length, datei).toBeGreaterThan(40)
    }
  })

  it('Detektor: eine erfundene Datei mit Eigenaussage fällt auf', () => {
    const text = 'Bei Alltagsengel verdienst du 17–29 € pro Stunde.'
    expect(EIGENE_VERGUETUNG.test(text)).toBe(true)
  })

  it('Detektor: eine reine Marktangabe fällt NICHT auf', () => {
    const markt = '<li>Angestellt bei anderen Betreuungsdiensten: meist 14–18 € brutto.</li>'
    expect(EIGENE_VERGUETUNG.test(markt)).toBe(false)
  })
})
