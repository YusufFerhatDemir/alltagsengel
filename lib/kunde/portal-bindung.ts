// ═══════════════════════════════════════════════════════════════════════
// Block 31 — Bindet jede Tabelle, die das Portal liest, an die Kundin?
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (14.09.2026)
//
// Die 25 Seiten unter /kunde fragen Supabase direkt ab. Keine ruft
// `getUser()`, keine filtert auf `client_id`. Das ist richtig so — die
// Bindung gehoert in die RLS-Policy, nicht in 25 Seiten.
//
// Es heisst aber auch: eine FEHLENDE Policy faellt nicht auf. PostgREST
// beantwortet eine RLS-Verweigerung mit `200 []`, nicht mit einem Fehler.
// Die Seite zeigt dann einen Leerzustand — und niemand merkt, dass Daten
// da waeren.
//
// Genau so lag `pflege_massnahmen`: als einzige der drei
// Pflegedoku-Tabellen ohne Kundenbindung. `/kunde/pflegedoku` zeigte den
// Maßnahmenplan und den Verlauf, aber der Plan blieb leer.
//
// Dieses Modul ist die Bewertung, das Skript daneben die Beschaffung.

/** Ausdruecke, die eine Zeile an die angemeldete Person binden. */
export const BINDUNGS_MUSTER = /auth\.uid\(\)|eigene_client_ids/

export interface PolicyZeile {
  name: string
  permissive: string
  cmd: string
  qual: string
}

export type Einordnung = 'gebunden' | 'offen_beabsichtigt' | 'bekannte_luecke' | 'befund'

export interface Bewertung {
  tabelle: string
  einordnung: Einordnung
  /** Die bindenden Policies — nur bei `gebunden` gefuellt. */
  policies: string[]
  begruendung: string
}

/**
 * Tabellen, die ABSICHTLICH ohne Nutzerbindung lesbar sind.
 *
 * Der Marktplatz ist zum Stoebern da: wer einen Engel buchen will, muss
 * Engel sehen koennen, bevor eine Beziehung zu ihm besteht. Beide tragen
 * live ein ausdrueckliches `SELECT true`.
 *
 * Wer hier etwas eintraegt, behauptet: diese Zeilen duerfen ALLE
 * angemeldeten Nutzer sehen. Fuer Klienten-, Abrechnungs- oder
 * Pflegedaten ist das nie die richtige Antwort.
 */
export const OFFEN_BEABSICHTIGT: ReadonlyMap<string, string> = new Map([
  ['angels', 'Marktplatz-Profile — Kundschaft muss Engel finden koennen, bevor eine Buchung besteht'],
  ['angel_availability', 'Verfuegbarkeit der Marktplatz-Engel — Voraussetzung fuer jede Buchung'],
])

/**
 * Befunde, die erkannt, belegt und eingereicht sind — aber noch auf das
 * Einspielen warten. DDL ist mit dem Dienstschluessel nicht moeglich
 * (42501), Policies gehen nur ueber den SQL-Editor.
 *
 * Sie stehen hier, damit der Lauf nicht dauerhaft rot ist und damit ein
 * NEUER Befund sichtbar bleibt. Sobald die Migration live ist, faellt der
 * Eintrag beim naechsten Lauf von selbst auf `gebunden` — und gehoert
 * dann hier heraus.
 */
export const BEKANNTE_LUECKEN: ReadonlyMap<string, string> = new Map([
  ['pflege_massnahmen', 'Migration 20261120000000_kunde_pflege_massnahmen_select.sql wartet auf Einspielung. Live 0 Zeilen — die Luecke ist latent, nicht eingetreten.'],
])

/**
 * Bindet mindestens eine permissive Policy diese Tabelle lesend an die
 * angemeldete Person?
 *
 * Nur `SELECT` und `ALL` zaehlen: eine `UPDATE`-Policy mit
 * `user_id = auth.uid()` bindet zwar, erlaubt aber kein Lesen. Genau
 * dieser Unterschied entscheidet, ob die Seite Daten sieht.
 */
export function bindendePolicies(policies: readonly PolicyZeile[]): string[] {
  return policies
    .filter(p => p.permissive === 'PERMISSIVE')
    .filter(p => p.cmd === 'SELECT' || p.cmd === 'ALL')
    .filter(p => BINDUNGS_MUSTER.test(p.qual))
    .map(p => p.name)
}

/**
 * Ordnet eine vom Portal gelesene Tabelle ein.
 *
 * Reihenfolge ist Absicht: eine tatsaechlich vorhandene Bindung schlaegt
 * jeden Listeneintrag. Waere es umgekehrt, verdeckte eine veraltete
 * Ausnahme eine Policy, die laengst da ist — und der Lauf behauptete eine
 * Luecke, die niemand mehr hat.
 */
export function bewerteTabelle(tabelle: string, policies: readonly PolicyZeile[]): Bewertung {
  const gebunden = bindendePolicies(policies)
  if (gebunden.length > 0) {
    return { tabelle, einordnung: 'gebunden', policies: gebunden, begruendung: '' }
  }

  const beabsichtigt = OFFEN_BEABSICHTIGT.get(tabelle)
  if (beabsichtigt) {
    return { tabelle, einordnung: 'offen_beabsichtigt', policies: [], begruendung: beabsichtigt }
  }

  const bekannt = BEKANNTE_LUECKEN.get(tabelle)
  if (bekannt) {
    return { tabelle, einordnung: 'bekannte_luecke', policies: [], begruendung: bekannt }
  }

  if (policies.length === 0) {
    return {
      tabelle,
      einordnung: 'befund',
      policies: [],
      begruendung: 'ueberhaupt keine Policy — die Tabelle ist entweder offen oder fuer alle zu',
    }
  }

  const lesende = policies
    .filter(p => p.permissive === 'PERMISSIVE' && (p.cmd === 'SELECT' || p.cmd === 'ALL'))
    .map(p => p.name)
  return {
    tabelle,
    einordnung: 'befund',
    policies: [],
    begruendung: `keine SELECT-Policy mit auth.uid()-Bindung. Vorhanden: ${lesende.join(', ') || '(keine lesende)'}`,
  }
}

/** Liest die Tabellennamen aus dem Quelltext einer Portal-Datei. */
export function tabellenAusQuelltext(quelle: string): string[] {
  return [...quelle.matchAll(/\.from\('([a-z_]+)'\)/g)].map(m => m[1])
}
