// ═══════════════════════════════════════════════════════════════════════════
// PILOT-BERICHT ZUM CAMT-PREFLIGHT
//
// Das JSON aus camtPreflight() ist vollständig, aber niemand liest es vor dem
// ersten produktiven Import Zeile für Zeile. Diese Datei macht daraus einen
// Text, den jemand ausdruckt, neben den Kontoauszug legt und abhakt.
//
// ── WAS DER BERICHT LEISTEN MUSS ───────────────────────────────────────────
// Die eine Frage lautet: „Darf ich diese Datei scharf importieren?" Sie steht
// deshalb ganz oben, in einer Zeile, vor allen Zahlen. Alles darunter ist die
// Begründung.
//
// ── WAS ER NICHT ENTHÄLT ───────────────────────────────────────────────────
// Keine vollständige IBAN (nur verkürzt), keine fremde Mandantenkennung, kein
// Rohwert eines Konfigurationsschalters. Ein Bericht wird weitergereicht —
// per Mail an den Steuerberater, als Anhang in einem Ticket. Was hier steht,
// verlässt das Haus.
// ═══════════════════════════════════════════════════════════════════════════

import { centZuEuro } from '@/lib/geld'
import type {
  BuchungEinordnung,
  BuchungPreflight,
  CamtPreflightErgebnis,
  Feldpruefung,
} from './camt-preflight'

const EINORDNUNG_LABEL: Record<BuchungEinordnung, string> = {
  MATCHED: 'ZUGEORDNET',
  AMBIGUOUS: 'MEHRDEUTIG',
  UNMATCHED: 'OHNE ZUORDNUNG',
  DUPLICATE: 'BEREITS VERBUCHT',
  INVALID: 'NICHT BUCHBAR',
  CROSS_TENANT_BLOCKED: 'FREMDER MANDANT',
}

/** Reihenfolge im Bericht: das Ernsteste zuerst. */
const ANZEIGE_REIHENFOLGE: BuchungEinordnung[] = [
  'CROSS_TENANT_BLOCKED', 'INVALID', 'AMBIGUOUS', 'DUPLICATE', 'UNMATCHED', 'MATCHED',
]

const STAND_ZEICHEN: Record<Feldpruefung['stand'], string> = {
  ok: '+',
  hinweis: '~',
  fehler: '!',
  nicht_anwendbar: '.',
}

function euro(cent: number): string {
  return `${centZuEuro(cent).toFixed(2).replace('.', ',')} €`
}

function linie(zeichen = '─', breite = 78): string {
  return zeichen.repeat(breite)
}

function buchungsBlock(b: BuchungPreflight): string[] {
  const zeilen: string[] = []
  const vorzeichen = b.betragCent < 0 ? '−' : '+'

  zeilen.push(
    `  #${String(b.nummer).padStart(3, ' ')}  ${EINORDNUNG_LABEL[b.einordnung].padEnd(18)} ` +
    `${vorzeichen}${euro(Math.abs(b.betragCent))}  ${b.buchungsdatum}`,
  )
  zeilen.push(`        Zahler:   ${b.debitorName ?? '—'}${b.debitorIbanKurz ? ` (${b.debitorIbanKurz})` : ''}`)
  if (b.verwendungszweck) {
    zeilen.push(`        Zweck:    ${b.verwendungszweck.slice(0, 90)}`)
  }
  if (b.istRuecklastschrift) {
    zeilen.push(`        RÜCKLASTSCHRIFT — erkannt an: ${b.ruecklastschriftGrund ?? 'unbekannt'}`)
  }
  zeilen.push(`        Befund:   ${b.begruendung}`)

  if (b.kandidaten.length > 0) {
    zeilen.push('        Kandidaten:')
    for (const k of b.kandidaten) {
      zeilen.push(
        `          ${String(k.confidence).padStart(3, ' ')} %  ${(k.invoiceNumber ?? '—').padEnd(18)} ` +
        `${k.clientName.padEnd(24).slice(0, 24)} offen ${euro(k.offenCent)}  [${k.matchMethode}]`,
      )
    }
  }

  // Nur auffällige Prüfungen: eine Liste, in der alles „+" ist, liest niemand.
  const auffaellig = b.pruefungen.filter(p => p.stand === 'fehler' || p.stand === 'hinweis')
  if (auffaellig.length > 0) {
    zeilen.push('        Prüfungen:')
    for (const p of auffaellig) {
      zeilen.push(`          ${STAND_ZEICHEN[p.stand]} ${p.feld.padEnd(18)} ${p.befund}`)
    }
  }

  zeilen.push('')
  return zeilen
}

/**
 * Baut den vollständigen Pilot-Bericht als reinen Text.
 *
 * @param nurAuffaellige Wenn true, werden sauber zugeordnete Buchungen nur
 *   gezählt, nicht einzeln aufgeführt. Für eine Datei mit 300 Zeilen, von
 *   denen 290 stimmen, ist die kurze Fassung die brauchbare.
 */
