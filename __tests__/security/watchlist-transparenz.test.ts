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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import {
  setzeUeberwachung, GRUND_MINDESTLAENGE, TRANSPARENZ_HINWEIS,
} from '@/lib/security/watchlist'
import { HOECHSTDAUER_TAGE } from '@/lib/security/befristung'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const KONTO = '5fa1df42-8eb5-416b-abb5-0c85a057e957'
const ORG = '00000000-0000-4000-8000-000460629986'
/**
 * Seit dem 31.08.2026 reicht der Inhalt nicht mehr — die vier Angaben
 * muessen AUFFINDBAR sein, also mit ihrer Marke davor. Vorher stand hier
 * derselbe Text als Fliesstext („Rechtsgrundlage Art. 6 …", ohne
 * Doppelpunkt); er erfuellte die alte Laengenhuerde und liess sich
 * hinterher nicht auswerten. Begruendung in lib/security/befristung.ts.
 */
const GUT = [
  'Zweck: Verdacht auf unbefugte Kontonutzung nach Meldung vom 30.08.2026.',
  'Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO, § 26 Abs. 1 BDSG.',
  'Zeitraum: befristet bis 30.09.2026.',
  'Transparenz: Person am 30.08.2026 mündlich informiert.',
].join('\n')

/** Derselbe Inhalt OHNE Marken — der Stand, der frueher genuegte. */
const GUT_OHNE_MARKEN =
  'Verdacht auf unbefugte Kontonutzung nach Meldung vom 30.08.2026; '
  + 'Rechtsgrundlage Art. 6 Abs. 1 f DSGVO; befristet bis 30.09.2026; '
  + 'Person am 30.08.2026 mündlich informiert.'

type Client = Parameters<typeof setzeUeberwachung>[0]

/**
 * @param bestand die Zeile, die `security_watchlist` zu diesem Konto
 *   zurueckgibt. `null` heisst „es gibt noch keinen Eintrag".
 */
function fake(bestand: Record<string, unknown> | null = null) {
  const geschrieben: Record<string, unknown>[] = []
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.operation === 'insert' || a.operation === 'update') {
      geschrieben.push(a.payload as Record<string, unknown>)
      return { data: { id: 'wl-1' } }
    }
    return { data: bestand }
  })
  return { client: f.client as unknown as Client, geschrieben, aufrufe: f.aufrufe }
}

const TAG_MS = 86_400_000
const HEUTE = new Date('2026-09-01T12:00:00Z')
const vorTagen = (n: number) => new Date(HEUTE.getTime() - n * TAG_MS).toISOString()

