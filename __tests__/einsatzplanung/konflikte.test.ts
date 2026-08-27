import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  zeitZuMinuten,
  zeitenUeberschneiden,
  istAktiv,
  findeKonflikte,
  konfliktIds,
  type KonfliktEinsatz,
} from '../../lib/einsatzplanung/konflikte'
import { handlerRumpfOderFehler } from '../helpers/route-quelle'

// ═══════════════════════════════════════════════════════════
// Bereich 3 der Lückenanalyse (P2)
// ═══════════════════════════════════════════════════════════
// Befund: „Kalender und Schedule enthalten keinerlei Konflikt-/
// Überschneidungslogik; ein Konflikt äußert sich erst als Datenbankfehler
// beim Speichern."
//
// Die Prüflogik muss deckungsgleich mit dem DB-Trigger
// `check_assignment_overlap` (Migration 20260808200000) sein — sonst
// blockiert die Datenbank etwas, das die Oberfläche für zulässig hält.
// ═══════════════════════════════════════════════════════════

function einsatz(over: Partial<KonfliktEinsatz> = {}): KonfliktEinsatz {
  return {
    id: 'a1',
    client_id: 'k1',
    caregiver_id: 'e1',
    assignment_date: '2026-09-01',
    start_time: '09:00:00',
    end_time: '11:00:00',
    status: 'GEPLANT',
    ...over,
  }
}

describe('zeitZuMinuten', () => {
  it('liest HH:MM und HH:MM:SS gleich', () => {
    expect(zeitZuMinuten('09:30')).toBe(570)
    expect(zeitZuMinuten('09:30:00')).toBe(570)
  })

  it('gibt null für Unlesbares', () => {
    expect(zeitZuMinuten(null)).toBeNull()
    expect(zeitZuMinuten('')).toBeNull()
    expect(zeitZuMinuten('neun Uhr')).toBeNull()
    expect(zeitZuMinuten('25:00')).toBeNull()
    expect(zeitZuMinuten('09:75')).toBeNull()
  })
})

describe('zeitenUeberschneiden', () => {
  it('erkennt echte Überlappung', () => {
    expect(zeitenUeberschneiden('09:00', '11:00', '10:00', '12:00')).toBe(true)
  })

  it('behandelt Berührung an den Rändern nicht als Konflikt', () => {
    // Gleiche Regel wie im Trigger: start < NEW.end AND end > NEW.start
    expect(zeitenUeberschneiden('09:00', '10:00', '10:00', '11:00')).toBe(false)
    expect(zeitenUeberschneiden('10:00', '11:00', '09:00', '10:00')).toBe(false)
  })

  it('vergleicht HH:MM gegen HH:MM:SS korrekt', () => {
    // Ein reiner String-Vergleich läge hier falsch: '10:00' < '10:00:00'.
    expect(zeitenUeberschneiden('09:00', '10:00', '10:00:00', '11:00:00')).toBe(false)
    expect(zeitenUeberschneiden('09:00', '10:01', '10:00:00', '11:00:00')).toBe(true)
  })

  it('meldet bei unlesbarer Zeit keinen Konflikt', () => {
    // Eine kaputte Uhrzeit ist ein Eingabefehler — daraus einen Konflikt zu
    // machen, würde dem Planenden die falsche Ursache anzeigen.
    expect(zeitenUeberschneiden(null, '11:00', '10:00', '12:00')).toBe(false)
  })
})

describe('istAktiv', () => {
  it('zählt stornierte und No-Show-Einsätze nicht mit', () => {
    expect(istAktiv('STORNIERT')).toBe(false)
    expect(istAktiv('cancelled')).toBe(false)
    expect(istAktiv('NO_SHOW')).toBe(false)
    expect(istAktiv('GEPLANT')).toBe(true)
    expect(istAktiv('BEENDET')).toBe(true)
  })
})

describe('findeKonflikte', () => {
  it('erkennt die Doppelbelegung einer Betreuungskraft', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2', start_time: '10:00', end_time: '12:00', caregiver_name: 'Sabrina Martin', client_name: 'Herr Meier' })]
    const k = findeKonflikte(einsatz({ id: 'neu' }), bestand)
    expect(k).toHaveLength(1)
    expect(k[0].art).toBe('mitarbeiter')
    expect(k[0].gegenId).toBe('b1')
    expect(k[0].meldung).toContain('Sabrina Martin')
    expect(k[0].meldung).toContain('10:00–12:00')
  })

  it('erkennt die Doppelbelegung eines Klienten als eigene Art', () => {
    // Der DB-Trigger kennt diesen Fall nicht — er ist fachlich nicht immer
    // falsch (Doppelbesetzung beim Transfer) und darf deshalb nur warnen.
    const bestand = [einsatz({ id: 'b1', caregiver_id: 'e2', start_time: '10:00', end_time: '12:00', caregiver_name: 'Zweite Kraft' })]
    const k = findeKonflikte(einsatz({ id: 'neu' }), bestand)
    expect(k).toHaveLength(1)
    expect(k[0].art).toBe('klient')
  })

  it('zählt den eigenen Datensatz nicht als Konflikt (PATCH-Fall)', () => {
    const bestand = [einsatz({ id: 'a1' })]
    expect(findeKonflikte(einsatz({ id: 'a1' }), bestand)).toEqual([])
  })

  it('ignoriert stornierte Bestandseinsätze', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2', status: 'STORNIERT' })]
    expect(findeKonflikte(einsatz({ id: 'neu' }), bestand)).toEqual([])
  })

  it('prüft einen stornierten Kandidaten gar nicht erst', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2' })]
    expect(findeKonflikte(einsatz({ id: 'neu', status: 'STORNIERT' }), bestand)).toEqual([])
  })

  it('ignoriert einen anderen Tag', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2', assignment_date: '2026-09-02' })]
    expect(findeKonflikte(einsatz({ id: 'neu' }), bestand)).toEqual([])
  })

  it('prüft Serien ohne Datum bewusst nicht', () => {
    // weekday + recurrence_rule hat kein einzelnes Datum; der Trigger
    // behandelt sie in einem eigenen Zweig. Hier wird nichts geraten.
    const bestand = [einsatz({ id: 'b1', client_id: 'k2' })]
    expect(findeKonflikte(einsatz({ id: 'neu', assignment_date: null }), bestand)).toEqual([])
  })

  it('meldet je Gegenstück höchstens einen Konflikt — Mitarbeiter schlägt Klient', () => {
    // Gleiche Kraft UND gleicher Klient: der harte Fall gewinnt, sonst
    // stünde derselbe Termin zweimal in der Antwort.
    const bestand = [einsatz({ id: 'b1', start_time: '10:00', end_time: '12:00' })]
    const k = findeKonflikte(einsatz({ id: 'neu' }), bestand)
    expect(k).toHaveLength(1)
    expect(k[0].art).toBe('mitarbeiter')
  })

  it('kommt ohne Namen aus', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2', start_time: '10:00', end_time: '12:00' })]
    const k = findeKonflikte(einsatz({ id: 'neu' }), bestand)
    expect(k[0].meldung).toContain('Die Betreuungskraft')
    expect(k[0].meldung).not.toContain('null')
    expect(k[0].meldung).not.toContain('undefined')
  })
})

