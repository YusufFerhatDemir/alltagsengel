// ═══════════════════════════════════════════════════════════════
// TOURVORLAGE ↔ WOCHENTAG
// ═══════════════════════════════════════════════════════════════
//
// tour_templates.weekday zaehlt nach ISO-8601 (Mo=1 … So=7) — so
// validiert es POST /api/tours/templates. Date#getDay() zaehlt ANDERS
// (So=0 … Sa=6). Genau ein Tag Versatz an genau einem Wochentag ist die
// Sorte Fehler, die keine Stichprobe findet: sechs von sieben Tagen
// stimmen, und der siebte meldet die falsche Vorlage als passend.
//
// Blockiert wird nie: eine Montagstour am Mittwoch nachzuholen ist ein
// zulaessiger Vorgang. Die Warnung ist der einzige Ort, an dem eine
// versehentlich auf den falschen Tag gelegte Vorlage sichtbar wird —
// sie erzeugt sonst eine vollstaendige Tour mit allen Klienten am
// falschen Datum.
import { describe, it, expect } from 'vitest'
import { isoWochentag, wochentagName, vorlagenWochentagWarnung } from '@/lib/touren/planung'

describe('isoWochentag', () => {
  // Feste Woche mit bekannten Wochentagen: 24.08.2026 ist ein Montag.
  it('zaehlt Montag=1 bis Sonntag=7 ueber eine volle Woche', () => {
    expect(isoWochentag('2026-08-24')).toBe(1) // Montag
    expect(isoWochentag('2026-08-25')).toBe(2)
    expect(isoWochentag('2026-08-26')).toBe(3)
    expect(isoWochentag('2026-08-27')).toBe(4)
    expect(isoWochentag('2026-08-28')).toBe(5)
    expect(isoWochentag('2026-08-29')).toBe(6) // Samstag
    expect(isoWochentag('2026-08-30')).toBe(7) // Sonntag — NICHT 0
  })

  // Der eigentliche Grund fuer die eigene Funktion: getDay() liefert fuer
  // Sonntag 0. Ungewandelt waere 0 !== weekday fuer JEDE Vorlage wahr —
  // eine Sonntagsvorlage haette an ihrem eigenen Tag gewarnt.
  it('gibt fuer Sonntag 7 und niemals 0 zurueck', () => {
    for (const iso of ['2026-08-30', '2026-09-06', '2027-01-03']) {
      expect(isoWochentag(iso)).not.toBe(0)
    }
    expect(isoWochentag('2027-01-03')).toBe(7)
  })

  it('weist unbrauchbare Datumsangaben mit null ab statt zu raten', () => {
    expect(isoWochentag('')).toBeNull()
    expect(isoWochentag('30.08.2026')).toBeNull()
    expect(isoWochentag('2026-8-30')).toBeNull()
    // Formal richtig geformt, aber kein existierender Tag: Date ergibt hier
    // Invalid Date. Ohne den NaN-Riegel entstuende eine Warnung mit
    // erfundenem Wochentag.
    expect(isoWochentag('2026-02-30')).toBeNull()
    expect(isoWochentag('2026-13-01')).toBeNull()
    expect(isoWochentag(null as unknown as string)).toBeNull()
    expect(isoWochentag(undefined as unknown as string)).toBeNull()
  })

  it('faellt nicht auf den stillen Kalender-Ueberlauf herein', () => {
    // BEIM SCHREIBEN DIESES TESTS GEFUNDEN: die erste Fassung von
    // isoWochentag verliess sich auf einen NaN-Riegel. Der greift hier NICHT
    // — new Date('2026-02-30T00:00:00') ist kein Invalid Date, JavaScript
    // rollt auf den 2. Maerz weiter (ein Montag). Die Funktion meldete also
    // „Montag" fuer einen Tag, den es nicht gibt: genau der erfundene
    // Wochentag, den der Riegel verhindern sollte.
    expect(new Date('2026-02-30T00:00:00').getDate()).toBe(2) // der Ueberlauf selbst
    expect(isoWochentag('2026-02-30')).toBeNull()             // und dass er abgewiesen wird
    expect(isoWochentag('2026-04-31')).toBeNull()
    expect(isoWochentag('2027-02-29')).toBeNull()             // 2027 ist kein Schaltjahr
    expect(isoWochentag('2028-02-29')).toBe(2)                // 2028 schon — Dienstag
  })

  it('haengt nicht an der Zeitzonen-Auslegung des kurzen Datumsformats', () => {
    // new Date('2026-08-30') waere UTC-Mitternacht; westlich von UTC faellt
    // getDay() dort auf den Vortag. Der Ortszeit-Parse muss davon frei sein.
    const perOrtszeit = new Date('2026-08-30T00:00:00').getDay()
    expect(isoWochentag('2026-08-30')).toBe(perOrtszeit === 0 ? 7 : perOrtszeit)
    expect(isoWochentag('2026-08-30')).toBe(7)
  })
})

