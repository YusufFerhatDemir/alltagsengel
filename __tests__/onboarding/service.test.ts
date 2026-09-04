/**
 * Onboarding-Service — Lesen und Fortschreiben
 *
 * Schwerpunkt: der Fortschritt darf NIE rueckwaerts gehen. Genau das ist
 * in diesem Bestand schon mehrfach passiert (monthly_closings,
 * bonus_berechnungen) — ein spaet eintreffender Aufruf stempelte einen
 * Endzustand zurueck. Beim Onboarding waere die Folge, dass jemand seine
 * bereits gegebenen Antworten verliert und von vorn anfangen soll.
 */

import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import {
  holeFortschritt, holeOderStarte, speichereSchritt, schliesseAb, starteNeu,
  merkeAbbruch, offeneAblaeufe, vermerkeAutoNachricht, ermittleFehlendeAngaben,
  OnboardingNichtLesbarError, OnboardingAbgeschlossenError,
} from '@/lib/onboarding/service'

type Client = Parameters<typeof holeFortschritt>[0]

const USER = '2c9a1f70-6b3e-4a51-9d2c-71f0a3b8c4d5'
const ORG = '00000000-0000-4000-8000-000460629986'
const SCHLUESSEL = { userId: USER, organizationId: ORG, typ: 'kunde' as const }

const ZEILE = (ueber: Record<string, unknown> = {}) => ({
  id: 'fortschritt-1',
  user_id: USER,
  organization_id: ORG,
  typ: 'kunde',
  aktueller_schritt: 1,
  gesamt_schritte: 5,
  schritte_daten: {},
  fehlende_angaben: [],
  dokument_status: {},
  letzte_auto_nachricht: null,
  abbruchstelle: null,
  abgeschlossen_am: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  ...ueber,
})

/**
 * Fake, der einen Bestand haelt und Updates darauf anwendet — so wird
 * sichtbar, was tatsaechlich geschrieben wurde.
 */
function fake(bestand: Record<string, unknown> | null, opt: { fehler?: string } = {}) {
  const updates: Record<string, unknown>[] = []
  const inserts: Record<string, unknown>[] = []
  let aktuell = bestand

  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle !== 'onboarding_progress') return { data: null }
    if (opt.fehler) return { error: { message: opt.fehler } }

    if (a.operation === 'insert') {
      const nutz = a.payload as Record<string, unknown>
      inserts.push(nutz)
      aktuell = ZEILE({ ...nutz })
      return { data: aktuell }
    }
    if (a.operation === 'update') {
      const nutz = a.payload as Record<string, unknown>
      updates.push(nutz)
      // `.is('abgeschlossen_am', null)` bilden wir nach: ein
      // abgeschlossener Ablauf wird von diesem UPDATE nicht getroffen.
      const abgeschlossen = (aktuell as Record<string, unknown> | null)?.abgeschlossen_am
      const zieltAufOffene = JSON.stringify(a.filter ?? []).includes('abgeschlossen_am')
      if (abgeschlossen && zieltAufOffene) return { data: null }
      aktuell = { ...(aktuell as Record<string, unknown>), ...nutz }
      return { data: aktuell }
    }
    return { data: aktuell }
  })

  return { client: f.client as unknown as Client, updates, inserts, stand: () => aktuell }
}

describe('holeFortschritt', () => {
  it('liefert null, wenn nie begonnen wurde', async () => {
    const { client } = fake(null)
    expect(await holeFortschritt(client, SCHLUESSEL)).toBeNull()
  })

  it('bildet die Zeile auf sprechende Felder ab', async () => {
    const { client } = fake(ZEILE({ aktueller_schritt: 3, fehlende_angaben: ['telefon'] }))
    const f = await holeFortschritt(client, SCHLUESSEL)
    expect(f?.aktuellerSchritt).toBe(3)
    expect(f?.fehlendeAngaben).toEqual(['telefon'])
    expect(f?.typ).toBe('kunde')
  })

  it('ist fail-closed bei einem Lesefehler', async () => {
    // Ein leeres Ergebnis nach einem Fehler saehe aus wie „noch nicht
    // begonnen" — und wuerde einen laufenden Ablauf zuruecksetzen.
    const { client } = fake(ZEILE(), { fehler: 'Verbindung weg' })
    await expect(holeFortschritt(client, SCHLUESSEL))
      .rejects.toThrow(OnboardingNichtLesbarError)
  })

  it('verlangt Person und Mandant', async () => {
    const { client } = fake(null)
    await expect(holeFortschritt(client, { ...SCHLUESSEL, organizationId: '' }))
      .rejects.toThrow(OnboardingNichtLesbarError)
  })
})

