// ═══════════════════════════════════════════════════════════════
// KUERZUNG — Lebenszyklus und Mahnbremse
// ═══════════════════════════════════════════════════════════════
//
// Bis zum 29.08.2026 konnte KEIN Codepfad widerspruch_status auf etwas
// anderes als 'offen' setzen. Beide Mahnbremsen fragen dieses Feld nach
// 'widerspruch_eingereicht' und 'nachforderung' ab — sie standen im Code
// und konnten nie greifen. Eine bestrittene Forderung wurde gemahnt.
//
// Diese Datei sichert die drei Stellen, an denen das wieder passieren
// koennte: das Vokabular driftet von der CHECK-Bedingung weg, die
// Bremsliste driftet von den Abfragen weg, oder ein Zustandswechsel
// laesst einen Zeitstempel stehen bzw. raeumt einen falschen ab.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  WIDERSPRUCH_STATUS,
  MAHNBREMSE_STATUS,
  ERLEDIGT_STATUS,
  istMahnbremse,
  istErledigt,
  planeDifferenzPatch,
  type DifferenzBestand,
} from '@/lib/billing/core/differenzen'

const JETZT = '2026-08-29T10:00:00.000Z'
const ACTOR = '11111111-1111-4111-8111-111111111111'

const bestand = (p: Partial<DifferenzBestand> = {}): DifferenzBestand => ({
  differenz_cents: 10000, // 100,00 EUR einbehalten
  widerspruch_status: 'offen',
  widerspruch_at: null,
  nachforderung_cents: 0,
  gutschrift_cents: 0,
  abschreibung_cents: 0,
  ...p,
})

describe('Vokabular gegen die CHECK-Bedingung', () => {
  // Der Wert wird nicht in TypeScript durchgesetzt, sondern von Postgres.
  // Ein hier ergaenzter Zustand, den die CHECK-Bedingung nicht kennt, laesst
  // das UPDATE scheitern — und zwar erst in Produktion, an einer Zeile, die
  // jemand gerade bearbeiten wollte. Deshalb wird gegen die Migration selbst
  // geprueft und nicht gegen eine zweite Liste im Test.
  it('deckt sich mit der CHECK-Liste aus Migration 20260808210000', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260808210000_zahlungen_forderungen_monatsabschluss.sql'),
      'utf-8',
    )
    const block = sql.slice(sql.indexOf('widerspruch_status'))
    const check = block.slice(block.indexOf('CHECK'), block.indexOf('))') + 2)
    const ausSql = [...check.matchAll(/'([a-z_]+)'/g)].map(m => m[1])

    expect(ausSql).toHaveLength(WIDERSPRUCH_STATUS.length)
    expect([...WIDERSPRUCH_STATUS].sort()).toEqual([...ausSql].sort())
  })

  it('Bremsliste und Erledigt-Liste sind Teilmengen des Vokabulars', () => {
    for (const s of [...MAHNBREMSE_STATUS, ...ERLEDIGT_STATUS]) {
      expect(WIDERSPRUCH_STATUS).toContain(s)
    }
  })

  it('bremst genau die bestrittenen Zustaende', () => {
    expect(istMahnbremse('widerspruch_eingereicht')).toBe(true)
    expect(istMahnbremse('nachforderung')).toBe(true)
    // 'offen' bremst bewusst NICHT: eine erfasste, aber unbestrittene Kuerzung
    // ist kein Grund, den Rest der Forderung nicht zu mahnen. Wuerde sie
    // bremsen, stoppte JEDE Kuerzung jede Mahnung — die Bremse waere dann
    // zwar erreichbar, aber unbrauchbar.
    expect(istMahnbremse('offen')).toBe(false)
    expect(istMahnbremse('erledigt')).toBe(false)
    expect(istMahnbremse('abschreibung')).toBe(false)
  })

  it('zaehlt nur die Geld-Endzustaende als erledigt', () => {
    expect(istErledigt('gutschrift')).toBe(true)
    expect(istErledigt('abschreibung')).toBe(true)
    expect(istErledigt('erledigt')).toBe(true)
    // Die Entscheidung der Kasse ist noch keine Erledigung: nach einem
    // abgelehnten Widerspruch steht der Betrag genauso offen wie vorher.
    expect(istErledigt('widerspruch_abgelehnt')).toBe(false)
    expect(istErledigt('widerspruch_anerkannt')).toBe(false)
    expect(istErledigt('offen')).toBe(false)
  })
})

