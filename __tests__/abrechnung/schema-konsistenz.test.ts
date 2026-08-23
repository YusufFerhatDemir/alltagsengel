// ═══════════════════════════════════════════════════════════════
// Schema-Konsistenz: TypeScript-Unions vs. Postgres-CHECK-Constraints
// ═══════════════════════════════════════════════════════════════
// Hintergrund: Ein Wert, den TypeScript erlaubt und Postgres ablehnt, ist
// kein Typfehler — er ist ein Laufzeitausfall, der erst in Produktion
// auftritt. Genau das war zweimal der Fall:
//
//   1) billing_audit_trail.entity_type — die Werte 'ruecklaeufer',
//      'fehlerprotokoll', 'korrekturlauf', 'dta_export' und 'dta_freigabe'
//      standen NICHT im Constraint. logBillingAction() wirft bei 23514, und
//      weil der Audit-Aufruf mitten in importiereRuecklaeufer(),
//      erstelleFehler() und fuehreKorrekturAus() steht, riss er die
//      komplette Verarbeitung mit. Live gegen Produktion nachgewiesen.
//
//   2) ops_ereignis_regeln.ereignis_typ — 11 von 22 TypeScript-Werten waren
//      in der DB unzulaessig, 11 DB-Werte im Code unerreichbar.
//
// Diese Tests lesen die Constraints aus den Migrationsdateien und
// vergleichen sie mit den TypeScript-Listen.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT_ENTITY_TYPES } from '@/lib/billing/core/audit'
import { EREIGNIS_TYP_WERTE } from '@/lib/ops/types'

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

/**
 * Liest die zuletzt definierte Werteliste eines CHECK-Constraints aus den
 * Migrationen. "Zuletzt" = groesster Dateiname, da die Migrationen
 * zeitstempel-praefixiert sind und spaetere Dateien den Constraint neu setzen.
 * Rollback-Dateien werden ignoriert — sie stellen den Vorzustand her.
 */
/**
 * Erkennt BEIDE in den Migrationen genutzten Schreibweisen:
 *   CHECK (<spalte> IN ('a','b'))
 *   CHECK (<spalte> = ANY(ARRAY['a','b']))
 * Die ANY(ARRAY[...])-Form fehlte hier — Constraints, die so definiert sind,
 * waren fuer den Test unsichtbar und er verglich gegen eine veraltete Liste.
 */
function constraintMuster(constraintName: string, spalte: string): RegExp[] {
  const kopf = `CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(\\s*${spalte}\\s*`
  return [
    // IN ( … ) — Terminator ist ')' GEFOLGT VON ')' (IN-Klammer + CHECK-Klammer).
    // Ein bloßes ')' genügt nicht: die Werteliste enthält SQL-Kommentare, die
    // selbst Klammern haben ("-- neu ergaenzt (bisher nur in TypeScript)"), und
    // ein zu früher Abbruch würde stillschweigend Werte unterschlagen.
    new RegExp(`${kopf}IN\\s*\\(([\\s\\S]*?)\\)\\s*\\)`, 'g'),
    // = ANY(ARRAY[ … ])
    new RegExp(`${kopf}=\\s*ANY\\s*\\(\\s*ARRAY\\s*\\[([\\s\\S]*?)\\]\\s*\\)`, 'g'),
  ]
}

/** Alle Constraint-Definitionen einer Datei, in Textreihenfolge. */
function werteListenAusDatei(inhalt: string, constraintName: string, spalte: string): Array<{ pos: number; werte: string[] }> {
  const treffer: Array<{ pos: number; werte: string[] }> = []
  for (const muster of constraintMuster(constraintName, spalte)) {
    let m: RegExpExecArray | null
    while ((m = muster.exec(inhalt)) !== null) {
      const werte = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
      if (werte.length > 0) treffer.push({ pos: m.index, werte })
    }
  }
  return treffer.sort((a, b) => a.pos - b.pos)
}