describe('holeOderStarte', () => {
  it('legt den Ablauf mit der Schrittzahl aus der Definition an', async () => {
    // gesamt_schritte kommt NICHT vom Aufrufer — sonst behaupten
    // Oberflaeche und Fortschrittsbalken verschiedene Laengen.
    const { client, inserts } = fake(null)
    const f = await holeOderStarte(client, SCHLUESSEL)
    expect(inserts[0].gesamt_schritte).toBe(5)
    expect(inserts[0].aktueller_schritt).toBe(1)
    expect(inserts[0].organization_id).toBe(ORG)
    expect(f.gesamtSchritte).toBe(5)
  })

  it('legt nichts an, wenn es den Ablauf schon gibt', async () => {
    const { client, inserts } = fake(ZEILE({ aktueller_schritt: 4 }))
    const f = await holeOderStarte(client, SCHLUESSEL)
    expect(inserts).toHaveLength(0)
    expect(f.aktuellerSchritt).toBe(4)
  })
})

describe('speichereSchritt — nur vorwaerts', () => {
  it('haelt Daten fest und rueckt einen Schritt vor', async () => {
    const { client, updates } = fake(ZEILE({ aktueller_schritt: 1 }))
    const f = await speichereSchritt(client, SCHLUESSEL, {
      schritt: 1, daten: { vorname: 'Erika', nachname: 'Müller', telefon: '069' },
    })
    expect(f.aktuellerSchritt).toBe(2)
    const daten = updates[0].schritte_daten as Record<string, { status: string }>
    expect(daten.kontakt.status).toBe('fertig')
  })

  it('senkt aktueller_schritt NICHT, wenn ein alter Schritt nachtraeglich kommt', async () => {
    // Zweiter Browsertab, Zurueck-Taste, wiederholter Request.
    const { client } = fake(ZEILE({ aktueller_schritt: 4 }))
    const f = await speichereSchritt(client, SCHLUESSEL, { schritt: 1, daten: { vorname: 'E' } })
    expect(f.aktuellerSchritt).toBe(4)
  })

  it('laeuft nicht ueber das Ende der Folge hinaus', async () => {
    // Sonst verletzt der Wert den CHECK in der Datenbank.
    const { client } = fake(ZEILE({ aktueller_schritt: 5 }))
    const f = await speichereSchritt(client, SCHLUESSEL, { schritt: 5, daten: {} })
    expect(f.aktuellerSchritt).toBe(5)
  })

  it('stuft einen bereits fertigen Schritt nicht zurueck', async () => {
    const { client, updates } = fake(ZEILE({
      schritte_daten: { kontakt: { status: 'fertig', daten: { vorname: 'E' }, zeitpunkt: 'x' } },
    }))
    await speichereSchritt(client, SCHLUESSEL, { schritt: 1, status: 'offen', daten: {} })
    const daten = updates[0].schritte_daten as Record<string, { status: string }>
    expect(daten.kontakt.status).toBe('fertig')
  })

  it('behaelt frueher gegebene Antworten bei einer Teilaenderung', async () => {
    const { client, updates } = fake(ZEILE({
      schritte_daten: {
        kontakt: { status: 'fertig', daten: { vorname: 'Erika', telefon: '069' }, zeitpunkt: 'x' },
      },
    }))
    await speichereSchritt(client, SCHLUESSEL, { schritt: 1, daten: { telefon: '0170' } })
    const daten = updates[0].schritte_daten as Record<string, { daten: Record<string, unknown> }>
    expect(daten.kontakt.daten).toEqual({ vorname: 'Erika', telefon: '0170' })
  })

  it('weist einen abgeschlossenen Ablauf ab', async () => {
    const { client } = fake(ZEILE({ abgeschlossen_am: '2026-09-10T00:00:00Z' }))
    await expect(speichereSchritt(client, SCHLUESSEL, { schritt: 1, daten: {} }))
      .rejects.toThrow(OnboardingAbgeschlossenError)
  })

  it('weist eine Schrittnummer ausserhalb der Folge ab', async () => {
    const { client } = fake(ZEILE())
    await expect(speichereSchritt(client, SCHLUESSEL, { schritt: 42, daten: {} }))
      .rejects.toThrow(RangeError)
  })

  it('laesst Pflichtschritte nicht ueberspringen', async () => {
    const { client } = fake(ZEILE())
    await expect(speichereSchritt(client, SCHLUESSEL, { schritt: 1, status: 'uebersprungen' }))
      .rejects.toThrow(/nicht ueberspringbar/)
  })

  it('erlaubt das Ueberspringen ueberspringbarer Schritte', async () => {
    const { client, updates } = fake(ZEILE())
    await speichereSchritt(client, SCHLUESSEL, { schritt: 3, status: 'uebersprungen' })
    const daten = updates[0].schritte_daten as Record<string, { status: string }>
    expect(daten.pflegegrad.status).toBe('uebersprungen')
  })

  it('vermerkt fehlende Angaben, statt die Eingabe abzulehnen', async () => {
    // Ein Ablauf, der bei der ersten Luecke stehenbleibt, wird verlassen.
    const { client, updates } = fake(ZEILE())
    await speichereSchritt(client, SCHLUESSEL, { schritt: 1, daten: { vorname: 'Erika' } })
    expect(updates[0].fehlende_angaben).toContain('nachname')
    expect(updates[0].fehlende_angaben).toContain('telefon')
  })

  it('loescht die Abbruchstelle — wer weitermacht, hat nicht abgebrochen', async () => {
    const { client, updates } = fake(ZEILE({ abbruchstelle: 'schritt_2' }))
    await speichereSchritt(client, SCHLUESSEL, { schritt: 1, daten: {} })
    expect(updates[0].abbruchstelle).toBeNull()
  })
})