describe('Die Mahnbremse ist ueberhaupt erreichbar', () => {
  it('erlaubt den Wechsel nach widerspruch_eingereicht', () => {
    const plan = planeDifferenzPatch(bestand(), { status: 'widerspruch_eingereicht' }, JETZT, ACTOR)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.patch.widerspruch_status).toBe('widerspruch_eingereicht')
    expect(istMahnbremse(plan.patch.widerspruch_status as string)).toBe(true)
  })

  it('stempelt den Zeitpunkt des Widerspruchs genau einmal', () => {
    const erst = planeDifferenzPatch(bestand(), { status: 'widerspruch_eingereicht' }, JETZT, ACTOR)
    expect(erst.ok && erst.patch.widerspruch_at).toBe(JETZT)

    // Erneutes Setzen darf den Beleg NICHT ueberschreiben: widerspruch_at
    // belegt, wann die Frist gewahrt wurde. Ein spaeterer Zeitstempel liesse
    // eine gewahrte Frist im Nachhinein versaeumt aussehen.
    const nochmal = planeDifferenzPatch(
      bestand({ widerspruch_status: 'widerspruch_eingereicht', widerspruch_at: '2026-01-05T09:00:00.000Z' }),
      { status: 'widerspruch_eingereicht' }, JETZT, ACTOR,
    )
    expect(nochmal.ok && 'widerspruch_at' in nochmal.patch).toBe(false)
  })
})

describe('Erledigungsbeleg', () => {
  it('setzt Zeitpunkt und Urheber beim Abschliessen', () => {
    const plan = planeDifferenzPatch(bestand(), { status: 'abschreibung' }, JETZT, ACTOR)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.patch.resolved_at).toBe(JETZT)
    expect(plan.patch.resolved_by).toBe(ACTOR)
  })

  it('raeumt beide ab, wenn der Vorgang wieder geoeffnet wird', () => {
    // Bliebe der Zeitstempel stehen, truege ein wieder offener Vorgang einen
    // Erledigungsbeleg — ein Nachweis, der das Gegenteil dessen behauptet,
    // was der Zustand sagt.
    const plan = planeDifferenzPatch(
      bestand({ widerspruch_status: 'abschreibung' }),
      { status: 'widerspruch_eingereicht' }, JETZT, ACTOR,
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.patch.resolved_at).toBeNull()
    expect(plan.patch.resolved_by).toBeNull()
  })

  it('fasst die Zeitstempel nicht an, wenn gar kein Zustand uebergeben wird', () => {
    const plan = planeDifferenzPatch(bestand({ widerspruch_status: 'erledigt' }), { notizen: 'Nur eine Notiz' }, JETZT, ACTOR)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect('resolved_at' in plan.patch).toBe(false)
    expect('resolved_by' in plan.patch).toBe(false)
    expect(plan.patch.widerspruch_notes).toBe('Nur eine Notiz')
  })
})