describe('konfliktIds', () => {
  it('markiert beide Seiten einer Überschneidung', () => {
    const liste = [
      einsatz({ id: 'a', start_time: '09:00', end_time: '11:00' }),
      einsatz({ id: 'b', client_id: 'k2', start_time: '10:00', end_time: '12:00' }),
      einsatz({ id: 'c', client_id: 'k3', caregiver_id: 'e9', start_time: '14:00', end_time: '15:00' }),
    ]
    const treffer = konfliktIds(liste)
    expect(treffer.has('a')).toBe(true)
    expect(treffer.has('b')).toBe(true)
    expect(treffer.has('c')).toBe(false)
  })

  it('gibt bei konfliktfreier Liste eine leere Menge', () => {
    const liste = [
      einsatz({ id: 'a', start_time: '09:00', end_time: '10:00' }),
      einsatz({ id: 'b', start_time: '10:00', end_time: '11:00' }),
    ]
    expect(konfliktIds(liste).size).toBe(0)
  })
})

// ── Verdrahtung ───────────────────────────────────────────────────
// Der echte Pfad braucht Supabase und Cookies und ist hier nicht
// ausführbar. Diese Prüfungen halten fest, DASS er verdrahtet ist —
// verschwindet der Aufruf, werden sie rot.

const ROUTE = join(process.cwd(), 'app/api/einsatzplanung/route.ts')
const routeQuelle = readFileSync(ROUTE, 'utf-8')

function abschnitt(name: 'POST' | 'PATCH'): string {
  // Zerlegung liegt in __tests__/helpers/route-quelle.ts — die Routen
  // exportieren ihre Handler durch `withTracking` gewrappt, und ein
  // Scanner, der sie nicht findet, prueft stillschweigend einen leeren
  // String und bestaetigt alles.
  return handlerRumpfOderFehler(routeQuelle, name, ROUTE)
}

describe('/api/einsatzplanung: Konfliktprüfung verdrahtet', () => {
  it('benutzt die gemeinsame Prüflogik statt einer zweiten Implementierung', () => {
    expect(routeQuelle).toContain("import { ladeKonflikte } from '@/lib/einsatzplanung/konflikte-server'")
  })

  it('prüft beim Anlegen (POST) und meldet 409', () => {
    const post = abschnitt('POST')
    expect(post).toContain('ladeKonflikte(')
    expect(post).toContain('Zeitliche Doppelbelegung')
    expect(post).toContain('status: 409')
  })

  it('prüft beim Ändern (PATCH)', () => {
    const patch = abschnitt('PATCH')
    expect(patch).toContain('ladeKonflikte(')
    expect(patch).toContain('status: 409')
  })

  it('bietet für die Mitarbeiter-Doppelbelegung KEINEN force_override an', () => {
    // Der DB-Trigger blockiert sie ohnehin — ein angebotener
    // Übersteuerungsweg wäre eine Zusage, die die Datenbank nicht einhält.
    for (const teil of [abschnitt('POST'), abschnitt('PATCH')]) {
      const i = teil.indexOf('Zeitliche Doppelbelegung')
      expect(i).toBeGreaterThan(-1)
      const meldung = teil.slice(i, i + 500)
      expect(meldung).toContain('nicht übersteuerbar')
      expect(meldung).not.toContain('force_override: true kann')
    }
  })
})

describe('Kalender zeigt Konflikte an', () => {
  const seite = readFileSync(join(process.cwd(), 'app/admin/kalender/page.tsx'), 'utf-8')

  it('benutzt dieselbe reine Funktion wie der Server', () => {
    expect(seite).toContain("import { konfliktIds } from '@/lib/einsatzplanung/konflikte'")
  })

  it('markiert betroffene Einsätze und zählt sie', () => {
    expect(seite).toContain('KonfliktBadge')
    expect(seite).toContain('Zeitkonflikte')
  })
})