function migrationsDateien(): string[] {
  return readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
    .sort()
}

function letzteConstraintWerte(constraintName: string, spalte: string): string[] | null {
  let treffer: string[] | null = null

  for (const datei of migrationsDateien()) {
    const inhalt = readFileSync(join(MIGRATIONS, datei), 'utf8')
    if (!inhalt.includes(constraintName)) continue

    const listen = werteListenAusDatei(inhalt, constraintName, spalte)
    if (listen.length > 0) treffer = listen[listen.length - 1].werte
  }

  return treffer
}

/**
 * Vereinigung ALLER Constraint-Definitionen ueber alle Migrationen.
 *
 * Fuer billing_audit_trail.entity_type ist das die einzige korrekte Sicht:
 * die Migrationen setzen den Constraint in `DO $$ ... IF NOT EXISTS`-Bloecken
 * neu, die uebersprungen werden, sobald die dort gesuchten Werte schon
 * vorhanden sind. Die zuletzt im Datei-Sort stehende Definition ist deshalb
 * NICHT zwangslaeufig die angewendete — 20260812180000 (mit den datev_*-Werten)
 * laeuft vor 20260825010000, dessen Guard danach greift und dessen kuerzere
 * Liste nie angewendet wird.
 *
 * Da der Constraint ausschliesslich erweitert und nie verkleinert wird, ist die
 * Vereinigung die effektive Werteliste. Ein neuer TypeScript-Wert ohne
 * Migration faellt weiterhin auf.
 */
function alleConstraintWerte(constraintName: string, spalte: string): string[] | null {
  const union = new Set<string>()

  for (const datei of migrationsDateien()) {
    const inhalt = readFileSync(join(MIGRATIONS, datei), 'utf8')
    if (!inhalt.includes(constraintName)) continue

    for (const liste of werteListenAusDatei(inhalt, constraintName, spalte)) {
      for (const wert of liste.werte) union.add(wert)
    }
  }

  return union.size > 0 ? [...union] : null
}

/**
 * Die zuletzt gesetzte Liste — und alles, was sie gegenueber frueheren
 * Definitionen VERLOREN hat.
 *
 * Warum das neben der Vereinigung noetig ist: die Vereinigung setzt
 * voraus, dass der Constraint nur waechst. Diese Annahme hat 2026-08-23
 * nicht gehalten. Migration 20260921010000 hat ihn verworfen und mit
 * einer selbst geschriebenen Liste neu gesetzt, in der 'invoice_draft'
 * und 'tariff_lookup' fehlten. Die Vereinigung sah das nicht — sie
 * enthielt die Werte ja aus den frueheren Dateien. Live scheiterte
 * seither jeder Audit-Eintrag einer uebersprungenen Sammelrechnungs-
 * gruppe mit 23514, und weil der Aufruf gekapselt ist, still.
 */
function verloreneWerte(constraintName: string, spalte: string): string[] {
  let bisher = new Set<string>()
  const verloren = new Set<string>()

  for (const datei of migrationsDateien()) {
    const inhalt = readFileSync(join(MIGRATIONS, datei), 'utf8')
    if (!inhalt.includes(constraintName)) continue

    for (const liste of werteListenAusDatei(inhalt, constraintName, spalte)) {
      const neu = new Set(liste.werte)
      for (const wert of bisher) if (!neu.has(wert)) verloren.add(wert)
      for (const wert of neu) verloren.delete(wert)
      bisher = neu
    }
  }
  return [...verloren].sort()
}

