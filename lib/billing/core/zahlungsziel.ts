// ═══════════════════════════════════════════════════════════════════
// Zahlungsziel / Fälligkeit — due_date für Rechnungen
// ═══════════════════════════════════════════════════════════════════
//
// PROBLEM (gefixt hier):
// invoices.due_date wurde bei der Rechnungserstellung nie gesetzt (weder in
// create_invoice_draft_atomic() noch in den Storno-/Korrektur-/Gutschrift-
// Pfaden der invoice-engine). Ohne due_date greift keine der
// zahlungszielbasierten Auswertungen:
//   • lib/billing/opos/opos-manager.ts — Fälligkeitsdatum bleibt null,
//     die OPOS-Altersklassen fallen komplett aus
//   • lib/billing/core/dunning.ts — fällt auf "heute" zurück, dadurch ist
//     jede Rechnung sofort überfällig
//   • workflow_engine (20260813010000) selektiert due_date < current_date —
//     findet nie etwas
//   • idx_invoices_due_date (20260808210000) läuft ins Leere
//
// KONFIGURATION
// Eine Zahlungsziel-Konfiguration pro Organisation oder pro Klient existiert
// im Schema NICHT. Was es gibt, ist die Spalte invoices.payment_terms_days
// (Migration 20260808210000, integer NOT NULL DEFAULT 30) — das Zahlungsziel
// je Rechnung. Diese Spalte ist die Konfiguration und hat Vorrang, sobald ein
// Wert gesetzt ist.
//
// Für neu erstellte Rechnungen schreibt die Anwendung Zahlungsziel UND
// Fälligkeit gemeinsam (payment_terms_days = 14, due_date = +14 Tage), damit
// beide Felder nie auseinanderlaufen. Der DB-Default von 30 gilt damit nur
// noch für Altbestand und für Fremd-Inserts.
// ═══════════════════════════════════════════════════════════════════

import { heuteBerlin } from '@/lib/utils/timezone'

/**
 * Standard-Zahlungsziel in Tagen für neu erstellte Rechnungen.
 * Wird zusammen mit due_date geschrieben, damit invoices.payment_terms_days
 * und invoices.due_date konsistent bleiben.
 */
export const ZAHLUNGSZIEL_STANDARD_TAGE = 14

/**
 * Berechnet das Fälligkeitsdatum als YYYY-MM-DD (Europe/Berlin).
 *
 * @param rechnungsdatum  YYYY-MM-DD oder Date; default = heute (Berlin)
 * @param zahlungszielTage  Zahlungsziel in Tagen; default = 14
 */
export function berechneFaelligkeit(
  rechnungsdatum?: string | Date | null,
  zahlungszielTage: number = ZAHLUNGSZIEL_STANDARD_TAGE,
): string {
  const basis =
    rechnungsdatum instanceof Date
      ? new Date(rechnungsdatum.getTime())
      : rechnungsdatum
        ? new Date(`${String(rechnungsdatum).slice(0, 10)}T12:00:00Z`)
        : new Date(`${heuteBerlin()}T12:00:00Z`)

  if (Number.isNaN(basis.getTime())) {
    // Unlesbares Rechnungsdatum → ab heute rechnen, statt due_date leer zu lassen.
    return berechneFaelligkeit(null, zahlungszielTage)
  }

  const tage = Number.isFinite(zahlungszielTage) && zahlungszielTage >= 0
    ? Math.round(zahlungszielTage)
    : ZAHLUNGSZIEL_STANDARD_TAGE

  basis.setUTCDate(basis.getUTCDate() + tage)
  return basis.toISOString().slice(0, 10)
}

/**
 * Felder für einen invoices-INSERT: Zahlungsziel + daraus abgeleitete
 * Fälligkeit. Immer gemeinsam schreiben — sonst zeigt payment_terms_days
 * ein anderes Ziel an als due_date.
 *
 * @param rechnungsdatum  YYYY-MM-DD; default = heute (Berlin)
 * @param zahlungszielTage  abweichendes Zahlungsziel; default = 14
 */
export function zahlungszielFelder(
  rechnungsdatum?: string | Date | null,
  zahlungszielTage: number = ZAHLUNGSZIEL_STANDARD_TAGE,
): { payment_terms_days: number; due_date: string } {
  const tage = Number.isFinite(zahlungszielTage) && zahlungszielTage >= 0
    ? Math.round(zahlungszielTage)
    : ZAHLUNGSZIEL_STANDARD_TAGE
  return {
    payment_terms_days: tage,
    due_date: berechneFaelligkeit(rechnungsdatum, tage),
  }
}
