/**
 * Hilfsmittel für Migrations-Tests: einzelne SQL-Bausteine aus einer
 * Migrationsdatei herausschneiden.
 *
 * Warum nicht die ganze Migration einspielen? Die grossen Migrationen dieses
 * Repos (Expansion Deutschland, Einsatzplanung) bringen jeweils 700+ Zeilen
 * Tabellen, Policies und Seeds mit, die ein Funktionstest nicht braucht. Die
 * getestete Funktion soll aber WORTGLEICH die aus der Migration sein — sonst
 * testet man eine Kopie und nicht den Produktionsstand.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

export function liesMigration(datei: string): string {
  return readFileSync(join(MIGRATIONS_DIR, datei), 'utf8')
}

/**
 * Schneidet `CREATE OR REPLACE FUNCTION public.<name>( … $tag$;` aus.
 * Unterstützt die im Repo verwendeten Dollar-Quotes $fn$ und $$.
 *
 * @param sql   kompletter Dateiinhalt
 * @param name  Funktionsname ohne Schema
 */
export function extrahiereFunktion(sql: string, name: string): string {
  // `public.` ist optional: die Personalmanagement-Migration legt ihre
  // Trigger-Funktionen ohne Schemapraefix an (`CREATE OR REPLACE FUNCTION
  // check_doppelbelegung()`), waehrend die neueren Migrationen es setzen.
  // Ohne diese Nachsicht muesste jede Suite ihren eigenen Ausschneider
  // mitbringen — und genau daran haengt, ob sie die Funktion aus der
  // Migration prueft oder eine Abschrift davon.
  const muster = new RegExp(
    `CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\s*\\(`
  )
  const treffer = muster.exec(sql)
  if (!treffer) throw new Error(`Funktion ${name} nicht in der Migration gefunden`)
  const start = treffer.index

  // Öffnendes Dollar-Quote nach dem AS suchen.
  const asIdx = sql.indexOf('AS $', start)
  if (asIdx === -1) throw new Error(`Kein Funktionskoerper (AS $…$) fuer ${name}`)
  const tagEnde = sql.indexOf('$', asIdx + 4)
  const tag = sql.slice(asIdx + 3, tagEnde + 1)   // z. B. "$fn$" oder "$$"

  // Schliessendes Dollar-Quote suchen — und danach das Semikolon.
  //
  // Die beiden Schreibweisen im Repo unterscheiden sich genau hier:
  //   … $$;                       (neuere Migrationen, Sprache steht oben)
  //   … $$ LANGUAGE plpgsql;      (Personalmanagement-Migration)
  // Wer nur nach `$$;` sucht, findet in der zweiten Form das Ende einer
  // ganz anderen, viel spaeteren Funktion und schneidet stillschweigend
  // einen zu grossen Block heraus. Deshalb: Tag suchen, dann Semikolon.
  const schluss = sql.indexOf(tag, tagEnde + 1)
  if (schluss === -1) throw new Error(`Funktionsende ${tag} fuer ${name} nicht gefunden`)
  const semikolon = sql.indexOf(';', schluss + tag.length)
  if (semikolon === -1) throw new Error(`Kein Semikolon nach dem Funktionsende von ${name}`)

  return sql.slice(start, semikolon + 1)
}

/** Wie extrahiereFunktion, aber direkt aus einer Migrationsdatei. */
export function funktionAusMigration(datei: string, name: string): string {
  return extrahiereFunktion(liesMigration(datei), name)
}

/**
 * Schneidet die ausführbaren Anweisungen einer reinen Daten-Migration heraus
 * (alles zwischen `BEGIN;` und `COMMIT;`), ohne den Kommentarkopf.
 */
export function transaktionsInhalt(datei: string): string {
  const sql = liesMigration(datei)
  const start = sql.indexOf('\nBEGIN;')
  const ende = sql.indexOf('\nCOMMIT;', start)
  if (start === -1 || ende === -1) {
    throw new Error(`Kein BEGIN;/COMMIT;-Block in ${datei}`)
  }
  return sql.slice(start + '\nBEGIN;'.length, ende)
}

/**
 * Schneidet `CREATE TABLE [IF NOT EXISTS] public.<name> ( … );` aus.
 *
 * Der Klammerstand wird mitgezaehlt, damit verschachtelte Ausdruecke
 * (CHECK (x IN (…)), GENERATED ALWAYS AS (…)) nicht vorzeitig beenden.
 * Dollar-Quotes kommen in Tabellendefinitionen nicht vor.
 */
export function extrahiereTabelle(sql: string, name: string): string {
  // `public.` ist optional: aeltere Migrationen (z. B.
  // 20260812120000_sepa_mandate_and_mahnung.sql) legen ihre Tabellen ohne
  // Schemapraefix an.
  const muster = new RegExp(
    `CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${name}\\s*\\(`, 'i'
  )
  const treffer = muster.exec(sql)
  if (!treffer) throw new Error(`Tabelle ${name} nicht in der Migration gefunden`)

  const start = treffer.index
  let i = treffer.index + treffer[0].length - 1 // auf der oeffnenden Klammer
  let tiefe = 0
  let inHochkomma = false
  for (; i < sql.length; i++) {
    const z = sql[i]
    if (inHochkomma) { if (z === "'") inHochkomma = false; continue }
    if (z === "'") { inHochkomma = true; continue }
    if (z === '(') tiefe++
    else if (z === ')') {
      tiefe--
      if (tiefe === 0) {
        const semikolon = sql.indexOf(';', i)
        return sql.slice(start, semikolon + 1)
      }
    }
  }
  throw new Error(`Tabellenende fuer ${name} nicht gefunden`)
}

/** Wie extrahiereTabelle, aber direkt aus einer Migrationsdatei. */
export function tabelleAusMigration(datei: string, name: string): string {
  return extrahiereTabelle(liesMigration(datei), name)
}

/**
 * Schneidet den n-ten anonymen `DO $$ … $$;`-Block einer Migration aus
 * (1-basiert). Fuer Migrationen, deren Wirkung in einem DO-Block steckt —
 * etwa der RESTRICTIVE-org_fence-Generator aus Phase 3.
 */
export function doBlockAusMigration(datei: string, nummer = 1): string {
  const sql = liesMigration(datei)
  let position = 0
  for (let n = 0; n < nummer; n++) {
    const start = sql.indexOf('DO $$', position)
    if (start === -1) throw new Error(`DO-Block ${nummer} nicht in ${datei} gefunden`)
    const ende = sql.indexOf('$$;', start + 5)
    if (ende === -1) throw new Error(`Ende des DO-Blocks ${nummer} in ${datei} nicht gefunden`)
    if (n === nummer - 1) return sql.slice(start, ende + 3)
    position = ende + 3
  }
  throw new Error(`DO-Block ${nummer} nicht in ${datei} gefunden`)
}
