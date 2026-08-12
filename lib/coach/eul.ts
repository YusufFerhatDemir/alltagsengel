// ═══════════════════════════════════════════════════════════════
// Ergänzende Unterstützungsleistungen (eUL) — Block 15d
//
// WAS eUL SIND: persönliche Begleitleistungen rund um die Nutzung einer
// digitalen Pflegeanwendung — Einweisung, technische Hilfe, gemeinsame
// Nutzung, Schulung Angehöriger, Auswertungsgespräch.
//
// ═══ WICHTIGE ABGRENZUNG (bitte vor Änderungen lesen) ═══════════
// Die Regulatorik-Analyse hält fest, dass die Vermittlung und Bewerbung
// von Alltagsengel-Dienstleistungen NICHT Teil des DiPA-Produkts sein
// darf (Werbefreiheit der Kernfunktion, Interessenkonflikt). Gleichzeitig
// sind eUL fachlich genau die persönliche Begleitung, die Alltagsengel
// erbringt.
//
// Auflösung, die dieses Modul umsetzt:
//   * eUL werden als BETRIEBSDATEN geführt (Tabellen eul_*, org_fence,
//     Admin-Zugriff) — nicht als Teil der DiPA.
//   * Im DiPA-Frontend (/pflegecoach) gibt es KEINE Bewerbung, keinen
//     Buchungs-Button und keinen Angebots-Hinweis. Die Brücke läuft
//     ausschließlich über den Betriebsbereich (/admin/eul).
//   * Der Bezug zur DiPA-Nutzung ist optional und nur pseudonym.
//     Aus einem eUL-Datensatz lässt sich keine Gesundheitsakte öffnen.
// Wer diese Trennung aufweicht, gefährdet die Zulassungsfähigkeit —
// Details in audit/dipa/eul_konzept.md.
// ═══════════════════════════════════════════════════════════════

export type EulLeistungsart =
  | 'einweisung'
  | 'technische_unterstuetzung'
  | 'begleitete_nutzung'
  | 'schulung_angehoerige'
  | 'auswertungsgespraech'

export type EulDurchfuehrungsform = 'persoenlich_vor_ort' | 'telefonisch' | 'video'

export const EUL_LEISTUNGSARTEN: EulLeistungsart[] = [
  'einweisung', 'technische_unterstuetzung', 'begleitete_nutzung',
  'schulung_angehoerige', 'auswertungsgespraech',
]

export const EUL_DURCHFUEHRUNGSFORMEN: EulDurchfuehrungsform[] = [
  'persoenlich_vor_ort', 'telefonisch', 'video',
]

export interface EulLeistungsartDefinition {
  key: EulLeistungsart
  bezeichnung: string
  beschreibung: string
  /** Was im Nachweis stehen muss, damit die Leistung belegt ist. */
  nachweisinhalt: string[]
  /** Typische Dauer als Orientierung für die Erfassung — keine Vorgabe. */
  richtdauerMinuten: number
}

export const EUL_DEFINITIONEN: Record<EulLeistungsart, EulLeistungsartDefinition> = {
  einweisung: {
    key: 'einweisung',
    bezeichnung: 'Erstinstallation und Einweisung',
    beschreibung:
      'Einrichtung des Zugangs, Erklärung der Bedienung, Anpassung der Darstellung (Schriftgröße, Kontrast).',
    nachweisinhalt: ['Datum und Dauer', 'Wer eingewiesen wurde', 'Welche Funktionen erklärt wurden'],
    richtdauerMinuten: 60,
  },
  technische_unterstuetzung: {
    key: 'technische_unterstuetzung',
    bezeichnung: 'Technische Unterstützung',
    beschreibung:
      'Hilfe bei Anmeldung, Gerät, Verbindung oder Bedienproblemen — auf Anforderung der nutzenden Person.',
    nachweisinhalt: ['Anlass der Unterstützung', 'Was gelöst wurde', 'Dauer'],
    richtdauerMinuten: 30,
  },
  begleitete_nutzung: {
    key: 'begleitete_nutzung',
    bezeichnung: 'Begleitete Nutzung',
    beschreibung:
      'Gemeinsames Durcharbeiten von Inhalten oder Übungen in Anwesenheit einer Begleitperson.',
    nachweisinhalt: ['Welche Inhalte gemeinsam bearbeitet wurden', 'Dauer', 'Beobachtungen zur Selbständigkeit'],
    richtdauerMinuten: 45,
  },
  schulung_angehoerige: {
    key: 'schulung_angehoerige',
    bezeichnung: 'Schulung pflegender Angehöriger',
    beschreibung:
      'Anleitung von Angehörigen zur Nutzung der Anwendung und zur Umsetzung im Pflegealltag.',
    nachweisinhalt: ['Teilnehmende (Rolle, nicht Diagnose)', 'Themen', 'Dauer'],
    richtdauerMinuten: 60,
  },
  auswertungsgespraech: {
    key: 'auswertungsgespraech',
    bezeichnung: 'Auswertungsgespräch',
    beschreibung:
      'Gemeinsame Durchsicht des Verlaufs, Anpassung der selbst gesetzten Ziele, Klärung offener Fragen.',
    nachweisinhalt: ['Besprochene Zielanpassungen', 'Vereinbarungen', 'Dauer'],
    richtdauerMinuten: 45,
  },
}