describe('wochentagName', () => {
  it('benennt 1 bis 7', () => {
    expect(wochentagName(1)).toBe('Montag')
    expect(wochentagName(5)).toBe('Freitag')
    expect(wochentagName(7)).toBe('Sonntag')
  })

  it('gibt fuer alles ausserhalb von 1..7 null zurueck', () => {
    // 0 ist der getDay()-Sonntag und in dieser Zaehlung KEIN gueltiger Wert —
    // waere er es, verdeckte er den Zaehlfehler, den diese Datei absichert.
    expect(wochentagName(0)).toBeNull()
    expect(wochentagName(8)).toBeNull()
    expect(wochentagName(-1)).toBeNull()
    expect(wochentagName(3.5)).toBeNull()
    expect(wochentagName(null)).toBeNull()
    expect(wochentagName(undefined)).toBeNull()
    expect(wochentagName(NaN)).toBeNull()
  })
})

describe('vorlagenWochentagWarnung', () => {
  it('schweigt, wenn der Wochentag passt', () => {
    expect(vorlagenWochentagWarnung(1, '2026-08-24')).toBeNull() // Montag auf Montag
    expect(vorlagenWochentagWarnung(7, '2026-08-30')).toBeNull() // Sonntag auf Sonntag
  })

  it('warnt bei Abweichung und benennt BEIDE Tage', () => {
    const w = vorlagenWochentagWarnung(1, '2026-08-26') // Montagsvorlage, Mittwoch
    expect(w).not.toBeNull()
    expect(w).toContain('Montag')
    expect(w).toContain('Mittwoch')
  })

  it('schweigt, wenn die Vorlage gar keinen Wochentag hinterlegt hat', () => {
    // Eine Vorlage ohne Wochentag ist an jedem Tag richtig — hier zu warnen
    // waere ein Dauerhinweis ohne Aussage, den man nach dem dritten Mal
    // wegklickt, mitsamt den echten Warnungen daneben.
    expect(vorlagenWochentagWarnung(null, '2026-08-26')).toBeNull()
    expect(vorlagenWochentagWarnung(undefined, '2026-08-26')).toBeNull()
  })

  it('schweigt bei unlesbarem Datum statt einen Wochentag zu erfinden', () => {
    expect(vorlagenWochentagWarnung(1, '')).toBeNull()
    expect(vorlagenWochentagWarnung(1, '2026-02-30')).toBeNull()
  })

  it('warnt an genau sechs von sieben Tagen je Vorlage', () => {
    // Gegenprobe gegen den Versatz: haette die Umrechnung einen Tag
    // Schlagseite, kaeme hier 5 oder 7 heraus, nie 6.
    const woche = [
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
      '2026-08-28', '2026-08-29', '2026-08-30',
    ]
    for (let weekday = 1; weekday <= 7; weekday++) {
      const warnungen = woche.filter(d => vorlagenWochentagWarnung(weekday, d) !== null)
      expect(warnungen).toHaveLength(6)
    }
  })
})
