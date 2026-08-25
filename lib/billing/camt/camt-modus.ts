// ═══════════════════════════════════════════════════════════════════════════
// BETRIEBSART DES CAMT-IMPORTS
//
// Ein Kontoauszugsimport ist der einzige Vorgang im System, der aus einer
// hochgeladenen Datei unmittelbar Geld bewegt: jede Zeile wird zu einem
// Zahlungseingang, laeuft ins Matching, setzt `invoices.paid_amount` und kann
// als Ruecklastschrift eine Rechnung wieder oeffnen, eine Gebuehr buchen und
// ein SEPA-Mandat sperren. Rueckgaengig ist davon nichts mit einem Knopf.
//
// Bis hierher gab es nur „importieren". Wer wissen wollte, was eine echte
// Bankdatei anrichten wuerde, musste sie importieren.
//
// ── DER SCHALTER ───────────────────────────────────────────────────────────
//   CAMT_IMPORT_MODE=LIVE     → es wird gebucht
//   alles andere (auch nicht gesetzt) → DRY_RUN: Datei wird vollstaendig
//                                gelesen, geprueft und je Buchung
//                                eingeordnet, aber NICHTS geschrieben
//
// ── WARUM DRY_RUN DER STANDARD IST ─────────────────────────────────────────
// Fail-closed. Ein Import, der ohne gesetzte Variable bucht, ist genau der
// Fall, den niemand bemerkt, bis das Geld an der falschen Rechnung haengt.
// Der Standard kostet nichts: `camt_imports` steht live auf 0, es gibt keinen
// Bestandsbetrieb, den diese Wahl unterbricht. Wer bucht, hat den Schalter
// vorher bewusst umgelegt.
//
// Anders als bei den Versand-Schaltern haengt hier KEINE Umgebungstrennung
// daran: ein Trockenlauf ist in jeder Umgebung harmlos, und der scharfe Modus
// verlangt ohnehin eine hochgeladene Datei und einen angemeldeten Admin —
// er kann nicht wie ein Cron von selbst losgehen.
// ═══════════════════════════════════════════════════════════════════════════

import type { EnvQuelle } from '@/lib/env/pruefung'

export type CamtImportModus = 'DRY_RUN' | 'LIVE'

/** Der einzige Wert, der scharf schaltet. */
export const LIVE_WERT = 'LIVE'

export interface CamtModusStand {
  modus: CamtImportModus
  /** Darf dieser Lauf schreiben? */
  buchend: boolean
  /** Stand überhaupt ein Wert in der Umgebung? */
  gesetzt: boolean
  /** War der Wert einer der beiden verstandenen? */
  wertGueltig: boolean
  grund: string
}

/**
 * Liest die Betriebsart. Rein — keine Nebenwirkung, keine Datenbank.
 */
export function camtImportModus(quelle: EnvQuelle = process.env): CamtModusStand {
  const roh = quelle.CAMT_IMPORT_MODE
  const gesetzt = typeof roh === 'string' && roh !== ''

  if (!gesetzt) {
    return {
      modus: 'DRY_RUN',
      buchend: false,
      gesetzt: false,
      wertGueltig: true,
      grund:
        'CAMT_IMPORT_MODE ist nicht gesetzt — der Import läuft als Trockenlauf. ' +
        `Die Datei wird vollständig geprüft, aber nichts gebucht. Zum Buchen ${LIVE_WERT} setzen.`,
    }
  }

  if (roh === LIVE_WERT) {
    return {
      modus: 'LIVE',
      buchend: true,
      gesetzt: true,
      wertGueltig: true,
      grund: 'CAMT_IMPORT_MODE=LIVE — Zahlungseingänge werden angelegt und zugeordnet.',
    }
  }

  if (roh === 'DRY_RUN') {
    return {
      modus: 'DRY_RUN',
      buchend: false,
      gesetzt: true,
      wertGueltig: true,
      grund: 'CAMT_IMPORT_MODE=DRY_RUN — die Datei wird geprüft, aber nichts gebucht.',
    }
  }

  // Ein unbekannter Wert bucht NICHT. Er wird aber als solcher gemeldet,
  // damit ein Tippfehler ('live', 'Live', 'true') nicht als bewusste
  // Entscheidung für den Trockenlauf durchgeht.
  return {
    modus: 'DRY_RUN',
    buchend: false,
    gesetzt: true,
    wertGueltig: false,
    grund:
      'CAMT_IMPORT_MODE trägt einen unbekannten Wert — der Import läuft sicherheitshalber ' +
      `als Trockenlauf. Zulässig sind ausschließlich '${LIVE_WERT}' und 'DRY_RUN' (Groß-/Kleinschreibung zählt).`,
  }
}

/** Kurzfrage: darf dieser Lauf schreiben? */
export function camtImportBucht(quelle: EnvQuelle = process.env): boolean {
  return camtImportModus(quelle).buchend
}
