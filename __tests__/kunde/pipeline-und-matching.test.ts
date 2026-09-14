/**
 * Kundenfunnel: Stufen und Engel-Vorschlag.
 * @see lib/kunde/pipeline.ts, lib/kunde/matching.ts
 *
 * Die beiden Module beantworten zwei Fragen, die in der Vermittlung
 * zusammengehören: wo steht der Vorgang, und wer käme dafür in Frage.
 *
 * Der wichtigste Test hier ist der auf die TORE. Ein Engel ohne
 * Einsatzfreigabe darf nicht mit Punktabzug erscheinen, sondern gar nicht —
 * Einsatzfreigabe heißt, dass Führungszeugnis, Erste-Hilfe-Nachweis und
 * Vertrag vorliegen. Ein Vorschlag ohne sie wäre eine Einladung, an genau
 * dieser Prüfung vorbeizuplanen.
 */
import { describe, it, expect } from 'vitest'
import {
  KUNDEN_STUFEN, KUNDEN_STUFEN_FLOW, KUNDEN_VORWAERTS, KUNDEN_ENDZUSTAENDE,
  KUNDEN_VERLAUF_MAX, kundenStufe, istKundenStufe, stufeFuerAnfrage,
  mitKundenStufe, wiedervorlageFuerStufe,
} from '@/lib/kunde/pipeline'
import { findePassendeEngel, SCHWELLE_GUT, type EngelDaten } from '@/lib/kunde/matching'
import { plzDistanceKm, matchPlzOffline } from '@/lib/plz-match'

/** Der CHECK auf `lead_inquiries.status`, live belegt. */
const LIVE_CHECK = ['new', 'contacted', 'qualified', 'converted', 'lost']

