/**
 * Überspring-Codes des Sammelrechnungslaufs — und ihr Klartext.
 *
 * ── WARUM EINE EIGENE DATEI ───────────────────────────────────────────
 * Codes und Etiketten gehören zusammen: ein neuer Code ohne Etikett zeigt
 * dem Betrieb ein rohes `BUDGETLAGE_UNBEKANNT` statt eines Satzes, den
 * jemand lesen kann. Zwei Listen in zwei Dateien laufen genau dabei
 * auseinander.
 *
 * Sie stehen aber NICHT in `sammelrechnung.ts`, obwohl sie dort fachlich
 * hingehören. Der Grund ist eine Grenze, keine Vorliebe:
 * `sammelrechnung.ts` zieht die Rechnungs-Engine, den Preis-Resolver und
 * darüber `lib/supabase/admin.ts` mit `import 'server-only'` nach. Wer die
 * Etiketten von einer Client-Komponente aus importiert, holt diese ganze
 * Kette in den Browser-Bundle — der Next-Build bricht dann mit
 * „You're importing a module that depends on server-only" ab.
 *
 * Am 14.09.2026 genau so passiert: die Etiketten lagen kurzzeitig in
 * `sammelrechnung.ts`, `/admin/sammelrechnung` importierte sie, typecheck
 * und Tests blieben grün — und der Turbopack-Build in der CI fiel mit 20
 * Fehlern um. Diese Datei hat deshalb bewusst KEINE Importe.
 */

/**
 * Gruende, aus denen eine Gruppe nicht abgerechnet wird.
 *
 * Jeder Code steht fuer eine Sperre, die bewusst gesetzt ist. Keiner davon
 * ist ein "Fehler, den man wegkonfigurieren kann" — sie benennen, was
 * fehlt, damit es behoben werden kann.
 */
export const UEBERSPRING_CODES = [
  /** Erfasste Leistungsart hat keinen Tarif-Schluessel (lib/billing/leistungsarten.ts). */
  'LEISTUNGSART_UNBEKANNT',
  /** budget_type ist keiner Rechtsgrundlage zugeordnet. */
  'BUDGETTYP_UNBEKANNT',
  /** Kein aktiver, zum Leistungsdatum gueltiger Tarif vorhanden. */
  'TARIF_FEHLT',
  /** Tarif vorhanden, aber blocked bzw. (bei Kasse) nicht verified. */
  'TARIF_NICHT_VERIFIZIERT',
  /** Mehrere gleich spezifische Tarife — die RPC verweigert die Auswahl. */
  'TARIF_MEHRDEUTIG',
  /** Mindestens ein Nachweis der Gruppe traegt keinen Unterschriftsnachweis. */
  'UNTERSCHRIFT_FEHLT',
  /** Budgetlage (§ 45b / § 42a) nicht ermittelbar — Aufteilung waere geraten. */
  'BUDGETLAGE_UNBEKANNT',
  /** Alles andere, mit Originaltext im Grund. */
  'FEHLER',
] as const;

export type UeberspringCode = (typeof UEBERSPRING_CODES)[number];

/**
 * Klartext je Code — für die Oberfläche.
 *
 * Der Grund im Klartext (`SammelrechnungUebersprungen.grund`) steht
 * daneben; dieses Etikett ist die Überschrift, nicht die Erklärung.
 */
export const UEBERSPRING_LABELS: Record<UeberspringCode, string> = {
  LEISTUNGSART_UNBEKANNT: 'Leistungsart ohne Tarif-Schlüssel',
  BUDGETTYP_UNBEKANNT: 'Budget-Typ unbekannt',
  TARIF_FEHLT: 'Kein gültiger Tarif',
  TARIF_NICHT_VERIFIZIERT: 'Tarif nicht verifiziert / gesperrt',
  TARIF_MEHRDEUTIG: 'Tarif mehrdeutig',
  UNTERSCHRIFT_FEHLT: 'Unterschrift fehlt',
  BUDGETLAGE_UNBEKANNT: 'Budgetlage nicht ermittelbar',
  FEHLER: 'Fehler',
};