export const EUL_LEISTUNGSART_LABELS: Record<EulLeistungsart, string> = {
  einweisung: EUL_DEFINITIONEN.einweisung.bezeichnung,
  technische_unterstuetzung: EUL_DEFINITIONEN.technische_unterstuetzung.bezeichnung,
  begleitete_nutzung: EUL_DEFINITIONEN.begleitete_nutzung.bezeichnung,
  schulung_angehoerige: EUL_DEFINITIONEN.schulung_angehoerige.bezeichnung,
  auswertungsgespraech: EUL_DEFINITIONEN.auswertungsgespraech.bezeichnung,
}

export const EUL_DURCHFUEHRUNGSFORM_LABELS: Record<EulDurchfuehrungsform, string> = {
  persoenlich_vor_ort: 'Persönlich vor Ort',
  telefonisch: 'Telefonisch',
  video: 'Videogespräch',
}

// ───────────────────────────────────────────────────────────────
// Qualitätsanforderungen an eUL-Erbringer (konfigurierbarer Katalog)
// ───────────────────────────────────────────────────────────────
// KEINE ERFUNDENEN VORGABEN: Welche Qualifikation regulatorisch gefordert
// ist, ist offen (audit/dipa/eul_qualitaetsanforderungen.md). Die
// Kriterien hier sind der SELBST GESETZTE Qualitätsstandard von
// Alltagsengel. Kriterien mit `regulatorischGefordert: 'offen'` sind
// intern begründet und vor einer Antragstellung zu verifizieren.

export type RegulatorischerStatus = 'offen' | 'intern_gesetzt'

export interface EulQualitaetsKriterium {
  key: string
  bezeichnung: string
  anforderung: string
  nachweisform: string[]
  /** Muss erfüllt sein, bevor eine Person eUL erbringen darf. */
  pflicht: boolean
  regulatorischGefordert: RegulatorischerStatus
  /** Wiederholungsintervall in Monaten; null = einmalig. */
  wiederholungMonate: number | null
}

export const EUL_QUALITAETSKRITERIEN: EulQualitaetsKriterium[] = [
  {
    key: 'produkteinweisung',
    bezeichnung: 'Einweisung in den Digitalen PflegeCoach',
    anforderung:
      'Die Person wurde nachweislich in Funktionsumfang, Grenzen und Datenschutzregeln der Anwendung eingewiesen.',
    nachweisform: ['Einweisungsprotokoll mit Datum und Unterschrift'],
    pflicht: true,
    regulatorischGefordert: 'intern_gesetzt',
    wiederholungMonate: 24,
  },
  {
    key: 'pflegerische_grundqualifikation',
    bezeichnung: 'Pflegerische Grundqualifikation oder Betreuungsqualifikation',
    anforderung:
      'Abgeschlossene pflegerische Ausbildung oder anerkannte Betreuungs-/Alltagsbegleitungsqualifikation.',
    nachweisform: ['Zeugnis', 'Zertifikat', 'Nachweis über anerkannte Schulung'],
    pflicht: true,
    regulatorischGefordert: 'offen',
    wiederholungMonate: null,
  },
  {
    key: 'datenschutzunterweisung',
    bezeichnung: 'Datenschutzunterweisung',
    anforderung:
      'Unterweisung zum Umgang mit Gesundheitsdaten und zur Verschwiegenheit, dokumentiert und unterschrieben.',
    nachweisform: ['Unterweisungsnachweis', 'Verpflichtungserklärung'],
    pflicht: true,
    regulatorischGefordert: 'intern_gesetzt',
    wiederholungMonate: 12,
  },
  {
    key: 'abgrenzungskompetenz',
    bezeichnung: 'Kenntnis der Leistungsabgrenzung',
    anforderung:
      'Die Person kennt die Grenze zwischen Begleitung bei der Nutzung und pflegefachlicher oder medizinischer Beratung und hält sie ein.',
    nachweisform: ['Schulungsteilnahme', 'Bestätigung im Einweisungsprotokoll'],
    pflicht: true,
    regulatorischGefordert: 'intern_gesetzt',
    wiederholungMonate: 24,
  },
  {
    key: 'fuehrungszeugnis',
    bezeichnung: 'Erweitertes Führungszeugnis',
    anforderung: 'Vorlage eines aktuellen erweiterten Führungszeugnisses vor dem ersten Einsatz.',
    nachweisform: ['Führungszeugnis (Einsichtnahme dokumentiert)'],
    pflicht: true,
    regulatorischGefordert: 'intern_gesetzt',
    wiederholungMonate: 60,
  },
]

export interface QualifikationsZeile {
  kriterium_key: string
  erfuellt: boolean
  gueltig_bis: string | null
}

