/**
 * Block 33 — die Budgetsperre zu übersteuern ist eine Geldentscheidung
 *
 * BEFUND (14.09.2026)
 *
 * `force_override` in POST /api/einsatzplanung hing für ALLE Riegel an
 * `personal.schreiben` — mit der Begründung „Übersteuern einer fehlenden
 * Einsatzfreigabe ist eine Personalentscheidung". Für Einsatz- und
 * Klientenfreigabe stimmt das. Für das Budget nicht:
 *
 * Was am Budgetdeckel hängt, ist Geld. Der Überschuss wandert im
 * Rechnungsweg auf den PRIVATANTEIL des Klienten
 * (lib/billing/core/invoice-engine.ts, `neuerPrivatAnteil`). Ein
 * übersteuerter Deckel erzeugt also eine private Forderung.
 *
 * `pdl` trägt `personal.schreiben`, aber ausdrücklich NICHT
 * `abrechnung.schreiben`. Die Rollenmatrix sagt wörtlich: „Rechnungen darf
 * sie einsehen …, aber nicht erzeugen oder ändern." Über diesen Weg konnte
 * sie genau das auslösen, was ihr verwehrt ist.
 *
 * Zweiter Befund: der übersteuerte BLOCK landete nur als gewöhnliche
 * Auslastungswarnung im Audit-Trail („Budget zu 97 % ausgeschöpft"). Ob
 * jemand eine Sperre gebrochen oder bloß eine Warnung gesehen hat, war im
 * Nachhinein nicht unterscheidbar.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ROLLEN_MATRIX } from '@/lib/auth/rollen'

const REPO = path.resolve(__dirname, '../..')
const quelle = readFileSync(path.join(REPO, 'app/api/einsatzplanung/route.ts'), 'utf-8')

/** Quelltext ohne Kommentare — die Datei zitiert ihre eigenen Befunde. */
const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('Rollenmatrix — die Ausgangslage des Befunds', () => {
  it('gibt der PDL personal.schreiben', () => {
    expect(ROLLEN_MATRIX.pdl).toContain('personal.schreiben')
  })

  it('verwehrt der PDL abrechnung.schreiben', () => {
    // Genau diese Lücke machte den Befund aus: ein Recht, das sie hat,
    // öffnete eine Tür, die ihr verschlossen sein soll.
    expect(ROLLEN_MATRIX.pdl).not.toContain('abrechnung.schreiben')
    expect(ROLLEN_MATRIX.pdl).toContain('abrechnung.lesen')
  })

  it('gibt der Buchhaltung abrechnung.schreiben, aber kein personal.schreiben', () => {
    // Die Gegenprobe: die beiden Rechte sind tatsächlich verschiedene
    // Zuständigkeiten und nicht bloß zwei Namen für dasselbe.
    expect(ROLLEN_MATRIX.buchhaltung).toContain('abrechnung.schreiben')
    expect(ROLLEN_MATRIX.buchhaltung).not.toContain('personal.schreiben')
  })

  it('lässt admin und superadmin beides', () => {
    for (const rolle of ['admin', 'superadmin'] as const) {
      expect(ROLLEN_MATRIX[rolle]).toContain('personal.schreiben')
      expect(ROLLEN_MATRIX[rolle]).toContain('abrechnung.schreiben')
    }
  })

  it('gibt keiner Kundenrolle eines der beiden Rechte', () => {
    for (const rolle of ['kunde', 'engel', 'fahrer'] as const) {
      expect(ROLLEN_MATRIX[rolle]).toHaveLength(0)
    }
  })
})

describe('POST /api/einsatzplanung — Budgetsperre übersteuern', () => {
  it('verlangt abrechnung.schreiben, nicht nur personal.schreiben', () => {
    expect(code).toContain("quellenDuerfen(auth.quellen, 'abrechnung.schreiben')")
  })

  it('weist mit 403 ab und nennt den Grund im Klartext', () => {
    expect(code).toMatch(/private Forderung/)
    expect(code).toMatch(/abrechnung\.schreiben/)
    expect(code).toMatch(/status: 403/)
  })

  it('lässt die übrigen Riegel bei personal.schreiben', () => {
    // Die Einsatz- und Klientenfreigabe zu übersteuern bleibt eine
    // Personalentscheidung — die Verschärfung darf nicht alles einsammeln.
    expect(code).toContain("body.force_override && !quellenDuerfen(auth.quellen, 'personal.schreiben')")
  })

  it('vermerkt den gebrochenen Riegel als Übersteuerung, nicht als Warnung', () => {
    // Vorher stand im Audit-Trail nur „Budget zu 97 % ausgeschöpft".
    expect(code).toContain('Budgetsperre übersteuert')
  })

  it('trennt den Sperr- vom Warnfall', () => {
    // `else if`: eine blosse Auslastungswarnung darf nicht als
    // Übersteuerung protokolliert werden, sonst ist der Trail wertlos.
    expect(code).toMatch(/\}\s*else if \(budgetCheck\.warnung\)/)
  })

  it('bietet die Übersteuerung nur mit dem nötigen Recht an', () => {
    // Der Hinweistext darf nicht zu etwas einladen, das dann 403 gibt.
    expect(code).toMatch(/force_override: true kann die Zuweisung erzwungen werden — dafür wird abrechnung\.schreiben benötigt/)
  })
})

describe('Audit-Trail', () => {
  it('protokolliert die übersteuerten Prüfungen', () => {
    expect(code).toContain('overridden_checks: warnungen')
    expect(code).toContain("action: 'force_override'")
  })
})
