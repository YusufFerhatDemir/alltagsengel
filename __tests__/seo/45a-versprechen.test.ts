/**
 * Keine falschen Versprechen vor der § 45a-Anerkennung.
 *
 * Alltagsengel befindet sich im Anerkennungsverfahren nach § 45a SGB XI und
 * kann den Entlastungsbetrag (131 €/Monat, § 45b) NICHT mit der Pflegekasse
 * abrechnen. Bis 11.09.2026 versprachen rund 45 Seiten, Mails und der
 * Beratungs-Chat genau das („wir rechnen direkt mit Ihrer Pflegekasse ab",
 * „0 € Eigenanteil", „in Hessen zugelassen").
 *
 * Geprüft wird das GERENDERTE Ergebnis — sichtbarer Text und JSON-LD —,
 * und zwar SATZWEISE: Ein Satz, der vom Entlastungsbetrag oder der
 * Alltagsbegleitung spricht, darf keine Kassenabrechnung und keinen
 * 0-€-Eigenanteil zusagen. Sätze zur Pflegebox (§ 40) oder zu
 * Krankenfahrten (§ 60) sind davon nicht betroffen und bleiben erlaubt.
 */
import { describe, it, expect, vi } from 'vitest'
import { SEITEN, saetze, rendere } from './_seiten'

vi.mock('@/components/LeadForm', () => ({ default: () => null }))
vi.mock('@/components/EngelBewerbungForm', () => ({ default: () => null }))
vi.mock('@/components/VisitTracker', () => ({ default: () => null }))

/** Satz handelt vom Entlastungsbetrag / der Alltagsbegleitung bei Alltagsengel. */
const THEMA = /Entlastungsbetrag|§ ?45b|Alltagsbegleitung|Alltagshilfe|Haushaltshilfe|Betreuung|Begleitung/i
/** Satz handelt (auch) von Pflegebox/Krankenfahrt — eigene Rechtsgrundlage, hier nicht geprüft. */
const ANDERES = /Pflege-?[Bb]ox|Pflegehilfsmittel|§ ?40|42 ?€|Krankenfahrt|§ ?60|Fahrdienst|Verhinderungspflege|§ ?39/i

/** Zusagen, die ohne Anerkennung falsch sind. */
const ZUSAGEN: RegExp[] = [
  /(wir|Alltagsengel|AlltagsEngel)\s+(übernimmt|übernehmen|rechnet|rechnen)[^.]{0,80}(Pflege)?[Kk]asse/,
  /(rechnet|rechnen)\s+(wir|Alltagsengel)[^.]{0,60}(Pflege)?[Kk]asse/,
  /Abrechnung[^.]{0,40}übernehmen wir|übernehmen wir[^.]{0,30}Abrechnung/i,
  /direkt[^.]{0,70}(Pflege)?[Kk]asse abgerechnet|abgerechnet[^.]{0,20}direkt mit (der|Ihrer) (Pflege)?[Kk]asse/i,
  /Abrechnung (erfolgt|läuft) (direkt|automatisch)[^.]{0,40}(Entlastungsbetrag|Pflegekasse|Kasse)/i,
  /nichts aus eigener Tasche|Sie zahlen (nichts|0 ?€|keinen Cent)/i,
  /(0 ?€|0 Euro) Eigenanteil|Eigenanteil:? ?(0 ?€|0 Euro)|kein(en)? Eigenanteil/i,
  /ohne (eigene )?Zuzahlung/i,
  /(faktisch|de facto|komplett|völlig|in der Regel) (kostenlos|kostenfrei|gratis)/i,
  /anerkannte[rn]? Anbieter(s)? wie Alltagsengel/i,
  /Alltagsengel[^.]{0,40}(zugelassen|zertifiziert nach|nach § ?45a[^.]{0,20}(anerkannt|zertifiziert))/i,
  /nach § ?45a (SGB XI )?zertifiziert/i,
  /(vollständig|komplett) von der Pflegekasse (finanziert|bezahlt|übernommen)/i,
  /(€|Euro)\s?\/?\s?Monat[^.]{0,10}über (den )?Entlastungsbetrag[^.]{0,30}abrechenbar/i,
]

