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
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  if (start === -1) throw new Error(`Funktion ${name} nicht in der Migration gefunden`)

  // Öffnendes Dollar-Quote nach dem AS suchen.
  const asIdx = sql.indexOf('AS $', start)
  if (asIdx === -1) throw new Error(`Kein Funktionskoerper (AS $…$) fuer ${name}`)
  const tagEnde = sql.indexOf('$', asIdx + 4)
  const tag = sql.slice(asIdx + 3, tagEnde + 1)   // z. B. "$fn$" oder "$$"

  const ende = sql.indexOf(`${tag};`, tagEnde + 1)
  if (ende === -1) throw new Error(`Funktionsende ${tag}; fuer ${name} nicht gefunden`)

  return sql.slice(start, ende + tag.length + 1)
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
