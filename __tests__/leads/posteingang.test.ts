/**
 * Priority Inbox: drei Quellen, eine Ampel.
 * @see lib/leads/posteingang.ts
 */
import { describe, it, expect } from 'vitest'
import {
  ausWarteliste, ausBewerbung, ausAnfrage, ampelFuer, sortierePosteingang,
  zaehlePosteingang, posteingangSatz, AMPEL_META, type PosteingangEintrag,
} from '@/lib/leads/posteingang'

const JETZT = new Date('2026-09-12T10:00:00Z')
const vor = (h: number) => new Date(JETZT.getTime() - h * 3600_000).toISOString()

describe('Ampel', () => {
  it.each([
    ['dringend', 'rot'], ['eskalation', 'orange'], ['erinnerung', 'gelb'], ['keine', 'gruen'],
  ] as const)('%s → %s', (fu, ampel) => {
    expect(ampelFuer(fu)).toBe(ampel)
  })

  it('Rangfolge: rot > orange > gelb > grün', () => {
    const r = (['rot', 'orange', 'gelb', 'gruen'] as const).map(a => AMPEL_META[a].rang)
    expect(r).toEqual([...r].sort((a, b) => b - a))
  })
})

describe('Warteliste', () => {
  const basis = {
    id: 'w1', pflegegrad: '4', region: 'Hanau', bundesland: 'hessen',
    gewuenschte_leistungen: ['demenzbetreuung'], nachricht: null, quelle: 'warteliste',
    name: 'Erika Müller', email: 'e@x.de', telefon: null,
  }

  it('NEU seit 80 h ist ROT und nennt den Grund', () => {
    const e = ausWarteliste({ ...basis, status: 'neu', created_at: vor(80), updated_at: vor(80) }, JETZT)!
    expect(e.ampel).toBe('rot')
    expect(e.art).toBe('warteliste')
    expect(e.hinweis).toBe('Noch nicht kontaktiert')
    expect(e.stundenOffen).toBe(80)
    expect(e.punkte).toBeGreaterThan(0)
    expect(e.wiedervorlage).toBeNull()
    expect(e.kontakt).toBe('e@x.de')
  })

  it('frisch eingegangen ist GRÜN', () => {
    const e = ausWarteliste({ ...basis, status: 'neu', created_at: vor(2), updated_at: vor(2) }, JETZT)!
    expect(e.ampel).toBe('gruen')
  })

  it('Kunde und Abgelehnt tauchen nicht auf', () => {
    expect(ausWarteliste({ ...basis, status: 'aktiviert', created_at: vor(99), updated_at: vor(99) }, JETZT)).toBeNull()
    expect(ausWarteliste({ ...basis, status: 'abgemeldet', created_at: vor(99), updated_at: vor(99) }, JETZT)).toBeNull()
  })

  it('spätere Stufe bekommt eine Wiedervorlage und das Stufen-Label', () => {
    const e = ausWarteliste({ ...basis, status: 'kontaktiert', created_at: vor(200), updated_at: vor(100) }, JETZT)!
    expect(e.stufeLabel).toBe('Kontaktiert')
    expect(e.wiedervorlage).not.toBeNull()
    expect(e.ampel).toBe('rot') // 2 Tage Frist + 100 h ohne Bearbeitung
  })
})

describe('Bewerbung', () => {
  it('NEU seit 50 h ist ORANGE, Aufgabe steht dabei', () => {
    const e = ausBewerbung({ id: 'b1', name: 'Denise', email: 'd@x.de', status: 'new', created_at: vor(50), updated_at: vor(50) }, JETZT)!
    expect(e.art).toBe('bewerbung')
    expect(e.ampel).toBe('orange')
    expect(e.stufeLabel).toBe('Neu')
    expect(e.hinweis).toMatch(/sichten/i)
    expect(e.ziel).toBe('/admin/applications')
  })

  it('Endzustände tauchen nicht auf', () => {
    for (const status of ['converted', 'lost']) {
      expect(ausBewerbung({ id: 'x', status, created_at: vor(99) }, JETZT)).toBeNull()
    }
  })

  it('gesetzte Wiedervorlage steuert die Ampel', () => {
    const e = ausBewerbung({ id: 'b2', status: 'contacted', created_at: vor(500), updated_at: vor(400), follow_up_date: '2026-09-12' }, JETZT)!
    expect(e.wiedervorlage).toBe('2026-09-12T00:00:00.000Z')
    expect(e.ampel).toBe('gelb')
  })
})

