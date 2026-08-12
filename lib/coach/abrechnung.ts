// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Abrechnungswege (Schritt 6 des DiPA-Nutzerflows)
//
// BEWUSSTE LÜCKE: Dieses Modul enthält KEINE Preise, KEINE Vergütungs-
// höhen und KEINE Erstattungsbeträge. Welcher Abrechnungsweg gilt und
// welcher Betrag vereinbart wird, ergibt sich erst aus der Zulassungs-
// kategorie und der Vergütungsvereinbarung. Bis dahin bleibt hier nur
// die STRUKTUR — konfigurierbar, deaktiviert, unverbindlich.
//
// Deshalb:
//  * `verguetungGeklaert: false` bei allen Vorlagen — solange das so ist,
//    darf kein Abrechnungslauf gegen diesen Weg erzeugt werden
//    (istAbrechnungsbereit()).
//  * `rechtsgrundlage` ist ein Hinweistext für die Fachabteilung, keine
//    im Code hinterlegte Rechtsauslegung.
//
// ABGRENZUNG ZU BLOCK 16: Der PflegeCoach hat keinen eigenen Rechnungs-
// lauf. Sobald ein Weg freigegeben ist, wird er an die bestehende
// Abrechnung übergeben — dieses Modul liefert nur den Schlüssel.
// ═══════════════════════════════════════════════════════════════

export interface AbrechnungswegVorlage {
  schluessel: string
  bezeichnung: string
  beschreibung: string
  /** Hinweis auf die zu prüfende Rechtsgrundlage — extern zu verifizieren. */
  rechtsgrundlage: string
  /** Was geklärt sein muss, bevor dieser Weg aktiviert werden darf. */
  voraussetzungen: string[]
}

/**
 * Vorlagen, die im Admin-Bereich per Klick angelegt werden können.
 * Bewusst als Code-Konstante statt als Migrations-Seed: so ist sichtbar,
 * dass es sich um Entwürfe handelt, nicht um gesetzte Fakten.
 */
export const ABRECHNUNGSWEG_VORLAGEN: AbrechnungswegVorlage[] = [
  {
    schluessel: 'direkt_pflegekasse',
    bezeichnung: 'Direktabrechnung mit der Pflegekasse',
    beschreibung:
      'Der Hersteller rechnet die Nutzung unmittelbar mit der Pflegekasse der versicherten Person ab.',
    rechtsgrundlage: 'Zu prüfen: Vertrags- und Abrechnungsregelungen nach SGB XI',
    voraussetzungen: [
      'Aufnahme der Anwendung in das maßgebliche Verzeichnis (oder Erprobungspfad) liegt vor',
      'Vergütungsvereinbarung ist abgeschlossen',
      'Technischer Abrechnungsweg mit den Kassen ist abgestimmt',
    ],
  },
  {
    schluessel: 'kostenerstattung_versicherter',
    bezeichnung: 'Kostenerstattung über die versicherte Person',
    beschreibung:
      'Die versicherte Person zahlt zunächst selbst und reicht den Beleg bei ihrer Pflegekasse ein.',
    rechtsgrundlage: 'Zu prüfen: Erstattungsverfahren der jeweiligen Pflegekasse',
    voraussetzungen: [
      'Belegkonforme Rechnungsstellung an die versicherte Person ist eingerichtet',
      'Aufklärung über das Erstattungsrisiko ist im Bestellprozess hinterlegt',
    ],
  },
  {
    schluessel: 'pilot_ohne_abrechnung',
    bezeichnung: 'Pilotphase ohne Abrechnung',
    beschreibung:
      'Nutzung im Rahmen einer Erprobung; es findet keine Abrechnung gegenüber Kostenträgern statt.',
    rechtsgrundlage: 'Nicht abrechnungsrelevant',
    voraussetzungen: ['Teilnahmeinformation und Einwilligung der Teilnehmenden liegen vor'],
  },
]

export interface AbrechnungswegZeile {
  schluessel: string
  bezeichnung: string
  aktiv: boolean
  verguetung_geklaert: boolean
}

export type AbrechnungsBereitschaft =
  | { bereit: true }
  | { bereit: false; grund: string }

/**
 * Darf über diesen Weg tatsächlich abgerechnet werden?
 * Fail-closed: ohne geklärte Vergütung niemals.
 */
export function istAbrechnungsbereit(weg: AbrechnungswegZeile | null | undefined): AbrechnungsBereitschaft {
  if (!weg) return { bereit: false, grund: 'Kein Abrechnungsweg konfiguriert.' }
  if (!weg.aktiv) return { bereit: false, grund: `Abrechnungsweg „${weg.bezeichnung}" ist nicht aktiv.` }
  if (!weg.verguetung_geklaert) {
    return {
      bereit: false,
      grund: `Für „${weg.bezeichnung}" ist noch keine Vergütungsvereinbarung hinterlegt. Bis dahin ist keine Abrechnung möglich.`,
    }
  }
  return { bereit: true }
}

/** Schlüssel eines Wegs auf Plausibilität prüfen (Konfigurations-Eingabe). */
export function istSchluesselGueltig(schluessel: string): boolean {
  return /^[a-z0-9_]{3,60}$/.test(schluessel)
}
