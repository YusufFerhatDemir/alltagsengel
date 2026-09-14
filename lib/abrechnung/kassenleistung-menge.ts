// ═══════════════════════════════════════════════════════════════════════
// Kassenabrechnung — Menge und Einzelpreis einer Leistungszeile
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 44, 14.09.2026)
//
// In /admin/abrechnung stand fuer die Menge einer zeitbasierten Leistung:
//
//     const stunden = (r.duration_minutes || 60) / 60
//
// `service_records.duration_minutes` ist GENERATED aus start_time/end_time
// und bleibt NULL, solange eine der beiden Zeiten fehlt. Genau so legt
// /admin/leistungsnachweis-upload Nachweise an: Klient, Datum,
// Leistungsart — ohne Zeiten. Der Ersatzwert 60 meldete dem Kostentraeger
// dann EINE STUNDE, die niemand erfasst hat.
//
// Bei einer zeitbasierten Leistung ist die Menge die Aussage: sie steht so
// in der EDIFACT-Datei. Eine erfundene Menge ist gegenueber einem
// Kostentraeger keine Ungenauigkeit, sondern eine falsche Angabe.
//
// Dieselbe erfundene Stunde steht live noch in der Datenbank — in
// `create_invoice_draft_atomic`:
//
//     WHEN 'zeit_stunde' THEN
//       ROUND(preis_cent/100.0 * (COALESCE(duration_minutes, 60)/60.0), 2)
//
// Dagegen laeuft Migration 20261130000000: ein Nachweis ohne Dauer wird gar
// nicht erst abrechenbar. Bis sie angewendet ist, ist dieser Code der
// einzige Riegel — und deshalb steht er hier als pruefbare Funktion und
// nicht in einer Seite.
//
// WARUM NICHT EINFACH 0 EINSETZEN
// Eine Menge von 0 waere keine Rettung, sondern dieselbe Erfindung in die
// andere Richtung: die Zeile ginge mit 0 Stunden und dem vollen Betrag als
// Einzelpreis hinaus. Die einzige ehrliche Antwort auf „Dauer unbekannt"
// ist, die Zeile NICHT zu melden und den Grund zu nennen.
// ═══════════════════════════════════════════════════════════════════════

import { centRunden, euroZuCent, rundeAufStellen } from '@/lib/geld'

export interface KassenLeistungEingabe {
  /** EURO-Spalte `service_records.amount` (nicht Cent). */
  amount: number | null | undefined
  /** GENERATED aus start_time/end_time — NULL, wenn eine Zeit fehlt. */
  duration_minutes: number | null | undefined
  /** Kommt der EDIFACT-Schluessel mit einer Zeitmenge oder mit Stueck 1? */
  zeitbasiert: boolean
}

export type MengeVerweigerung = 'kein_betrag' | 'keine_dauer'

export type KassenLeistungErgebnis =
  | { ok: true; menge: number; einzelpreisCent: number; gesamtCent: number }
  | { ok: false; grund: MengeVerweigerung }

/**
 * Menge und Einzelpreis einer Leistungszeile — oder eine Verweigerung.
 *
 * Fail-closed in BEIDE Richtungen: ohne Betrag gibt es nichts zu melden,
 * ohne Dauer nichts, das man ehrlich als Menge angeben koennte.
 */
export function kassenLeistungMenge(
  eingabe: KassenLeistungEingabe,
): KassenLeistungErgebnis {
  if (!eingabe.amount || eingabe.amount <= 0) {
    return { ok: false, grund: 'kein_betrag' }
  }

  const gesamtCent = euroZuCent(eingabe.amount)

  if (!eingabe.zeitbasiert) {
    // Stueckleistung: Menge 1, Einzelpreis = Gesamtbetrag des Einsatzes.
    // Die Dauer spielt hier keine Rolle und wird deshalb auch nicht
    // verlangt — eine Entlastungsleistung nach § 45b hat keine Stundenzahl.
    return { ok: true, menge: 1, einzelpreisCent: gesamtCent, gesamtCent }
  }

  // Zeitverguetung: die Menge IST die Dauer. Ohne sie keine Zeile.
  if (eingabe.duration_minutes == null || eingabe.duration_minutes <= 0) {
    return { ok: false, grund: 'keine_dauer' }
  }

  const menge = rundeAufStellen(eingabe.duration_minutes / 60, 2)
  // euroZuCent statt Math.round(amount * 100): `amount` ist eine
  // EURO-Spalte, und der Halb-Cent (1,005 EUR) fiel dort um einen Cent
  // nach unten, bevor der Betrag in die Kassendatei ging.
  const einzelpreisCent = menge > 0 ? centRunden(gesamtCent / menge) : gesamtCent
  return { ok: true, menge, einzelpreisCent, gesamtCent }
}

/** Menschenlesbarer Grund fuer die Problemliste der Oberflaeche. */
export function verweigerungsText(grund: MengeVerweigerung): string {
  return grund === 'kein_betrag'
    ? 'kein Betrag am Leistungsnachweis — Leistung übersprungen'
    : 'keine Einsatzdauer am Leistungsnachweis (Beginn/Ende fehlen) — '
      + 'zeitbasierte Leistung übersprungen, sie würde der Kasse sonst als '
      + 'eine Stunde gemeldet'
}