// ═══════════════════════════════════════════════════════════════════════
describe('Kundenstufen', () => {
  it('genau diese acht Stufen, in dieser Reihenfolge', () => {
    expect(KUNDEN_STUFEN_FLOW).toEqual([
      'anfrage', 'kontaktiert', 'erstgespraech', 'angebot', 'vertrag', 'aktiv',
      'abgesagt', 'archiviert',
    ])
  })

  it('die vier genannten Stationen liegen in der richtigen Reihenfolge', () => {
    const i = (k: string) => KUNDEN_STUFEN_FLOW.indexOf(k)
    expect(i('anfrage')).toBeLessThan(i('erstgespraech'))
    expect(i('erstgespraech')).toBeLessThan(i('vertrag'))
    expect(i('vertrag')).toBeLessThan(i('aktiv'))
  })

  it('jede Stufe schreibt einen Status, den der LIVE-CHECK erlaubt', () => {
    for (const s of KUNDEN_STUFEN) expect(LIVE_CHECK).toContain(s.dbStatus)
  })

  it('jede Stufe trägt Aufgabe und Farbe', () => {
    for (const s of KUNDEN_STUFEN) {
      expect(s.aufgabe.length, s.key).toBeGreaterThan(10)
      expect(s.color, s.key).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('nur Endzustände haben keine Wiedervorlage', () => {
    for (const s of KUNDEN_STUFEN) {
      const endzustand = KUNDEN_ENDZUSTAENDE.includes(s.key)
      expect(s.wiedervorlageTage === null, s.key).toBe(endzustand)
    }
  })

  it('der Vorwärtsweg lässt die Ausstiege aus', () => {
    expect(KUNDEN_VORWAERTS).not.toContain('abgesagt')
    expect(KUNDEN_VORWAERTS).not.toContain('archiviert')
    expect(KUNDEN_VORWAERTS).toContain('aktiv')
  })

  it('weist unbekannte Stufen ab', () => {
    expect(istKundenStufe('anfrage')).toBe(true)
    expect(istKundenStufe('Anfrage')).toBe(false)
    expect(istKundenStufe('erledigt')).toBe(false)
    expect(istKundenStufe(null)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('stufeFuerAnfrage — der Status gewinnt', () => {
  const jetzt = new Date('2026-09-14T09:00:00Z')

  it('nimmt die gespeicherte Stufe, solange sie zum Status passt', () => {
    const daten = mitKundenStufe({}, 'erstgespraech', jetzt, 'Verwaltung')
    const r = stufeFuerAnfrage(daten, 'contacted')
    expect(r.stufe).toBe('erstgespraech')
    expect(r.ausStatus).toBe(false)
  })

  it('leitet aus dem Status ab, wenn beide auseinanderlaufen', () => {
    // Jemand hat den Status in /mis/crm auf converted gestellt. Die feine
    // Stufe ist damit veraltet — der Status ist die Spalte mit CHECK.
    const daten = mitKundenStufe({}, 'erstgespraech', jetzt, null)
    const r = stufeFuerAnfrage(daten, 'converted')
    expect(r.stufe).toBe('aktiv')
    expect(r.ausStatus).toBe(true)
  })

  it('leitet ohne gespeicherte Pipeline aus dem Status ab', () => {
    expect(stufeFuerAnfrage(null, 'new').stufe).toBe('anfrage')
    expect(stufeFuerAnfrage(null, 'qualified').stufe).toBe('angebot')
    expect(stufeFuerAnfrage(null, 'lost').stufe).toBe('abgesagt')
    expect(stufeFuerAnfrage(null, null).stufe).toBe('anfrage')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('mitKundenStufe', () => {
  const jetzt = new Date('2026-09-14T09:00:00Z')

  it('lässt die Formularangaben unangetastet', () => {
    // `anfrage_daten` trägt Anliegen, Dringlichkeit, Kontaktweg und
    // Pflegegrad. Ein Stufenwechsel darf sie nicht wegräumen.
    const daten = { anliegen: 'angehoeriger', pflegegrad: 'grad2' }
    const neu = mitKundenStufe(daten, 'kontaktiert', jetzt, 'Verwaltung')
    expect(neu.anliegen).toBe('angehoeriger')
    expect(neu.pflegegrad).toBe('grad2')
  })

  it('führt einen Verlauf und begrenzt ihn', () => {
    let daten: unknown = {}
    for (let i = 0; i < KUNDEN_VERLAUF_MAX + 5; i++) {
      daten = mitKundenStufe(daten, i % 2 ? 'kontaktiert' : 'anfrage', jetzt, null)
    }
    expect((daten as any).pipeline.verlauf).toHaveLength(KUNDEN_VERLAUF_MAX)
  })

  it('verträgt kaputte Vorbestände', () => {
    for (const murks of [null, undefined, 'text', 42, [1, 2]]) {
      const neu = mitKundenStufe(murks, 'anfrage', jetzt, null)
      expect((neu.pipeline as any).stufe).toBe('anfrage')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('wiedervorlageFuerStufe', () => {
  const jetzt = new Date('2026-09-14T09:00:00Z')

  it('setzt ein Datum für laufende Stufen', () => {
    expect(wiedervorlageFuerStufe('anfrage', jetzt)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('leert die Spalte im Endzustand', () => {
    // Ein abgeschlossener Vorgang, der weiter in der Fälligkeitsliste steht,
    // macht die Liste unbrauchbar.
    for (const e of KUNDEN_ENDZUSTAENDE) {
      expect(wiedervorlageFuerStufe(e, jetzt), e).toBeNull()
    }
  })

  it('ruft nach einer Anfrage früher als nach einem Angebot', () => {
    expect(kundenStufe('anfrage').wiedervorlageTage!)
      .toBeLessThan(kundenStufe('angebot').wiedervorlageTage!)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('findePassendeEngel — die Tore', () => {
  const basis: EngelDaten = {
    id: 'e1', name: 'A. Muster', zip_code: '60311',
    einsatzfreigabe: true, status: 'active', vertragsstatus: 'aktiv',
    qualification_level: 'Betreuungskraft §53c',
  }
  const bedarf = { plz: '60311', stichtag: new Date('2026-09-14T09:00:00Z') }

  it('schlägt niemanden ohne Einsatzfreigabe vor', () => {
    const r = findePassendeEngel([{ ...basis, einsatzfreigabe: false }], bedarf)
    expect(r.treffer).toHaveLength(0)
    expect(r.ausgeschlossen[0].grund).toMatch(/Einsatzfreigabe/)
  })

  it('behandelt eine fehlende Einsatzfreigabe wie ein Nein', () => {
    // Fail-closed: `null`/`undefined` ist kein Freibrief.
    for (const w of [null, undefined]) {
      const r = findePassendeEngel([{ ...basis, einsatzfreigabe: w }], bedarf)
      expect(r.treffer, String(w)).toHaveLength(0)
    }
  })

  it('schlägt niemanden vor, der ausgeschieden ist', () => {
    const r = findePassendeEngel([{ ...basis, austrittsdatum: '2026-08-31' }], bedarf)
    expect(r.treffer).toHaveLength(0)
    expect(r.ausgeschlossen[0].grund).toMatch(/Ausgeschieden/)
  })

  it('lässt ein Austrittsdatum in der Zukunft durch', () => {
    const r = findePassendeEngel([{ ...basis, austrittsdatum: '2026-12-31' }], bedarf)
    expect(r.treffer).toHaveLength(1)
  })

  it('weist einen unbekannten Vertragsstatus ab, statt ihn durchzuwinken', () => {
    const r = findePassendeEngel([{ ...basis, vertragsstatus: 'ruhend' }], bedarf)
    expect(r.treffer).toHaveLength(0)
    expect(r.ausgeschlossen[0].grund).toMatch(/ruhend/)
  })

  it('nennt jeden Ausschluss mit Grund — keine stillen Lücken', () => {
    const r = findePassendeEngel([
      { ...basis, id: 'a', einsatzfreigabe: false },
      { ...basis, id: 'b', austrittsdatum: '2020-01-01' },
    ], bedarf)
    expect(r.ausgeschlossen).toHaveLength(2)
    for (const a of r.ausgeschlossen) expect(a.grund.length).toBeGreaterThan(5)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('findePassendeEngel — Reihenfolge und Begründung', () => {
  const frei = { einsatzfreigabe: true, status: 'active', vertragsstatus: 'aktiv' }
  const stichtag = new Date('2026-09-14T09:00:00Z')

  it('setzt die nähere Person nach vorn', () => {
    const r = findePassendeEngel([
      { id: 'fern', name: 'Fern', zip_code: '20095', ...frei },      // Hamburg
      { id: 'nah', name: 'Nah', zip_code: '60311', ...frei },        // Frankfurt
    ], { plz: '60311', stichtag })
    expect(r.treffer[0].engelId).toBe('nah')
  })

  it('schlägt ein ausdrücklich bedientes Gebiet die Luftlinie', () => {
    // Wer sein Einsatzgebiet selbst angegeben hat, weiss besser als eine
    // Rechnung, wo er hinfaehrt.
    const r = findePassendeEngel([
      { id: 'gebiet', name: 'Gebiet', zip_code: '61348', einsatzgebiet_plz: ['60311'], ...frei },
    ], { plz: '60311', stichtag })
    expect(r.treffer).toHaveLength(1)
    expect(r.treffer[0].gruende.join(' ')).toMatch(/Einsatzgebiet/)
  })

  it('schließt aus, wer den eigenen Radius überschreitet', () => {
    const r = findePassendeEngel([
      { id: 'e', name: 'E', zip_code: '20095', einsatzgebiet_radius_km: 10, ...frei },
    ], { plz: '60311', stichtag })
    expect(r.treffer).toHaveLength(0)
    expect(r.ausgeschlossen[0].grund).toMatch(/außerhalb des eigenen Radius von 10 km/)
  })

  it('rechnet den Unschärfepuffer mit, statt an der Grenze auszuschließen', () => {
    // Ist für eine der beiden Postleitzahlen nur der Zonenmittelpunkt
    // bekannt, stimmt die Distanz auf einige Kilometer genau. Ein blankes
    // `km > radius` wäre an der Grenze strenger als jede andere Stelle im
    // Haus — und ein Ausschluss ist die teure Richtung. Geprüft wird gegen
    // dieselbe Funktion, die das Repo überall sonst benutzt.
    const km = plzDistanceKm('60311', '61348')
    expect(km, 'Testannahme: beide PLZ sind bekannt').not.toBeNull()
    // Radius knapp UNTER der Distanz: ohne Puffer waere das ein Ausschluss.
    const knapp = Math.floor((km as number) - 1)
    const r = findePassendeEngel([
      { id: 'e', name: 'E', zip_code: '61348', einsatzgebiet_radius_km: knapp, ...frei },
    ], { plz: '60311', stichtag })
    const erlaubt = matchPlzOffline('61348', '60311', knapp)
    expect(r.treffer.length === 1).toBe(erlaubt)
  })

  it('meldet eine unbekannte Entfernung, statt sie zu raten', () => {
    const r = findePassendeEngel([{ id: 'e', name: 'E', zip_code: null, ...frei }], { plz: '60311', stichtag })
    expect(r.treffer[0].entfernungKm).toBeNull()
    expect(r.treffer[0].huerden.join(' ')).toMatch(/Entfernung unbekannt/)
  })

  it('macht Pflegegrad 4 zur Hürde, nicht zum Ausschluss', () => {
    // Was der Fall braucht, entscheidet die Einsatzleitung nach dem
    // Erstgespräch — nicht eine Punkteformel.
    const r = findePassendeEngel([
      { id: 'ohne', name: 'Ohne', zip_code: '60311', is_nurse: false, ...frei },
    ], { plz: '60311', pflegegrad: 'grad4', stichtag })
    expect(r.treffer).toHaveLength(1)
    expect(r.treffer[0].huerden.join(' ')).toMatch(/Pflegegrad 4/)
  })

  it('bevorzugt bei hohem Pflegegrad die Pflegefachkraft', () => {
    const r = findePassendeEngel([
      { id: 'laie', name: 'Laie', zip_code: '60311', is_nurse: false, ...frei },
      { id: 'fachkraft', name: 'Fachkraft', zip_code: '60311', is_nurse: true, ...frei },
    ], { plz: '60311', pflegegrad: 'grad5', stichtag })
    expect(r.treffer[0].engelId).toBe('fachkraft')
  })

  it('nennt eine fehlende Sprache als Hürde mit dem, was da ist', () => {
    const r = findePassendeEngel([
      { id: 'e', name: 'E', zip_code: '60311', languages: ['Deutsch', 'Polnisch'], ...frei },
    ], { plz: '60311', sprache: 'Türkisch', stichtag })
    expect(r.treffer[0].huerden.join(' ')).toMatch(/Polnisch/)
  })

  it('gibt jedem Treffer mindestens eine Begründung', () => {
    const r = findePassendeEngel([
      { id: 'e', name: 'E', zip_code: '60311', qualification_level: 'Betreuungskraft', ...frei },
    ], { plz: '60311', stichtag })
    expect(r.treffer[0].gruende.length).toBeGreaterThan(0)
  })

  it('erreicht ein guter Treffer die Schwelle', () => {
    const r = findePassendeEngel([
      { id: 'e', name: 'E', zip_code: '60311', qualification_level: 'Pflegefachkraft',
        is_nurse: true, has_vehicle: true, languages: ['Deutsch'], ...frei },
    ], { plz: '60311', sprache: 'Deutsch', brauchtFahrzeug: true, stichtag })
    expect(r.treffer[0].punkte).toBeGreaterThanOrEqual(SCHWELLE_GUT)
  })

  it('kommt mit einer leeren Liste klar', () => {
    const r = findePassendeEngel([], { plz: '60311', stichtag })
    expect(r.treffer).toEqual([])
    expect(r.ausgeschlossen).toEqual([])
  })
})