describe('ermittleFehlendeAngaben', () => {
  it('zaehlt leere Werte, leere Listen und fehlende Schluessel', () => {
    const fehlend = ermittleFehlendeAngaben('kunde', {
      kontakt: {
        status: 'fertig',
        daten: { vorname: 'Erika', nachname: '', telefon: null },
        zeitpunkt: 'x',
      },
    })
    expect(fehlend).toContain('nachname')
    expect(fehlend).toContain('telefon')
    expect(fehlend).not.toContain('vorname')
  })
})

describe('schliesseAb', () => {
  const vollstaendig = {
    kontakt: { status: 'fertig', daten: {}, zeitpunkt: 'x' },
    adresse: { status: 'fertig', daten: {}, zeitpunkt: 'x' },
    bedarf: { status: 'fertig', daten: {}, zeitpunkt: 'x' },
  }

  it('schliesst ab, wenn alle Pflichtschritte fertig sind', async () => {
    const { client, updates } = fake(ZEILE({ schritte_daten: vollstaendig }))
    const f = await schliesseAb(client, SCHLUESSEL)
    expect(updates[0].abgeschlossen_am).toBeTruthy()
    expect(f.abgeschlossenAm).toBeTruthy()
  })

  it('schliesst NICHT ab, solange Pflichtschritte offen sind', async () => {
    // Sonst verschwindet der Ablauf aus jeder Erinnerungsliste, und
    // niemand fragt die fehlenden Angaben je nach.
    const { client } = fake(ZEILE({
      schritte_daten: { kontakt: { status: 'fertig', daten: {}, zeitpunkt: 'x' } },
    }))
    await expect(schliesseAb(client, SCHLUESSEL))
      .rejects.toThrow(/offene Pflichtschritte/)
  })

  it('ignoriert offene ueberspringbare Schritte', async () => {
    const { client } = fake(ZEILE({ schritte_daten: vollstaendig }))
    await expect(schliesseAb(client, SCHLUESSEL)).resolves.toBeTruthy()
  })

  it('ist idempotent', async () => {
    const { client, updates } = fake(ZEILE({
      schritte_daten: vollstaendig, abgeschlossen_am: '2026-09-10T00:00:00Z',
    }))
    const f = await schliesseAb(client, SCHLUESSEL)
    expect(updates).toHaveLength(0)
    expect(f.abgeschlossenAm).toBe('2026-09-10T00:00:00Z')
  })
})

describe('merkeAbbruch', () => {
  it('haelt die Absprungstelle fest', async () => {
    const { client, updates } = fake(ZEILE())
    await merkeAbbruch(client, SCHLUESSEL, 'schritt_3_pflegegrad')
    expect(updates[0].abbruchstelle).toBe('schritt_3_pflegegrad')
  })

  it('schreibt nichts bei abgeschlossenem oder fehlendem Ablauf', async () => {
    const a = fake(ZEILE({ abgeschlossen_am: '2026-09-10T00:00:00Z' }))
    await merkeAbbruch(a.client, SCHLUESSEL, 'egal')
    expect(a.updates).toHaveLength(0)

    const b = fake(null)
    await merkeAbbruch(b.client, SCHLUESSEL, 'egal')
    expect(b.updates).toHaveLength(0)
  })
})

describe('starteNeu', () => {
  it('setzt alles zurueck — der einzige Weg dorthin', async () => {
    const { client, updates } = fake(ZEILE({
      aktueller_schritt: 4,
      schritte_daten: { kontakt: { status: 'fertig', daten: {}, zeitpunkt: 'x' } },
      abgeschlossen_am: '2026-09-10T00:00:00Z',
      letzte_auto_nachricht: '2026-09-09T00:00:00Z',
    }))
    await starteNeu(client, SCHLUESSEL)
    expect(updates[0]).toMatchObject({
      aktueller_schritt: 1,
      schritte_daten: {},
      fehlende_angaben: [],
      abgeschlossen_am: null,
      letzte_auto_nachricht: null,
    })
  })
})

describe('Betriebssicht', () => {
  it('verlangt einen Mandanten', async () => {
    const { client } = fake(null)
    await expect(offeneAblaeufe(client, { organizationId: '' }))
      .rejects.toThrow(OnboardingNichtLesbarError)
  })

  it('ist fail-closed bei Lesefehlern', async () => {
    const { client } = fake(null, { fehler: 'kaputt' })
    await expect(offeneAblaeufe(client, { organizationId: ORG }))
      .rejects.toThrow(OnboardingNichtLesbarError)
  })

  it('vermerkt eine versendete Nachricht', async () => {
    const { client, updates } = fake(ZEILE())
    await vermerkeAutoNachricht(client, 'fortschritt-1', '2026-09-20T10:00:00Z')
    expect(updates[0].letzte_auto_nachricht).toBe('2026-09-20T10:00:00Z')
  })
})
