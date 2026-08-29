/**
 * Der Abgleich, den es nicht gab: `PFLEGE_AUDIT_ENTITAET_TYP_WERTE` gegen
 * `pflege_audit_log_typ_check`.
 *
 * BEFUND (29.08.2026, beim Bau der Evaluation aufgefallen): der CHECK in
 * `20260921040000_pflege_audit_log.sql` kannte SIEBEN Werte, die Liste im
 * Anwendungscode FUENFZEHN. Jeder Audit-Eintrag zu einem Medikament, einer
 * Wunddokumentation, einem Sturz-, Fixierungs- oder Lagerungsprotokoll,
 * einem Wund-Assessment, einer Wundbehandlung oder einer
 * FEM-Ueberwachung lief am Constraint auf.
 *
 * Ganz lautlos war es nicht — `logPflegeAktivitaet()` faengt den Fehler
 * und protokolliert ihn —, aber im AUDIT stand der Vorgang nicht. Und ein
 * Audit, das den Vorgang nicht kennt, sieht vollstaendig aus.
 *
 * Diese Suite liest den CHECK aus der MIGRATIONSDATEI, nicht aus einer
 * nachgebauten Liste: eine Nachbildung wuerde beweisen, dass zwei
 * Abschriften uebereinstimmen, nicht dass die Datenbank den Typ kennt.
 * Migration `20260829185500` zieht den CHECK auf den Stand des Codes.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PFLEGE_AUDIT_ENTITAET_TYP_WERTE } from '@/lib/pflege/types'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')

/**
 * Die Werte einer `CHECK (spalte IN ('a','b',…))`-Bedingung aus einer
 * Migrationsdatei — der zuletzt in der Datei stehende gewinnt, weil ein
 * spaeteres `ADD CONSTRAINT` das fruehere ersetzt.
 */
function checkWerte(datei: string, spalte: string): string[] {
  const sql = readFileSync(join(MIGRATIONEN, datei), 'utf8')
  const muster = new RegExp(`CHECK\\s*\\(\\s*${spalte}\\s+IN\\s*\\(([^)]*)\\)`, 'gi')
  const treffer = [...sql.matchAll(muster)]
  if (treffer.length === 0) throw new Error(`Kein CHECK auf ${spalte} in ${datei}`)
  return [...treffer[treffer.length - 1][1].matchAll(/'([^']+)'/g)].map(m => m[1])
}

describe('pflege_audit_log_typ_check gegen den Anwendungscode', () => {
  it('kannte in der Ausgangsmigration nur sieben der Typen (Befund)', () => {
    // Der Befund bleibt als Fall stehen: er ist der Grund, warum es die
    // Nachzugs-Migration gibt, und ohne ihn saehe es aus, als sei die
    // Liste immer schon vollstaendig gewesen.
    const alt = checkWerte('20260921040000_pflege_audit_log.sql', 'entitaet_typ')
    expect(alt).toHaveLength(7)
    expect(alt).not.toContain('medikament')
    expect(alt).not.toContain('wunddokumentation')
  })

  it('kennt nach 20260829185500 jeden Typ, den der Code fuehrt', () => {
    const neu = checkWerte('20260829185500_pflege_massnahmen_evaluation.sql', 'entitaet_typ')
    for (const typ of PFLEGE_AUDIT_ENTITAET_TYP_WERTE) {
      expect(neu, `Typ "${typ}" fehlt im CHECK — der Audit-Eintrag entstuende nicht`)
        .toContain(typ)
    }
  })

  it('fuehrt umgekehrt keinen Typ, den der Code nicht kennt', () => {
    // Die andere Richtung ist genauso wichtig: ein Wert, den nur die
    // Datenbank kennt, ist eine Verabredung ohne Gegenstueck — und beim
    // naechsten Rueckbau des CHECKs faellt niemandem auf, dass er fehlt.
    const neu = checkWerte('20260829185500_pflege_massnahmen_evaluation.sql', 'entitaet_typ')
    for (const typ of neu) {
      expect(PFLEGE_AUDIT_ENTITAET_TYP_WERTE as string[],
        `Typ "${typ}" steht im CHECK, aber nicht in PFLEGE_AUDIT_ENTITAET_TYP_WERTE`)
        .toContain(typ)
    }
  })

  it('stellt den Rollback auf die urspruengliche Liste zurueck', () => {
    const zurueck = checkWerte(
      '20260829185501_rollback_pflege_massnahmen_evaluation.sql', 'entitaet_typ',
    )
    expect(zurueck.sort()).toEqual(
      checkWerte('20260921040000_pflege_audit_log.sql', 'entitaet_typ').sort(),
    )
  })
})