describe('billing_audit_trail.entity_type — keine Migration verkleinert ihn', () => {
  it('die zuletzt gesetzte Liste hat keinen frueheren Wert verloren', () => {
    const verloren = verloreneWerte('billing_audit_trail_entity_type_check', 'entity_type')
    expect(
      verloren,
      'Diese Werte standen einmal im Constraint und fehlen in der zuletzt gesetzten Liste. '
      + 'Jeder INSERT damit scheitert live mit 23514 — und weil die Audit-Aufrufe gekapselt '
      + 'sind, ohne dass ein Test rot wird. Wer den Constraint neu setzt, muss die vorige '
      + 'Liste vollstaendig uebernehmen.',
    ).toEqual([])
  })

  it('kennt die Werte, die der Sammelrechnungslauf und die RPC schreiben', () => {
    const letzte = letzteConstraintWerte('billing_audit_trail_entity_type_check', 'entity_type')
    // invoice_draft: jede uebersprungene Gruppe (sammelrechnung.ts)
    // tariff_lookup: create_invoice_draft_atomic schreibt ihn selbst
    // sammelrechnungslauf: der Kopfsatz (20260925000000)
    for (const wert of ['invoice_draft', 'tariff_lookup', 'sammelrechnungslauf']) {
      expect(letzte, `${wert} fehlt in der zuletzt gesetzten Liste`).toContain(wert)
    }
  })
})

describe('billing_audit_trail.entity_type', () => {
  const dbWerte = alleConstraintWerte('billing_audit_trail_entity_type_check', 'entity_type')

  it('findet den Constraint in den Migrationen', () => {
    expect(dbWerte).not.toBeNull()
    expect(dbWerte!.length).toBeGreaterThan(10)
  })

  it('kennt jeden TypeScript-Wert auch in der Datenbank', () => {
    const unbekannt = AUDIT_ENTITY_TYPES.filter(t => !dbWerte!.includes(t))
    expect(
      unbekannt,
      `Diese entity_type-Werte wuerden zur Laufzeit mit 23514 scheitern: ${unbekannt.join(', ')}`,
    ).toEqual([])
  })

  it('enthaelt die im DTA-Pfad tatsaechlich genutzten Werte', () => {
    for (const wert of ['dta_lauf', 'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf', 'dta_validierung']) {
      expect(dbWerte).toContain(wert)
      expect(AUDIT_ENTITY_TYPES as readonly string[]).toContain(wert)
    }
  })

  it('enthaelt die frueher genutzten, ungueltigen Werte NICHT mehr im Code', () => {
    for (const alt of ['ruecklaeufer', 'fehlerprotokoll', 'korrekturlauf', 'dta_export', 'dta_freigabe', 'dakota_auftrag']) {
      expect(AUDIT_ENTITY_TYPES as readonly string[]).not.toContain(alt)
    }
  })
})

describe('ops_ereignis_regeln.ereignis_typ', () => {
  const dbWerte = letzteConstraintWerte('ops_ereignis_typ_check', 'ereignis_typ')

  it('findet den Constraint in den Migrationen', () => {
    expect(dbWerte).not.toBeNull()
  })

  it('ist deckungsgleich mit EREIGNIS_TYP_WERTE', () => {
    const nurCode = EREIGNIS_TYP_WERTE.filter(t => !dbWerte!.includes(t))
    const nurDb = dbWerte!.filter(t => !(EREIGNIS_TYP_WERTE as string[]).includes(t))
    expect(nurCode, `Nur in TypeScript (INSERT scheitert mit 23514): ${nurCode.join(', ')}`).toEqual([])
    expect(nurDb, `Nur in der DB (aus dem Code nicht erreichbar): ${nurDb.join(', ')}`).toEqual([])
  })

  it('kennt den Rueckläufer-Ereignistyp, den die Aufgaben-Automatik nutzt', () => {
    expect(dbWerte).toContain('abrechnung_ruecklaefer')
    expect(EREIGNIS_TYP_WERTE as string[]).toContain('abrechnung_ruecklaefer')
  })

  it('hat keine Duplikate in der TypeScript-Liste', () => {
    expect(new Set(EREIGNIS_TYP_WERTE).size).toBe(EREIGNIS_TYP_WERTE.length)
  })
})