/** Zusage mit ausdrücklichem Vorbehalt der Anerkennung ist zulässig. */
const VORBEHALT = /Anerkennung|Anerkennungsverfahren|im Verfahren|nach der Anerkennung|freigeschaltet/i

/**
 * Thema über ein Fenster aus Vorsatz, Satz und Folgesatz: „Für Personen
 * mit Pflegegrad ist Alltagsengel komplett kostenlos." nennt das Thema
 * nicht selbst, der Satz davor schon.
 */
function befunde(alle: string[]): string[] {
  return alle.filter((s, i) => {
    if (!ZUSAGEN.some(re => re.test(s))) return false
    if (ANDERES.test(s) || VORBEHALT.test(s)) return false
    const fenster = [alle[i - 1], s, alle[i + 1]].filter(Boolean).join(' ')
    return THEMA.test(fenster)
  })
}

// ── Gegenprobe: der Detektor selbst ─────────────────────────────────────
// Ein Test, der nichts findet, beweist nur etwas, wenn er Falsches FINDEN
// würde. Die Sätze unten standen bis 11.09.2026 wörtlich auf der Seite.
describe('Detektor', () => {
  it.each([
    ['Für Personen mit Pflegegrad ist Alltagsbegleitung über Alltagsengel ohne eigene Zuzahlung möglich.'],
    ['Die Kosten werden direkt über den Entlastungsbetrag (§ 45b, 131 €/Monat) mit der Pflegekasse abgerechnet.'],
    ['Die Abrechnung erfolgt direkt über den Entlastungsbetrag (§ 45b SGB XI) — 131 € pro Monat von der Pflegekasse.'],
    ['Alltagsengel ist in Hessen zugelassen und rechnet direkt mit Ihrer Pflegekasse ab.'],
    ['Wir rechnen direkt mit der Pflegekasse ab, 0 € Eigenanteil.'],
    ['Alle Alltagsengel-Begleiter sind nach § 45a zertifiziert; die 131 € Entlastungsbetrag rechnen wir direkt mit Ihrer Pflegekasse ab.'],
    ['Die Abrechnung über §45b übernehmen wir komplett.'],
    ['Wählen Sie einen anerkannten Anbieter wie Alltagsengel für Ihre Alltagsbegleitung.'],
    ['131€/Monat über Entlastungsbetrag §45b SGB XI abrechenbar'],
  ])('fängt: %s', (satz) => {
    expect(befunde(['Alltagsbegleitung bei Alltagsengel.', satz])).toEqual([satz])
  })

  it('fängt über den Nachbarsatz: „Alltagsengel ist komplett kostenlos."', () => {
    const alle = ['Was kostet die Alltagsbegleitung?', 'Für Personen mit Pflegegrad ist Alltagsengel in der Regel komplett kostenlos.']
    expect(befunde(alle)).toHaveLength(1)
  })

  it.each([
    ['Pflegebox: bis 42 € pro Monat von der Pflegekasse, 0 € Eigenanteil (§ 40 SGB XI).'],
    ['Bei einer Abtretungserklärung rechnet der anerkannte Anbieter direkt mit der Pflegekasse ab.'],
    ['Ob er eingesetzt werden kann, setzt die Anerkennung nach § 45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungsverfahren.'],
    ['Die Beratung zur Alltagsbegleitung ist kostenlos.'],
  ])('lässt stehen: %s', (satz) => {
    expect(befunde(['Alltagsbegleitung bei Alltagsengel.', satz])).toEqual([])
  })
})

describe.each(Object.keys(SEITEN))('%s', (pfad) => {
  it('verspricht keine Kassenabrechnung / keinen 0-€-Eigenanteil für die Alltagsbegleitung', async () => {
    const gefunden = befunde(saetze(await rendere(SEITEN[pfad])))
    expect(gefunden, `${pfad}:\n  ${gefunden.join('\n  ')}`).toEqual([])
  })

  it('nennt 131 €, nie 125 € als aktuellen Entlastungsbetrag', async () => {
    const html = await rendere(SEITEN[pfad])
    const falsch = saetze(html).filter(s => /125 ?(€|Euro)/.test(s) && !/(zuvor|vorher|alt|veraltet|bis 2024|angehoben|erhöht|von 125)/i.test(s))
    expect(falsch, `${pfad}:\n  ${falsch.join('\n  ')}`).toEqual([])
  })
})
