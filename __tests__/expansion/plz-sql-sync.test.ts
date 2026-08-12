// ═══════════════════════════════════════════════════════════════
// TS ↔ SQL: die PLZ-Regeln dürfen nicht auseinanderlaufen
// ═══════════════════════════════════════════════════════════════
// Die Zuordnung PLZ → Bundesland existiert an zwei Orten:
//
//   TypeScript  lib/expansion/plz-bundesland.ts   (Buchungsstrecke, offline)
//   SQL         public.plz_bundesland_regeln      (Trigger, Anerkennungssperre)
//
// TypeScript ist die Quelle, SQL wird daraus generiert. Läuft beides
// auseinander, kann die Oberfläche „keine Kasse" zeigen, während die
// Datenbank die Kassenrechnung durchlässt — oder umgekehrt.
//
// Reparatur bei rotem Test:  npm run generate:plz-sql
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { baueSql, GENERATED_SQL_PATH, sammleRegeln } from '@/scripts/generate-plz-bundesland-sql'
import { bundeslandFuerPlz } from '@/lib/expansion/plz-bundesland'
import { BUNDESLAND_CODES } from '@/lib/expansion/types'

describe('Generierte SQL-Datei', () => {
  it('ist aktuell — sonst: npm run generate:plz-sql', () => {
    const eingecheckt = readFileSync(GENERATED_SQL_PATH, 'utf8')
    expect(eingecheckt).toBe(baueSql())
  })

  it('enthält nur gültige Bundesland-Codes', () => {
    for (const regel of sammleRegeln()) {
      expect(BUNDESLAND_CODES).toContain(regel.bundesland as never)
    }
  })

  it('hat keine doppelten Präfixe', () => {
    const praefixe = sammleRegeln().map(r => r.praefix)
    expect(new Set(praefixe).size).toBe(praefixe.length)
  })

  it('nutzt nur 2-, 3- oder 5-stellige Präfixe', () => {
    for (const regel of sammleRegeln()) {
      expect([2, 3, 5]).toContain(regel.praefix.length)
      expect(regel.praefix).toMatch(/^\d+$/)
    }
  })
})

describe('SQL-Auflösung entspricht der TypeScript-Auflösung', () => {
  // Die SQL-Funktion nimmt den LÄNGSTEN passenden Präfix. Genau das bildet
  // diese Nachbildung ab — damit prüfen wir die Regel, nicht die Datenbank.
  const regeln = sammleRegeln()

  function aufloesungWieSql(plz: string): { code: string; sicher: boolean } | null {
    const treffer = regeln
      .filter(r => plz.startsWith(r.praefix))
      .sort((a, b) => b.praefix.length - a.praefix.length)[0]
    return treffer ? { code: treffer.bundesland, sicher: treffer.sicher } : null
  }

  it('stimmt über den gesamten PLZ-Raum überein', () => {
    const abweichungen: string[] = []

    for (let n = 1000; n <= 99999; n++) {
      const plz = String(n).padStart(5, '0')
      const ts = bundeslandFuerPlz(plz)
      const sql = aufloesungWieSql(plz)

      const tsCode = ts.code ?? null
      const sqlCode = sql?.code ?? null
      const tsSicher = ts.code ? ts.sicher : false
      const sqlSicher = sql?.sicher ?? false

      if (tsCode !== sqlCode || tsSicher !== sqlSicher) {
        abweichungen.push(
          `${plz}: TS=${tsCode}/${tsSicher} ≠ SQL=${sqlCode}/${sqlSicher}`
        )
        if (abweichungen.length > 10) break
      }
    }

    expect(abweichungen).toEqual([])
  })

  it('behandelt die kuratierten Hessen-Grenzfälle in beiden Welten gleich', () => {
    for (const plz of [
      '55246', '55252', '68519', '68623', '69434', '69509',  // Hessen-Exklaven
      '34346', '34414', '65582',                              // nicht Hessen
      '60311', '63739', '36404', '37269',                     // klare Fälle
    ]) {
      const ts = bundeslandFuerPlz(plz)
      const sql = aufloesungWieSql(plz)
      expect(sql?.code).toBe(ts.code)
      expect(sql?.sicher).toBe(ts.sicher)
    }
  })
})