describe('Abweisen statt verwerfen', () => {
  it('weist einen Zustand ausserhalb des Vokabulars ab', () => {
    // Durchgereicht scheiterte er an der CHECK-Bedingung und kaeme als 500
    // zurueck — ein Serverfehler fuer eine Eingabe, die schlicht falsch ist.
    const plan = planeDifferenzPatch(bestand(), { status: 'widerspruch_teilweise' }, JETZT, ACTOR)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.fehler).toContain('widerspruch_teilweise')
  })

  it('weist unbrauchbare Fristen ab und laesst das Loeschen zu', () => {
    expect(planeDifferenzPatch(bestand(), { frist: '30.09.2026' }, JETZT, ACTOR).ok).toBe(false)
    expect(planeDifferenzPatch(bestand(), { frist: 'bald' }, JETZT, ACTOR).ok).toBe(false)
    const gesetzt = planeDifferenzPatch(bestand(), { frist: '2026-09-30' }, JETZT, ACTOR)
    expect(gesetzt.ok && gesetzt.patch.widerspruch_frist).toBe('2026-09-30')
    const geloescht = planeDifferenzPatch(bestand(), { frist: null }, JETZT, ACTOR)
    expect(geloescht.ok).toBe(true)
    if (!geloescht.ok) return
    expect(geloescht.patch.widerspruch_frist).toBeNull()
  })

  it('weist negative und gebrochene Geldbetraege ab', () => {
    expect(planeDifferenzPatch(bestand(), { gutschriftCents: -100 }, JETZT, ACTOR).ok).toBe(false)
    expect(planeDifferenzPatch(bestand(), { gutschriftCents: 10.5 }, JETZT, ACTOR).ok).toBe(false)
    expect(planeDifferenzPatch(bestand(), { gutschriftCents: '100' as unknown as number }, JETZT, ACTOR).ok).toBe(false)
  })

  it('macht aus leerem Notiztext null statt einer leeren Notiz', () => {
    const plan = planeDifferenzPatch(bestand(), { notizen: '   ' }, JETZT, ACTOR)
    expect(plan.ok && plan.patch.widerspruch_notes).toBeNull()
  })

  it('meldet eine leere Eingabe als Fehler statt ein leeres UPDATE zu fahren', () => {
    expect(planeDifferenzPatch(bestand(), {}, JETZT, ACTOR).ok).toBe(false)
  })
})

describe('Geldsumme bleibt in der Kuerzung', () => {
  it('laesst die volle Kuerzung in einem Topf zu', () => {
    const plan = planeDifferenzPatch(bestand(), { abschreibungCents: 10000, status: 'abschreibung' }, JETZT, ACTOR)
    expect(plan.ok).toBe(true)
  })

  it('laesst eine Aufteilung bis zur Kuerzungshoehe zu', () => {
    const plan = planeDifferenzPatch(bestand(), { gutschriftCents: 4000, abschreibungCents: 6000 }, JETZT, ACTOR)
    expect(plan.ok).toBe(true)
  })

  it('weist eine Aufteilung ueber die Kuerzung hinaus ab', () => {
    // Ohne diesen Riegel liesse sich eine Kuerzung von 100 EUR als 100 EUR
    // Gutschrift UND 100 EUR Abschreibung festhalten: der Vorgang saehe
    // erledigt aus, und die verbuchte Summe waere doppelt so hoch wie das
    // Geld, um das es ueberhaupt geht.
    const plan = planeDifferenzPatch(bestand(), { gutschriftCents: 10000, abschreibungCents: 10000 }, JETZT, ACTOR)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.fehler).toContain('200.00')
  })

  it('rechnet den BESTAND mit, nicht nur die Eingabe', () => {
    // Der haeufigere Weg ist zwei getrennte Eingaben: erst Gutschrift, dann
    // Abschreibung. Wer nur die aktuelle Eingabe prueft, laesst genau diesen
    // Weg durch und der Riegel greift nie im Alltag.
    const plan = planeDifferenzPatch(
      bestand({ gutschrift_cents: 8000 }),
      { abschreibungCents: 5000 }, JETZT, ACTOR,
    )
    expect(plan.ok).toBe(false)
  })

  it('behandelt fehlende Bestandsbetraege als 0 und nicht als NaN', () => {
    // Waeren sie NaN, waere jeder Vergleich falsch und der Riegel liesse
    // ausgerechnet die aeltesten Zeilen ungeprueft durch.
    const plan = planeDifferenzPatch(
      bestand({ nachforderung_cents: null, gutschrift_cents: null, abschreibung_cents: null }),
      { abschreibungCents: 10000 }, JETZT, ACTOR,
    )
    expect(plan.ok).toBe(true)
  })
})