export function baueCamtPreflightBericht(
  e: CamtPreflightErgebnis,
  optionen: { nurAuffaellige?: boolean; erstelltAm?: string } = {},
): string {
  const z: string[] = []
  const nurAuffaellige = optionen.nurAuffaellige ?? false

  z.push(linie('═'))
  z.push('  KONTOAUSZUG-PREFLIGHT — TROCKENLAUF, ES WURDE NICHTS GEBUCHT')
  z.push(linie('═'))
  z.push('')

  // ── Die eine Frage, ganz oben ──
  z.push(e.freigabefaehig
    ? '  ERGEBNIS: Diese Datei kann scharf importiert werden.'
    : '  ERGEBNIS: Diese Datei darf NICHT scharf importiert werden.')
  z.push('')

  if (e.blocker.length > 0) {
    z.push('  Was dagegen spricht:')
    for (const b of e.blocker) z.push(`    ! ${b}`)
    z.push('')
  }
  if (e.warnungen.length > 0) {
    z.push('  Zur Kenntnis:')
    for (const w of e.warnungen) z.push(`    ~ ${w}`)
    z.push('')
  }

  // ── Datei ──
  z.push(linie())
  z.push('  DATEI')
  z.push(linie())
  z.push(`    Name:          ${e.dateiname}`)
  z.push(`    Format:        ${e.format}`)
  z.push(`    Konto:         ${e.kontoIbanKurz ?? '—'}`)
  z.push(`    Auszugsdatum:  ${e.auszugsDatum ?? '—'}`)
  z.push(`    Dateihash:     ${e.dateiHash}`)
  z.push(`    Betriebsart:   ${e.modus}${e.buchend ? ' (SCHARF)' : ' (Trockenlauf)'}`)
  z.push(`                   ${e.modusGrund}`)
  if (optionen.erstelltAm) z.push(`    Erstellt:      ${optionen.erstelltAm}`)
  z.push('')

  if (e.parseFehler.length > 0) {
    z.push('    NICHT LESBARE ZEILEN:')
    for (const f of e.parseFehler) z.push(`      ! ${f}`)
    z.push('')
  }

  // ── Zahlen ──
  z.push(linie())
  z.push('  ÜBERBLICK')
  z.push(linie())
  z.push(`    Buchungen gesamt:        ${e.gesamt}`)
  for (const art of ANZEIGE_REIHENFOLGE) {
    const n = e.nachEinordnung[art]
    if (n > 0) z.push(`      ${EINORDNUNG_LABEL[art].padEnd(20)} ${String(n).padStart(4, ' ')}`)
  }
  z.push('')
  z.push(`    Summe Eingänge:          ${euro(e.summeEingangCent)}`)
  z.push(`    Summe Ausgänge:          ${euro(e.summeAusgangCent)}`)
  z.push(`    davon automatisch buchbar: ${euro(e.summeBuchbarCent)}`)
  z.push('')
  z.push('    Automatisch gebucht wird ausschließlich, was als ZUGEORDNET gilt.')
  z.push('    MEHRDEUTIG und OHNE ZUORDNUNG werden zu Klärfällen und warten auf')
  z.push('    eine Entscheidung von Hand — sie werden nie geraten.')
  z.push('')

  // ── Einzelbuchungen ──
  z.push(linie())
  z.push(nurAuffaellige ? '  BUCHUNGEN, DIE AUFMERKSAMKEIT BRAUCHEN' : '  BUCHUNGEN IM EINZELNEN')
  z.push(linie())
  z.push('')

  let uebersprungen = 0
  for (const art of ANZEIGE_REIHENFOLGE) {
    const gruppe = e.buchungen.filter(b => b.einordnung === art)
    if (gruppe.length === 0) continue
    if (nurAuffaellige && art === 'MATCHED') {
      uebersprungen += gruppe.length
      continue
    }
    z.push(`  ── ${EINORDNUNG_LABEL[art]} (${gruppe.length}) ${'─'.repeat(Math.max(0, 50 - EINORDNUNG_LABEL[art].length))}`)
    z.push('')
    for (const b of gruppe) z.push(...buchungsBlock(b))
  }

  if (uebersprungen > 0) {
    z.push(`  (${uebersprungen} sauber zugeordnete Buchung(en) hier nicht einzeln aufgeführt.)`)
    z.push('')
  }

  z.push(linie('═'))
  z.push('  Dieser Lauf hat NICHTS geschrieben: keine Zahlungseingänge, keine')
  z.push('  Zuordnungen, keine Klärfälle, keine Rücklastschrift-Verarbeitung.')
  z.push(linie('═'))

  return z.join('\n')
}