/** Eine Bestandszeile, wie sie aus PostgREST kaeme. */
const zeile = (felder: Record<string, unknown> = {}) => ({
  id: 'wl-1', user_id: KONTO, organization_id: ORG, aktiv: true,
  alle_ereignisse: true, ohne_sperrfrist: true,
  melde_email: null, email_kontrolle: null, grund: GUT,
  angelegt_von: 'admin-1', created_at: vorTagen(1), ...felder,
})

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

  it('ein Fliesstext mit denselben Angaben, aber ohne Marken, reicht NICHT', async () => {
    // Die Verschaerfung vom 31.08.2026, ausdruecklich festgehalten: der
    // Inhalt ist derselbe, nur nicht auffindbar. Wer sich spaeter auf
    // eine Rechtsgrundlage berufen muss, findet sie in einem Fliesstext
    // nicht wieder — und eine Auswertung ueber alle Eintraege schon gar
    // nicht.
    const { client, geschrieben } = fake()
    const r = await setzeUeberwachung(client, eingabe({ grund: GUT_OHNE_MARKEN }))

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toContain('Zweck')
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
    const { client, geschrieben } = fake(zeile())
    const r = await setzeUeberwachung(client, eingabe({ aktiv: false, grund: '', heute: HEUTE }))
    expect(r.ok).toBe(true)
    expect(geschrieben).toHaveLength(1)
    // `grund` ist NOT NULL — beim Abschalten ohne Text wird der
    // bestehende uebernommen, statt die Spalte mit '' zu ueberschreiben
    // und damit die Begruendung der Massnahme zu loeschen.
    expect(geschrieben[0].grund).toBe(GUT)
  })

  it('Abschalten ohne vorhandenen Eintrag ist eine Eingabefrage, kein Schreibvorgang', async () => {
    const { client, geschrieben } = fake(null)
    const r = await setzeUeberwachung(client, eingabe({ aktiv: false, grund: '', heute: HEUTE }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.art).toBe('eingabe')
    expect(geschrieben).toHaveLength(0)
  })

  it('ein Eingabefehler ist als solcher gekennzeichnet — nicht als Serverfehler', async () => {
    // Die Route beantwortet `eingabe` mit 400 und alles andere mit 500.
    // Ohne diese Unterscheidung meldete eine fehlende Rechtsgrundlage
    // „bei uns ist etwas kaputt".
    const { client } = fake()
    const r = await setzeUeberwachung(client, eingabe({ grund: 'Test', heute: HEUTE }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.art).toBe('eingabe')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Befund 01.09.2026 — eine Frist ohne Rueckweg ist ein Einwegventil
// ═══════════════════════════════════════════════════════════════════════
//
// Die Frist leitete sich aus `created_at` ab, und `created_at` wurde beim
// Upsert nie angefasst. Ein abgelaufener Eintrag liess sich damit nicht
// wieder anordnen: „Einschalten" schrieb `aktiv = true`, die Frist war im
// selben Moment erneut vorbei, und die Oberflaeche meldete trotzdem
// „Alarm ist aktiv".
describe('Wiederanordnung nach Ablauf', () => {
  it('ein abgelaufener Eintrag startet die Frist neu und wirkt wieder', async () => {
    const alt = zeile({ aktiv: true, created_at: vorTagen(HOECHSTDAUER_TAGE + 5) })
    const { client, geschrieben } = fake(alt)

    const r = await setzeUeberwachung(client, eingabe({ heute: HEUTE }))

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fristNeuGestartet).toBe(true)
    expect(r.befristung.abgelaufen).toBe(false)
    expect(r.befristung.restTage).toBe(HOECHSTDAUER_TAGE)
    // Das Anlagedatum wandert mit der Anordnung — sonst bleibt der
    // Eintrag in derselben Sekunde wieder abgelaufen.
    expect(geschrieben[0].created_at).toBe(HEUTE.toISOString())
  })

  it('ein abgeschalteter Eintrag ebenso — Wiedereinschalten IST eine neue Anordnung', async () => {
    const { client, geschrieben } = fake(zeile({ aktiv: false, created_at: vorTagen(40) }))
    const r = await setzeUeberwachung(client, eingabe({ heute: HEUTE }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fristNeuGestartet).toBe(true)
    expect(geschrieben[0].created_at).toBe(HEUTE.toISOString())
  })

  it('eine LAUFENDE Massnahme verlaengert sich beim Bearbeiten NICHT', async () => {
    // Sonst liesse sich eine Ueberwachung durch wiederholtes Speichern
    // still endlos fortsetzen — und genau das soll die Frist verhindern.
    const { client, geschrieben } = fake(zeile({ aktiv: true, created_at: vorTagen(30) }))
    const r = await setzeUeberwachung(client, eingabe({ heute: HEUTE, meldeEmail: 'neu@example.org' }))

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fristNeuGestartet).toBe(false)
    expect(geschrieben[0].created_at).toBeUndefined()
    expect(r.befristung.restTage).toBe(HOECHSTDAUER_TAGE - 30)
  })

  it('Abschalten ruehrt das Anlagedatum nicht an', async () => {
    const { client, geschrieben } = fake(zeile({ aktiv: true, created_at: vorTagen(30) }))
    const r = await setzeUeberwachung(client, eingabe({ aktiv: false, heute: HEUTE }))
    expect(r.ok).toBe(true)
    expect(geschrieben[0].created_at).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Migration 20261024000000 — der Code muss VOR und NACH ihr laufen
// ═══════════════════════════════════════════════════════════════════════
//
// Die Migration setzt einen CHECK: ein aktiver Eintrag OHNE
// `befristet_bis` entsteht dort gar nicht erst. Wer die Spalte nicht
// mitschreibt, bekommt nach dem Anwenden bei jedem Einschalten einen
// 23514 — und der faellt in keinen Spalten-Rueckfall, weil er kein 42703
// ist. Die Verwaltung der Ueberwachungsliste waere ab diesem Moment tot.
describe('Vorbereitung auf die Fristspalte', () => {
  it('beim Einschalten geht befristet_bis mit hinaus', async () => {
    const { client, geschrieben } = fake(null)
    const r = await setzeUeberwachung(client, eingabe({ heute: HEUTE }))
    expect(r.ok).toBe(true)
    const ende = geschrieben[0].befristet_bis as string
    expect(ende).toBeTruthy()
    expect(Date.parse(ende) - HEUTE.getTime()).toBe(HOECHSTDAUER_TAGE * TAG_MS)
  })

  it('fehlt die Spalte, wird ohne sie erneut geschrieben — nicht aufgegeben', async () => {
    // Der Zustand, der am 01.09.2026 LIVE ist: die Migration ist nicht
    // angewendet, security_watchlist kennt `befristet_bis` nicht.
    const geschrieben: Record<string, unknown>[] = []
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.operation === 'insert' || a.operation === 'update') {
        const nutzlast = a.payload as Record<string, unknown>
        geschrieben.push(nutzlast)
        if ('befristet_bis' in nutzlast) {
          return { data: null, error: { message: 'column does not exist', code: '42703' } }
        }
        return { data: { id: 'wl-1' } }
      }
      return { data: null }
    })

    const r = await setzeUeberwachung(f.client as unknown as Client, eingabe({ heute: HEUTE }))

    expect(r.ok).toBe(true)
    expect(geschrieben).toHaveLength(2)
    expect(geschrieben[0]).toHaveProperty('befristet_bis')
    expect(geschrieben[1]).not.toHaveProperty('befristet_bis')
    // Die Spalten aus 20261018000004 duerfen dabei NICHT mit verloren
    // gehen — der frueher zweistufige Rueckfall sprang direkt auf den
    // aeltesten Satz und warf sie weg.
    expect(geschrieben[1]).toHaveProperty('alle_ereignisse')
    expect(geschrieben[1]).toHaveProperty('email_kontrolle')
  })

  it('eine angeordnete Frist zieht das Ende vor, verlaengert es aber nie', async () => {
    const kurz = new Date(HEUTE.getTime() + 10 * TAG_MS).toISOString()
    const lang = new Date(HEUTE.getTime() + 500 * TAG_MS).toISOString()

    const a = fake(zeile({ aktiv: true, created_at: vorTagen(1), befristet_bis: kurz }))
    const ra = await setzeUeberwachung(a.client, eingabe({ heute: HEUTE, meldeEmail: 'x@example.org' }))
    expect(ra.ok).toBe(true)
    if (ra.ok) expect(ra.befristung.restTage).toBe(10)

    const b = fake(zeile({ aktiv: true, created_at: vorTagen(1), befristet_bis: lang }))
    const rb = await setzeUeberwachung(b.client, eingabe({ heute: HEUTE, meldeEmail: 'x@example.org' }))
    expect(rb.ok).toBe(true)
    // Die Hoechstdauer bleibt die Obergrenze: 90 Tage ab created_at,
    // also noch 89 — nicht die 500 aus der Spalte.
    if (rb.ok) expect(rb.befristung.restTage).toBe(HOECHSTDAUER_TAGE - 1)
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

// ═══════════════════════════════════════════════════════════════════════
// Der zweite Weg: die Kommandozeile
// ═══════════════════════════════════════════════════════════════════════
//
// `scripts/security-watchlist.mjs` schreibt direkt per PostgREST und geht
// damit an `setzeUeberwachung` vorbei. Bis zum 01.09.2026 kannte es die
// Regeln nicht: 5 Zeichen Grund statt 40, keine Pflichtangaben, kein
// `watchlist_change`, keine Frist. Der Bestandseintrag vom 30.08.2026 ist
// so entstanden — und live gab es zu ihm keine einzige Protokollzeile.
//
// WAS DIESE GRUPPE PRUEFT UND WAS NICHT
// Sie prueft den GLEICHSTAND der beiden Wege am Quelltext, nicht die
// Wirkung der Regeln — die steht in den Gruppen darueber und in
// lib/security/befristung.test.ts. Ein Skript laesst sich hier nicht
// ausfuehren: es braucht die Live-Datenbank, um ein Konto aufzuloesen.
// Der Gleichstand ist trotzdem pruefenswert, weil genau er auseinander
// gelaufen war.
describe('Kommandozeile und Oberflaeche folgen denselben Regeln', () => {
  const cli = readFileSync(
    join(__dirname, '..', '..', 'scripts', 'security-watchlist.mjs'), 'utf8')
  const lib = readFileSync(
    join(__dirname, '..', '..', 'lib', 'security', 'watchlist.ts'), 'utf8')

  it('dieselbe Mindestlaenge der Begruendung', () => {
    const ausLib = /GRUND_MINDESTLAENGE\s*=\s*(\d+)/.exec(lib)?.[1]
    const ausCli = /GRUND_MINDESTLAENGE\s*=\s*(\d+)/.exec(cli)?.[1]
    expect(ausLib).toBe(String(GRUND_MINDESTLAENGE))
    expect(ausCli).toBe(ausLib)
  })

  it('fragt ebenfalls nach den vier Pflichtangaben', () => {
    expect(cli).toContain('pruefeAngaben')
    // Aus derselben Datei, nicht abgeschrieben — eine zweite Fassung
    // liefe frueher oder spaeter auseinander.
    expect(cli).toMatch(/from '\.\.\/lib\/security\/befristung/)
  })

  it('setzt Anlagedatum und Fristende', () => {
    expect(cli).toMatch(/zeile\.created_at\s*=/)
    expect(cli).toMatch(/zeile\.befristet_bis\s*=/)
    expect(cli).toContain('neuesFristende')
  })

  it('faengt die fehlende Fristspalte ab, statt aufzugeben', () => {
    // Solange 20261024000000 nicht angewendet ist, antwortet PostgREST
    // mit 42703. Ohne diesen Rueckfall schriebe das Skript live gar
    // nichts mehr.
    expect(cli).toContain('42703')
  })

  it('schreibt die Aenderung in die Sicherheitsspur', () => {
    expect(cli).toContain('watchlist_change')
    expect(cli).toContain('log_security_event')
    // Kritisch, wie im Ereigniskatalog — eine abgeschaltete Ueberwachung
    // darf nicht als Randnotiz durchgehen.
    expect(cli).toMatch(/p_severity:\s*'critical'/)
  })

  it('haelt die Huerde NUR vor das Einschalten', () => {
    // Eine Schranke vor dem Abschalten hielte eine laufende Ueberwachung
    // am Leben. Beide Wege muessen hier gleich herum stehen.
    expect(cli).toMatch(/if \(!ausschalten\) \{/)
    expect(lib).toContain('Ausschalten bleibt jederzeit ohne')
  })
})
