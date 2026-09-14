/**
 * Block 34 — der PATCH-Zweig kannte den Budgetriegel nicht
 *
 * BEFUND 1 (14.09.2026)
 *
 * `PATCH /api/einsatzplanung` prüfte Einsatzfreigabe, Klientenfreigabe und
 * Abwesenheit — `pruefeBudget` kam im ganzen Zweig nicht vor. Der Riegel,
 * den Block 33 im POST an `abrechnung.schreiben` gebunden hatte, ließ sich
 * damit schlicht umgehen:
 *
 *   1. Einsatz für einen Klienten mit freiem Budget anlegen, danach
 *      `client_id` auf einen erschöpften Klienten ändern.
 *   2. `service_type` von einem ungedeckelten Topf (§36, privat) auf
 *      `entlastung` ziehen.
 *   3. `start_time`/`end_time` ausweiten — mehr Verbrauch, keine Prüfung.
 *
 * BEFUND 2
 *
 * `requireStaff` verlangte für JEDES Verb `einsatz.lesen`, mit dem
 * Kommentar „Einsatzplanung gehoert zum Einsatzgeschehen: admin/superadmin
 * und pdl". Der Kommentar beschrieb eine Absicht, die der Code nicht
 * umsetzte: `einsatz.lesen` tragen auch `qm` und `buchhaltung` — beide
 * konnten Einsätze anlegen und ändern, obwohl ihre Rollenbeschreibung das
 * ausschließt.
 *
 * Live nicht eingetreten: 0 qm-, 0 buchhaltung-, 0 pdl-Konten.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ROLLEN_MATRIX } from '@/lib/auth/rollen'

const REPO = path.resolve(__dirname, '../..')
const roh = readFileSync(path.join(REPO, 'app/api/einsatzplanung/route.ts'), 'utf-8')
/** Ohne Kommentare — die Datei zitiert ihre eigenen Befunde. */
const code = roh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Der PATCH-Zweig allein. */
const patchZweig = code.slice(code.indexOf('export const PATCH'))
/** Der POST-Zweig allein. */
const postZweig = code.slice(code.indexOf('export const POST'), code.indexOf('export const PATCH'))

describe('Rollenmatrix — die Ausgangslage', () => {
  it('gibt qm und buchhaltung einsatz.lesen, aber kein einsatz.schreiben', () => {
    for (const rolle of ['qm', 'buchhaltung'] as const) {
      expect(ROLLEN_MATRIX[rolle]).toContain('einsatz.lesen')
      expect(ROLLEN_MATRIX[rolle], `${rolle} darf Einsätze nicht schreiben`).not.toContain('einsatz.schreiben')
    }
  })

  it('gibt pdl beide Rechte', () => {
    expect(ROLLEN_MATRIX.pdl).toContain('einsatz.lesen')
    expect(ROLLEN_MATRIX.pdl).toContain('einsatz.schreiben')
  })
})

describe('Tür der Einsatzplanung', () => {
  it('trennt Lesen und Schreiben', () => {
    expect(code).toMatch(/berechtigung: 'einsatz\.lesen' \| 'einsatz\.schreiben'/)
  })

  it('lässt GET beim Leserecht', () => {
    const getZweig = code.slice(code.indexOf('export const GET'), code.indexOf('export const POST'))
    expect(getZweig).toMatch(/requireStaff\(supabase\)/)
  })

  it('verlangt für POST das Schreibrecht', () => {
    expect(postZweig).toMatch(/requireStaff\(supabase, 'einsatz\.schreiben'\)/)
  })

  it('verlangt für PATCH das Schreibrecht', () => {
    expect(patchZweig).toMatch(/requireStaff\(supabase, 'einsatz\.schreiben'\)/)
  })
})

describe('PATCH — Budgetriegel', () => {
  it('prüft überhaupt das Budget', () => {
    // DER Befund: pruefeBudget kam im PATCH-Zweig nicht vor.
    expect(patchZweig).toMatch(/pruefeBudget\(/)
  })

  it('prüft gegen Bestand UND Änderung, nicht nur gegen die Änderung', () => {
    // Sonst liefe ein reiner Klientenwechsel gegen den alten Klienten.
    expect(patchZweig).toMatch(/updates\.client_id \?\? bestand\?\.client_id/)
    expect(patchZweig).toMatch(/updates\.service_type \?\? bestand\?\.service_type/)
  })

  it('liest service_type aus dem Bestand mit', () => {
    // Der Budgettopf hängt daran; ohne die Spalte ist die Prüfung blind.
    expect(patchZweig).toMatch(/service_type'\)/)
  })

  it('löst die Prüfung auch bei reiner service_type-Änderung aus', () => {
    // Weg 2 des Befunds: ungedeckelter Topf → entlastung. Ohne diese
    // Bedingung käme die Prüfung nie an.
    expect(patchZweig).toMatch(/updates\.client_id \|\| updates\.service_type/)
  })

  it('verlangt abrechnung.schreiben zum Übersteuern — wie der POST', () => {
    expect(patchZweig).toMatch(/quellenDuerfen\(auth\.quellen, 'abrechnung\.schreiben'\)/)
    expect(patchZweig).toMatch(/private Forderung/)
  })

  it('vermerkt den gebrochenen Riegel als Übersteuerung', () => {
    expect(patchZweig).toMatch(/Budgetsperre übersteuert/)
  })

  it('trennt Sperr- und Warnfall', () => {
    expect(patchZweig).toMatch(/\}\s*else if \(budgetCheck\.warnung\)/)
  })

  it('antwortet mit 422 ohne und 403 bei fehlendem Recht', () => {
    expect(patchZweig).toMatch(/status: 422/)
    expect(patchZweig).toMatch(/status: 403/)
  })
})

describe('POST und PATCH tragen dieselbe Regel', () => {
  it('beide verlangen abrechnung.schreiben für die Budget-Übersteuerung', () => {
    for (const [name, zweig] of [['POST', postZweig], ['PATCH', patchZweig]] as const) {
      expect(zweig, `${name} ohne abrechnung.schreiben-Prüfung`)
        .toMatch(/quellenDuerfen\(auth\.quellen, 'abrechnung\.schreiben'\)/)
    }
  })

  it('beide halten die übrigen Riegel bei personal.schreiben', () => {
    for (const [name, zweig] of [['POST', postZweig], ['PATCH', patchZweig]] as const) {
      expect(zweig, `${name} ohne personal.schreiben-Prüfung`)
        .toMatch(/quellenDuerfen\(auth\.quellen, 'personal\.schreiben'\)/)
    }
  })

  it('beide vermerken die Übersteuerung im Klartext', () => {
    for (const [name, zweig] of [['POST', postZweig], ['PATCH', patchZweig]] as const) {
      expect(zweig, `${name} ohne Übersteuerungsvermerk`).toMatch(/Budgetsperre übersteuert/)
    }
  })
})
