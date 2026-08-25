// ═══════════════════════════════════════════════════════════════
// Betragseingaben aus der Oberflaeche in Cent umrechnen
// ═══════════════════════════════════════════════════════════════
//
// Admins tippen Betraege deutsch („1.234,56"), Copy-Paste aus einem
// Kontoauszug liefert oft „1234.56" oder „105,00 €". Alle drei muessen zum
// selben Ergebnis fuehren; alles andere muss als ungueltig erkennbar sein
// statt als NaN in die Datenbank zu laufen.
//
// Bewusst in lib/ statt in der Dialogkomponente: so ist die Umrechnung
// ohne React testbar.
// ═══════════════════════════════════════════════════════════════

import { euroZuCent } from '@/lib/geld'

/**
 * Wandelt eine Betragseingabe in Cent.
 *
 * @returns Cent als ganze Zahl, oder NaN bei einer ungueltigen Eingabe.
 */
export function parseBetragZuCent(eingabe: string): number {
  const roh = String(eingabe ?? '').trim()
  if (!roh) return NaN

  // Leerraum (inkl. der schmalen und geschuetzten Leerzeichen aus
  // Kontoauszug-Kopien) darf ueberall weg — er trennt hoechstens
  // Tausendergruppen. Das WAEHRUNGSZEICHEN dagegen nur an den Raendern:
  //
  // Frueher wurde auch das € global gestrichen. Damit wurde die
  // naheliegende Vertipper-Eingabe „12€34" (gemeint: 12,34 €) zu „1234"
  // und ergab 1234,00 € — den hundertfachen Betrag, ohne jede Warnung.
  // Ein Waehrungszeichen INNERHALB der Zahl ist keine gueltige Eingabe
  // und faellt jetzt durch die Formatpruefung weiter unten.
  let bereinigt = roh
    .replace(/^€+|€+$/g, '')
    .replace(/[\s  ]/g, '')

  const hatKomma = bereinigt.includes(',')
  if (hatKomma) {
    // Deutsches Format: Punkte sind Tausendertrenner, Komma ist Dezimalpunkt.
    bereinigt = bereinigt.replace(/\./g, '').replace(',', '.')
  }
  // Ohne Komma bleibt ein Punkt der Dezimalpunkt („1234.56"). Ein reiner
  // Tausenderpunkt ohne Nachkommastellen („1.234") ist mehrdeutig und wird
  // bewusst als 1,234 € gelesen — der Nutzer sieht das Ergebnis im Dialog.

  if (!/^-?\d*(\.\d+)?$/.test(bereinigt)) return NaN

  const zahl = Number(bereinigt)
  if (!Number.isFinite(zahl)) return NaN
  // euroZuCent statt Math.round(zahl * 100): letzteres verfehlt den
  // exakten Halb-Cent (Eingabe „1,005" ergab 100 statt 101 Cent).
  return euroZuCent(zahl)
}
