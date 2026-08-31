/**
 * Überwachung nur offen, nicht verdeckt
 *
 * Die Überwachung eines einzelnen Beschäftigtenkontos zeichnet jede
 * Anmeldung, jedes Gerät und jede IP einer namentlich bekannten Person
 * auf. Das ist keine Systemeinstellung, sondern eine Maßnahme gegen einen
 * Menschen — und die braucht einen Grund, der aufgeschrieben ist, BEVOR
 * sie läuft.
 *
 * Der bestehende Eintrag vom 30.08.2026 lautet „Kontoueberwachung auf
 * Anweisung der Geschaeftsfuehrung (30.08.2026). Alle
 * sicherheitsrelevanten Ereignisse melden." — er benennt, WER es
 * angeordnet hat, aber nicht die Rechtsgrundlage, nicht den Zeitraum und
 * nicht, ob die betroffene Person davon weiß.
 *
 * Code kann den Inhalt einer Begründung nicht prüfen. Er kann aber
 * ausschließen, was sicher zu wenig ist — und den Hinweis an genau die
 * Stelle setzen, an der jemand einschaltet.
 */

import { describe, it, expect, vi } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import {
  setzeUeberwachung, GRUND_MINDESTLAENGE, TRANSPARENZ_HINWEIS,
} from '@/lib/security/watchlist'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const KONTO = '5fa1df42-8eb5-416b-abb5-0c85a057e957'
const ORG = '00000000-0000-4000-8000-000460629986'
const GUT =
  'Verdacht auf unbefugte Kontonutzung nach Meldung vom 30.08.2026; '
  + 'Rechtsgrundlage Art. 6 Abs. 1 f DSGVO; befristet bis 30.09.2026; '
  + 'Person am 30.08.2026 mündlich informiert.'

type Client = Parameters<typeof setzeUeberwachung>[0]

function fake() {
  const geschrieben: unknown[] = []
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.operation === 'insert' || a.operation === 'update') {
      geschrieben.push(a.payload)
      return { data: { id: 'wl-1' } }
    }
    return { data: null }
  })
  return { client: f.client as unknown as Client, geschrieben, aufrufe: f.aufrufe }
}

const eingabe = (felder: Record<string, unknown> = {}) => ({
  userId: KONTO, organizationId: ORG, aktiv: true,
  grund: GUT, angelegtVon: 'admin-1', ...felder,
})

describe('Einschalten verlangt eine tragfaehige Begruendung', () => {
  it('eine zu knappe Begruendung wird abgewiesen — und nichts geschrieben', async () => {
    const { client, geschrieben } = fake()
    const r = await setzeUeberwachung(client, eingabe({ grund: 'Test' }))

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toContain(TRANSPARENZ_HINWEIS)
    expect(geschrieben).toHaveLength(0)
  })

  it('Leerzeichen zaehlen nicht als Begruendung', async () => {
    const { client, geschrieben } = fake()
    const r = await setzeUeberwachung(client, eingabe({ grund: ' '.repeat(80) }))
    expect(r.ok).toBe(false)
    expect(geschrieben).toHaveLength(0)
  })

  it('eine vollstaendige Begruendung geht durch', async () => {
    const { client, geschrieben } = fake()
    const r = await setzeUeberwachung(client, eingabe())
    expect(r.ok).toBe(true)
    expect(geschrieben).toHaveLength(1)
  })

  it('AUSSCHALTEN braucht keine Begruendung — die Schranke gilt nur beim Einschalten', async () => {
    // Eine Huerde vor dem Abschalten waere genau falsch herum: sie
    // hielte eine laufende Ueberwachung am Leben.
    const { client, geschrieben } = fake()
    const r = await setzeUeberwachung(client, eingabe({ aktiv: false, grund: '' }))
    expect(r.ok).toBe(true)
    expect(geschrieben).toHaveLength(1)
  })
})

describe('Der Hinweistext benennt die vier Angaben', () => {
  it('Anlass, Rechtsgrundlage, Zeitraum und Information der Person', () => {
    for (const wort of ['Anlass', 'Rechtsgrundlage', 'Zeitraum', 'informiert']) {
      expect(TRANSPARENZ_HINWEIS).toContain(wort)
    }
  })

  it('schliesst verdeckte Dauerueberwachung ausdruecklich aus', () => {
    expect(TRANSPARENZ_HINWEIS).toMatch(/verdeckte Dauerüberwachung ist\s+ausgeschlossen/)
  })

  it('die Mindestlaenge schliesst nur das sicher Unzureichende aus', () => {
    // Kein Qualitaetsmass — Code kann Inhalt nicht pruefen. Die Schranke
    // faengt „Test", „siehe Mail" und ein Leerzeichen ab, nicht mehr.
    expect(GRUND_MINDESTLAENGE).toBeGreaterThanOrEqual(20)
    expect(GRUND_MINDESTLAENGE).toBeLessThanOrEqual(120)
    expect('Test'.length).toBeLessThan(GRUND_MINDESTLAENGE)
    expect('siehe Mail'.length).toBeLessThan(GRUND_MINDESTLAENGE)
    expect(GUT.length).toBeGreaterThanOrEqual(GRUND_MINDESTLAENGE)
  })
})
