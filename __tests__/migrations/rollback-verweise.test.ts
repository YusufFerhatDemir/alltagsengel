/**
 * Migrationsköpfe: der Rollback-Verweis muss auf eine existierende Datei zeigen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (28.08.2026, beim Aufbau der DiPA-Selbstzahler-Kette gefunden):
 * Fünf Migrationen nannten im Kopf unter `-- Rollback:` einen Dateinamen,
 * den es nicht gibt. Vier davon waren Zahlendreher im Zeitstempel — die
 * Rollback-Datei lag daneben, nur unter anderem Namen:
 *
 *   20260808120000_expansion_review_fixes         → …120002 statt …120003
 *   20260818030000_wunddokumentation              → …010001 statt …030001
 *   20260907000100_coach_selbstzahler             → …000001 statt …000101
 *   20260908020000_rls_abrechnungsdaten…          → …000001 statt …020001
 *
 * Warum das mehr ist als ein Tippfehler: Der Verweis wird genau einmal
 * gebraucht — im Störfall, wenn eine gerade angewendete Migration zurück
 * muss. Wer dann `cat supabase/migrations/<genannter Name>` tippt, bekommt
 * „No such file" und muss unter Zeitdruck raten, ob es überhaupt einen
 * Rollback gibt oder ob er von Hand zu schreiben ist. Das ist der
 * schlechteste Moment für diese Frage.
 *
 * Die fünfte ist ein echter, anderer Fall: dort verspricht der Kopf einen
 * Rollback, der nie geschrieben wurde. Er steht unten in OHNE_ROLLBACK mit
 * Grund — nicht, weil das in Ordnung wäre, sondern damit diese Prüfung
 * nicht dauerhaft rot steht und irgendwann mitsamt den echten roten Zeilen
 * daneben überlesen wird.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { MIGRATIONS_DIR } from '../helpers/sql-extract'

/**
 * Migrationen, deren Kopf einen Rollback nennt, den es NICHT gibt.
 * Jeder Eintrag ist eine offene Schuld, kein Freibrief.
 */
const OHNE_ROLLBACK: Record<string, string> = {
  '20260921050000_archive_columns_medical_modules.sql':
    'Der Kopf verspricht 20260921050001_rollback_… — die Datei wurde nie '
    + 'geschrieben. Ein Rollback müsste archiviert_am von drei Tabellen '
    + 'entfernen UND die vorherige Werteliste der beiden '
    + 'pflege_audit_log-CHECKs wiederherstellen; diese alte Werteliste steht '
    + 'in der Migration nicht drin und ist aus ihr allein nicht rekonstruierbar. '
    + 'Deshalb hier benannt statt geraten.',
}

/** `-- Rollback: <datei>.sql` im Kopf — die Schreibweise des Repos. */
const VERWEIS = /^--\s*Rollback:\s*([0-9]{14}_[A-Za-z0-9_]+\.sql)\s*$/m

function migrationen(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(d => d.endsWith('.sql'))
    .sort()
}

describe('Rollback-Verweise in Migrationsköpfen', () => {
  const alle = migrationen()

  it('findet überhaupt Migrationen (Gegenprobe gegen einen leeren Scan)', () => {
    expect(alle.length).toBeGreaterThan(200)
  })

  it('erkennt in mindestens 50 Migrationen einen Rollback-Verweis', () => {
    // Ohne diese Zeile wäre die Prüfung unten auch dann grün, wenn das
    // Muster nicht mehr greift und schlicht nichts geprüft wird.
    const mitVerweis = alle.filter(d => VERWEIS.test(readFileSync(join(MIGRATIONS_DIR, d), 'utf8')))
    expect(mitVerweis.length).toBeGreaterThanOrEqual(50)
  })

  it('jeder genannte Rollback existiert auch', () => {
    const tot: string[] = []
    for (const datei of alle) {
      const treffer = VERWEIS.exec(readFileSync(join(MIGRATIONS_DIR, datei), 'utf8'))
      if (!treffer) continue
      if (existsSync(join(MIGRATIONS_DIR, treffer[1]))) continue
      if (OHNE_ROLLBACK[datei]) continue
      tot.push(`${datei} → ${treffer[1]}`)
    }
    expect(
      tot,
      'Migrationskopf nennt eine Rollback-Datei, die es nicht gibt. Im Störfall '
      + 'läuft das auf „No such file" hinaus. Entweder den Namen berichtigen, den '
      + 'Rollback schreiben — oder mit Grund in OHNE_ROLLBACK eintragen.',
    ).toEqual([])
  })

  it('OHNE_ROLLBACK enthält keine Karteileichen', () => {
    const erledigt = Object.keys(OHNE_ROLLBACK).filter(datei => {
      const pfad = join(MIGRATIONS_DIR, datei)
      if (!existsSync(pfad)) return true
      const treffer = VERWEIS.exec(readFileSync(pfad, 'utf8'))
      // Kein Verweis mehr, oder der Verweis stimmt inzwischen → Eintrag weg.
      return !treffer || existsSync(join(MIGRATIONS_DIR, treffer[1]))
    })
    expect(erledigt, 'Eintrag in OHNE_ROLLBACK ist erledigt und gehört entfernt.').toEqual([])
  })

  it('die DiPA-Migrationen tragen alle einen auflösbaren Rollback-Verweis', () => {
    // Enger Blick auf das Modul, um das es hier geht: Für den PflegeCoach
    // sind vier Migrationen live, jede mit Rollback-Datei. Fiele eine davon
    // aus, wäre der DiPA-Teil des Schemas nicht mehr zurücknehmbar.
    const dipa = alle.filter(d => /coach|dipa/i.test(d) && !d.includes('rollback'))
    expect(dipa.length).toBeGreaterThanOrEqual(4)
    for (const datei of dipa) {
      const treffer = VERWEIS.exec(readFileSync(join(MIGRATIONS_DIR, datei), 'utf8'))
      expect(treffer, `${datei} nennt gar keinen Rollback.`).not.toBeNull()
      expect(
        existsSync(join(MIGRATIONS_DIR, treffer![1])),
        `${datei} verweist auf ${treffer![1]} — die Datei fehlt.`,
      ).toBe(true)
    }
  })
})
