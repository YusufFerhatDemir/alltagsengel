/**
 * ArbZG-Regeln (§ 3, § 4, § 5) — die reine Rechnung.
 *
 * Diese Suite prueft `lib/personal/arbzg.ts` ohne Datenbank. Der Trigger
 * derselben Regeln laeuft in
 * `__tests__/e2e/arbzg-ist-arbeitszeit-pglite.test.ts` gegen echtes
 * Postgres; dass beide dieselben Zahlen liefern, ist dort ausdruecklich
 * Gegenstand — zwei Fassungen einer Regel driften sonst auseinander, ohne
 * dass irgendetwas rot wird.
 *
 * Die Schwellenwerte werden BEIDSEITIG geprueft (359/360/361 bzw.
 * 539/540/541). § 4 ArbZG sagt „mehr als sechs Stunden", nicht „ab sechs
 * Stunden" — genau 6 h ohne Pause ist zulaessig, und ein Off-by-one an
 * dieser Stelle erzeugt einen Verstoss, den es rechtlich nicht gibt.
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_TAGESARBEITSZEIT_MINUTEN,
  MIN_RUHEZEIT_MINUTEN,
  VERSTOSS_LABEL,
  nettoMinuten,
  pflichtpauseMinuten,
  pruefeArbeitstag,
  pruefeRuhezeit,
  zeitZuMinuten,
} from '@/lib/personal/arbzg'

describe('zeitZuMinuten', () => {
  it('liest HH:MM und HH:MM:SS', () => {
    expect(zeitZuMinuten('08:30')).toBe(510)
    expect(zeitZuMinuten('08:30:00')).toBe(510)
    expect(zeitZuMinuten('00:00')).toBe(0)
    expect(zeitZuMinuten('23:59')).toBe(1439)
  })

  it('weist Unfug ab, statt eine Zahl zu erfinden', () => {
    expect(zeitZuMinuten('24:00')).toBeNull()
    expect(zeitZuMinuten('08:60')).toBeNull()
    expect(zeitZuMinuten('acht')).toBeNull()
    expect(zeitZuMinuten('')).toBeNull()
    expect(zeitZuMinuten(null)).toBeNull()
    expect(zeitZuMinuten(undefined)).toBeNull()
  })
})

describe('nettoMinuten', () => {
  it('rechnet Ende minus Beginn minus Pause', () => {
    expect(nettoMinuten('08:00', '16:30', 30)).toBe(480)
    expect(nettoMinuten('08:00', '16:00', 0)).toBe(480)
    expect(nettoMinuten('08:00', '16:00', null)).toBe(480)
  })

  it('behandelt den Nachtdienst als Dienst ueber Mitternacht, nicht als Fehler', () => {
    // 22:00–06:00 sind acht Stunden, nicht minus sechzehn. Wer hier naiv
    // subtrahiert, bekommt -960 und eine Arbeitszeit, die nach unten luegt.
    expect(nettoMinuten('22:00', '06:00', 0)).toBe(480)
    expect(nettoMinuten('22:00', '06:30', 30)).toBe(480)
  })

  it('meldet 0 statt einer negativen Zahl, wenn die Pause den Dienst uebersteigt', () => {
    expect(nettoMinuten('08:00', '10:00', 300)).toBe(0)
  })

  it('gibt null zurueck, wenn Beginn oder Ende unbrauchbar sind', () => {
    expect(nettoMinuten('acht', '16:00', 0)).toBeNull()
    expect(nettoMinuten('08:00', null, 0)).toBeNull()
  })
})

describe('pflichtpauseMinuten (§ 4 ArbZG)', () => {
  it('verlangt bis einschliesslich sechs Stunden keine Pause', () => {
    expect(pflichtpauseMinuten(0)).toBe(0)
    expect(pflichtpauseMinuten(359)).toBe(0)
    expect(pflichtpauseMinuten(360)).toBe(0)
  })

  it('verlangt ab mehr als sechs Stunden 30 Minuten', () => {
    expect(pflichtpauseMinuten(361)).toBe(30)
    expect(pflichtpauseMinuten(480)).toBe(30)
    expect(pflichtpauseMinuten(539)).toBe(30)
    expect(pflichtpauseMinuten(540)).toBe(30)
  })

  it('verlangt ab mehr als neun Stunden 45 Minuten', () => {
    expect(pflichtpauseMinuten(541)).toBe(45)
    expect(pflichtpauseMinuten(600)).toBe(45)
    expect(pflichtpauseMinuten(720)).toBe(45)
  })

  it('gibt bei unbrauchbarer Eingabe 0 zurueck', () => {
    expect(pflichtpauseMinuten(-10)).toBe(0)
    expect(pflichtpauseMinuten(Number.NaN)).toBe(0)
  })
})

describe('pruefeArbeitstag (§ 3 und § 4 ArbZG)', () => {
  it('haelt den regulaeren Tag fuer unauffaellig', () => {
    expect(pruefeArbeitstag({ startZeit: '08:00', endZeit: '16:30', pauseMinuten: 30 })).toEqual([])
  })

  it('meldet die Ueberschreitung der Tageshoechstarbeitszeit', () => {
    // 07:00–18:00 = 11 h brutto, 30 min Pause = 630 min netto.
    const befunde = pruefeArbeitstag({ startZeit: '07:00', endZeit: '18:00', pauseMinuten: 30 })
    const tag = befunde.find(b => b.art === 'max_tagesarbeitszeit')
    expect(tag).toEqual({
      art: 'max_tagesarbeitszeit',
      gemessenMinuten: 630,
      grenzwertMinuten: MAX_TAGESARBEITSZEIT_MINUTEN,
    })
  })

  it('meldet exakt 600 Minuten NICHT — der Grenzwert selbst ist zulaessig', () => {
    // 07:00–17:30 = 630 brutto, 30 Pause = 600 netto.
    const befunde = pruefeArbeitstag({ startZeit: '07:00', endZeit: '17:30', pauseMinuten: 30 })
    expect(befunde.some(b => b.art === 'max_tagesarbeitszeit')).toBe(false)
  })

  it('meldet die zu kurze Ruhepause mit der Pflichtdauer als Grenzwert', () => {
    // 08:00–17:00 ohne Pause = 540 min netto → Pflicht 30, gewaehrt 0.
    const befunde = pruefeArbeitstag({ startZeit: '08:00', endZeit: '17:00', pauseMinuten: 0 })
    expect(befunde).toContainEqual({
      art: 'pflichtpause',
      gemessenMinuten: 0,
      grenzwertMinuten: 30,
    })
  })

  it('meldet BEIDE Befunde, wenn eine lange Schicht auch noch pausenlos ist', () => {
    // 06:00–19:00 ohne Pause = 780 min netto: ueber 10 h UND ohne die
    // 45 min, die ab 9 h faellig sind. Zwei getrennte Rechtsgruende,
    // deshalb zwei Befunde — nicht einer, der beides meint.
    const befunde = pruefeArbeitstag({ startZeit: '06:00', endZeit: '19:00', pauseMinuten: 0 })
    expect(befunde.map(b => b.art).sort()).toEqual(['max_tagesarbeitszeit', 'pflichtpause'])
    expect(befunde.find(b => b.art === 'pflichtpause')?.grenzwertMinuten).toBe(45)
  })

  it('nimmt eine gewaehrte Pause an, die der Pflicht genuegt', () => {
    const befunde = pruefeArbeitstag({ startZeit: '08:00', endZeit: '17:30', pauseMinuten: 30 })
    expect(befunde).toEqual([])
  })

  it('prueft auch den Nachtdienst ueber Mitternacht', () => {
    // 20:00–07:00 = 660 brutto, 0 Pause = 660 netto → beide Befunde.
    const befunde = pruefeArbeitstag({ startZeit: '20:00', endZeit: '07:00', pauseMinuten: 0 })
    expect(befunde.map(b => b.art).sort()).toEqual(['max_tagesarbeitszeit', 'pflichtpause'])
    expect(befunde.find(b => b.art === 'max_tagesarbeitszeit')?.gemessenMinuten).toBe(660)
  })

  it('nimmt eine bereits hergeleitete Netto-Arbeitszeit, wenn sie uebergeben wird', () => {
    // Die Route leitet `ist_minuten` serverseitig her; wo der Wert schon
    // feststeht, wird er nicht ein zweites Mal gerechnet.
    const befunde = pruefeArbeitstag({
      startZeit: '08:00', endZeit: '16:00', pauseMinuten: 0, istMinuten: 700,
    })
    expect(befunde.find(b => b.art === 'max_tagesarbeitszeit')?.gemessenMinuten).toBe(700)
  })

  it('gibt bei unbrauchbaren Zeiten eine leere Liste zurueck statt zu werfen', () => {
    expect(pruefeArbeitstag({ startZeit: 'acht', endZeit: '16:00' })).toEqual([])
  })
})

describe('pruefeRuhezeit (§ 5 ArbZG)', () => {
  const tagdienst = { startZeitVorher: '08:00', endZeitVorher: '16:00' }

  it('haelt elf Stunden Abstand fuer eingehalten', () => {
    // Ende 16:00 am 01., Beginn 03:00 am 02. = 11 h exakt.
    expect(pruefeRuhezeit({
      datumVorher: '2026-09-01', ...tagdienst,
      datumNachher: '2026-09-02', startZeitNachher: '03:00',
    })).toBeNull()
  })

  it('meldet den zu kurzen Abstand mit dem gemessenen Wert', () => {
    // Ende 16:00 am 01., Beginn 02:00 am 02. = 10 h.
    expect(pruefeRuhezeit({
      datumVorher: '2026-09-01', ...tagdienst,
      datumNachher: '2026-09-02', startZeitNachher: '02:00',
    })).toEqual({
      art: 'mindestruhezeit',
      gemessenMinuten: 600,
      grenzwertMinuten: MIN_RUHEZEIT_MINUTEN,
    })
  })

  it('rechnet das Ende eines Nachtdienstes auf den FOLGETAG', () => {
    // Der Kern des Befundes: Dienst 22:00–06:00 am 01. endet am 02. um
    // 06:00. Naechster Dienst 14:00 am 02. → 8 h Ruhezeit, nicht 20.
    const befund = pruefeRuhezeit({
      datumVorher: '2026-09-01', startZeitVorher: '22:00', endZeitVorher: '06:00',
      datumNachher: '2026-09-02', startZeitNachher: '14:00',
    })
    expect(befund?.gemessenMinuten).toBe(480)
  })

  it('meldet eine Ueberschneidung NICHT als Ruhezeit von null', () => {
    // Der spaetere Dienst beginnt vor dem Ende des frueheren. Das ist eine
    // Doppelbelegung — ein anderer Sachverhalt mit einem eigenen Riegel.
    expect(pruefeRuhezeit({
      datumVorher: '2026-09-01', startZeitVorher: '08:00', endZeitVorher: '20:00',
      datumNachher: '2026-09-01', startZeitNachher: '18:00',
    })).toBeNull()
  })

  it('rechnet auch ueber die Sommerzeitgrenze in festen Minuten', () => {
    // Die Umstellung faellt 2026 auf den 25.10. In lokaler Zeitarithmetik
    // waere dieser Tag 25 Stunden lang und die Ruhezeit entsprechend zu
    // gross. Gerechnet wird deshalb in UTC-Minuten.
    const befund = pruefeRuhezeit({
      datumVorher: '2026-10-24', startZeitVorher: '12:00', endZeitVorher: '22:00',
      datumNachher: '2026-10-25', startZeitNachher: '06:00',
    })
    expect(befund?.gemessenMinuten).toBe(480)
  })

  it('gibt bei unbrauchbaren Daten null zurueck statt zu werfen', () => {
    expect(pruefeRuhezeit({
      datumVorher: 'gestern', ...tagdienst,
      datumNachher: '2026-09-02', startZeitNachher: '02:00',
    })).toBeNull()
  })
})

describe('VERSTOSS_LABEL', () => {
  it('nennt fuer jede Art den Rechtsgrund', () => {
    // Der Fristen-Sammler etikettierte den Verstoss frueher ueber einen
    // Zweiweg-Ausdruck. Seit `pflichtpause` dazugekommen ist, haette der
    // jeden dritten Fall als „Mindestruhezeit" ausgewiesen.
    expect(VERSTOSS_LABEL.max_tagesarbeitszeit).toContain('§ 3')
    expect(VERSTOSS_LABEL.pflichtpause).toContain('§ 4')
    expect(VERSTOSS_LABEL.mindestruhezeit).toContain('§ 5')
    expect(Object.keys(VERSTOSS_LABEL).sort()).toEqual(
      ['max_tagesarbeitszeit', 'mindestruhezeit', 'pflichtpause'],
    )
  })
})