export type EulEinsatzFreigabe =
  | { freigegeben: true }
  | { freigegeben: false; fehlend: string[] }

/**
 * Darf diese Person eUL erbringen? Fail-closed: fehlt ein Pflichtnachweis
 * oder ist er abgelaufen, ist der Einsatz nicht freigegeben.
 *
 * @param heute ISO-Datum, injiziert für Testbarkeit
 */
export function pruefeEulFreigabe(zeilen: QualifikationsZeile[], heute: string): EulEinsatzFreigabe {
  const vorhanden = new Map(zeilen.map(z => [z.kriterium_key, z]))
  const fehlend: string[] = []

  for (const kriterium of EUL_QUALITAETSKRITERIEN) {
    if (!kriterium.pflicht) continue
    const zeile = vorhanden.get(kriterium.key)
    if (!zeile || !zeile.erfuellt) {
      fehlend.push(kriterium.bezeichnung)
      continue
    }
    if (zeile.gueltig_bis && zeile.gueltig_bis < heute) {
      fehlend.push(`${kriterium.bezeichnung} (abgelaufen)`)
    }
  }

  return fehlend.length ? { freigegeben: false, fehlend } : { freigegeben: true }
}

// ───────────────────────────────────────────────────────────────
// Abgrenzung digital ↔ persönlich
// ───────────────────────────────────────────────────────────────

export interface AbgrenzungsRegel {
  taetigkeit: string
  einordnung: 'digital_dipa' | 'persoenlich_eul' | 'weder_noch'
  begruendung: string
}

/**
 * Entscheidungshilfe für die Erfassung: Was ist DiPA-Nutzung, was ist
 * eUL, was ist keines von beidem. Wird im Admin-Bereich angezeigt und ist
 * Grundlage der Nachweisführung.
 */
export const ABGRENZUNG: AbgrenzungsRegel[] = [
  {
    taetigkeit: 'Nutzer arbeitet allein mit der App (Übungen, Wochenplan, Ziele)',
    einordnung: 'digital_dipa',
    begruendung: 'Kernnutzung der digitalen Anwendung, keine Anwesenheit einer Begleitperson.',
  },
  {
    taetigkeit: 'Begleitperson richtet den Zugang ein und erklärt die Bedienung',
    einordnung: 'persoenlich_eul',
    begruendung: 'Persönliche Leistung mit direktem Bezug zur Nutzung der Anwendung.',
  },
  {
    taetigkeit: 'Begleitperson übt gemeinsam mit dem Nutzer die App-Inhalte',
    einordnung: 'persoenlich_eul',
    begruendung: 'Persönliche Begleitung der Nutzung; die App-Nutzung selbst bleibt DiPA.',
  },
  {
    taetigkeit: 'Haushaltshilfe, Einkauf, Begleitung zum Arzt',
    einordnung: 'weder_noch',
    begruendung:
      'Allgemeine Alltagsbegleitung ohne Bezug zur digitalen Anwendung — läuft über die regulären Leistungen.',
  },
  {
    taetigkeit: 'Pflegefachliche Beratung oder Anleitung zu Pflegetechniken',
    einordnung: 'weder_noch',
    begruendung:
      'Eigenständige pflegerische Leistung. Sie ist nicht Teil der digitalen Anwendung und darf nicht als eUL erfasst werden.',
  },
]

export function istEulLeistungsart(wert: unknown): wert is EulLeistungsart {
  return typeof wert === 'string' && (EUL_LEISTUNGSARTEN as string[]).includes(wert)
}

export function istEulDurchfuehrungsform(wert: unknown): wert is EulDurchfuehrungsform {
  return typeof wert === 'string' && (EUL_DURCHFUEHRUNGSFORMEN as string[]).includes(wert)
}

/**
 * Ist ein Nachweis vollständig genug, um bestätigt zu werden?
 * Der Nachweis ist die Grundlage jeder späteren Abrechnung — deshalb
 * prüfen wir Inhalt und Dauer, nicht nur das Vorhandensein der Zeile.
 */
export function pruefeNachweisVollstaendig(e: {
  leistungsart: string
  datum: string
  dauer_minuten: number
  inhalt: string
  erbringer_name: string | null
  qualifikation_geprueft: boolean
}): { vollstaendig: true } | { vollstaendig: false; fehlend: string[] } {
  const fehlend: string[] = []
  if (!istEulLeistungsart(e.leistungsart)) fehlend.push('Gültige Leistungsart')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) fehlend.push('Datum')
  if (!(e.dauer_minuten >= 1 && e.dauer_minuten <= 480)) fehlend.push('Dauer (1–480 Minuten)')
  if (!e.inhalt || e.inhalt.trim().length < 10) fehlend.push('Inhaltliche Beschreibung (mindestens 10 Zeichen)')
  if (!e.erbringer_name || !e.erbringer_name.trim()) fehlend.push('Name der erbringenden Person')
  if (!e.qualifikation_geprueft) fehlend.push('Bestätigte Qualifikation der erbringenden Person')
  return fehlend.length ? { vollstaendig: false, fehlend } : { vollstaendig: true }
}