describe('Kundenanfrage', () => {
  it('NEU seit 100 h ist ROT', () => {
    const e = ausAnfrage({ id: 'a1', name: 'Ana', phone: '069', status: 'new', source: 'rueckruf', created_at: vor(100) }, JETZT)!
    expect(e.ampel).toBe('rot')
    expect(e.hinweis).toContain('rueckruf')
    expect(e.ziel).toBe('/mis/crm')
  })

  it('kontaktiert ohne Wiedervorlage: keine Uhr, aber sichtbarer Hinweis', () => {
    const e = ausAnfrage({ id: 'a2', status: 'contacted', created_at: vor(300) }, JETZT)!
    expect(e.followUp).toBe('keine')
    expect(e.hinweis).toMatch(/Ohne Wiedervorlage/)
  })

  it('Endzustände (converted/lost) tauchen nicht auf', () => {
    expect(ausAnfrage({ id: 'a3', status: 'converted', created_at: vor(10) }, JETZT)).toBeNull()
    expect(ausAnfrage({ id: 'a4', status: 'lost', created_at: vor(10) }, JETZT)).toBeNull()
  })
})

describe('Sortierung und Zählung', () => {
  const e = (id: string, ampel: any, stundenOffen: number, art: any = 'bewerbung'): PosteingangEintrag => ({
    id, art, name: id, kontakt: null, stufe: 'neu', stufeLabel: 'Neu', stufeFarbe: '#000',
    eingang: null, zuletzt: null, wiedervorlage: null,
    followUp: ampel === 'rot' ? 'dringend' : ampel === 'orange' ? 'eskalation' : ampel === 'gelb' ? 'erinnerung' : 'keine',
    ampel, stundenOffen, punkte: 0, hinweis: '', ziel: '/x',
  })

  it('rot zuerst, innerhalb der Farbe der ältere Lead', () => {
    const liste = [e('gruen', 'gruen', 200), e('rot-jung', 'rot', 80), e('gelb', 'gelb', 30), e('rot-alt', 'rot', 300)]
    expect(sortierePosteingang(liste).map(x => x.id)).toEqual(['rot-alt', 'rot-jung', 'gelb', 'gruen'])
  })

  it('sortiert eine Kopie', () => {
    const liste = [e('a', 'gruen', 1), e('b', 'rot', 2)]
    sortierePosteingang(liste)
    expect(liste.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('zählt je Ampel und je Art', () => {
    const z = zaehlePosteingang([e('1', 'rot', 90), e('2', 'rot', 80), e('3', 'gelb', 30, 'warteliste'), e('4', 'gruen', 1, 'anfrage')])
    expect(z.rot).toBe(2); expect(z.gelb).toBe(1); expect(z.gesamtOffen).toBe(4)
    expect(z.jeArt).toEqual({ warteliste: 1, bewerbung: 2, anfrage: 1 })
    expect(z.dringend).toBe(2)
  })

  it('Satz für die Kopfzeile', () => {
    expect(posteingangSatz(zaehlePosteingang([]))).toBe('Keine offenen Leads.')
    expect(posteingangSatz(zaehlePosteingang([e('1', 'gruen', 1)]))).toBe('1 offen, alle im Zeitplan.')
    expect(posteingangSatz(zaehlePosteingang([e('1', 'rot', 90), e('2', 'gelb', 30)]))).toBe('2 offen — 1 dringend, 1 zur Erinnerung.')
  })
})
