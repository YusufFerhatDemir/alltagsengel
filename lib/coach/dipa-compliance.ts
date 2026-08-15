// ═══════════════════════════════════════════════════════════════
// PflegeCoach — DiPA-Compliance-Checks
//
// ZWECK: lib/coach/anforderungskatalog.ts hält die 48 Anforderungen als
// STRUKTUR. Zwei Auswertungen darauf — `antragsBlocker()` (Zeitklasse A,
// nicht erfüllt) und `ZEITKLASSE` selbst — waren bis 15.08.2026 fertig
// geschrieben, aber nirgends verdrahtet: kein Script, keine Seite, kein
// Test rief sie auf. Die Folge: die „drei Eingangsblocker"-Aussage in den
// Prosa-Dokumenten (docs/dipa/21_FINAL_MATRIX_2026-08-15.md) konnte vom
// Katalog abweichen, ohne dass irgendetwas das bemerkt hätte — genau das
// stille Verrotten, gegen das scripts/dipa-katalog-check.ts bei den
// Nachweisdateien schon vorgeht.
//
// Dieses Modul macht zwei Dinge, beide als reine Funktionen (kein IO, wie
// mfa.ts und interop.ts — Testbarkeit vor Bequemlichkeit):
//
//   1. `antragsreife()` — verdichtet `antragsBlocker()` zu einem Bericht,
//      den ein Skript ausgeben und eine Seite anzeigen kann, statt dass
//      beide den Katalog getrennt neu filtern.
//   2. `pruefeDokumentStand()` / `pruefeKritischeDokumente()` — die
//      externen Vorbereitungsdokumente (DSFA, AVV-Dossier, ISMS-Scope,
//      TR-03161-Checkliste, Evaluationskonzept, Inhalte-Prüfdossier,
//      QM-Handbuch) tragen alle ein handschriftliches „**Stand:**
//      JJJJ-MM-TT" — aber nichts prüfte bisher, ob das Datum noch aktuell
//      ist. Ein Dokument, das seit einem halben Jahr nicht mehr
//      angefasst wurde, obwohl sich Rechtslage oder Anbieter geändert
//      haben können, ist ein stiller Nachweis-Verfall.
//
// KEINE ERFUNDENEN ZUSAGEN: Dieses Modul entscheidet nicht, ob eine
// Anforderung erfüllt ist — das bleibt beim Katalog (`stand`,
// `anforderungstextGeprueft`). Es macht nur sichtbar, was aus den
// bestehenden Daten bereits folgt, aber bisher niemand ausgerechnet hat.
// ═══════════════════════════════════════════════════════════════

import {
  ANFORDERUNGSKATALOG, ZEITKLASSE, ZEITKLASSE_LABELS,
  antragsBlocker, katalogFortschritt,
  type KatalogEintrag,
} from './anforderungskatalog'

// ── Antragsreife ─────────────────────────────────────────────────────

export interface AntragsreifeBericht {
  /** Formal vollständig für die Antragstellung? (Zeitklasse A ohne offenen Punkt) */
  bereit: boolean
  /** Offene Zeitklasse-A-Punkte, in Katalogreihenfolge. */
  blocker: KatalogEintrag[]
  /** Wie viele der Blocker in eigener Hand liegen (Klasse A–C) statt extern (D–E). */
  blockerIntern: number
  blockerExtern: number
  /** Gesamtfortschritt des Katalogs, zur Einordnung danebengestellt. */
  fortschritt: ReturnType<typeof katalogFortschritt>
}

/**
 * Verdichtet `antragsBlocker()` (bereits vorhanden, bis 15.08.2026 nie
 * aufgerufen) zu einem Bericht. Einzige neue Logik hier: die Trennung
 * intern/extern unter den Blockern — sie beantwortet die Frage, wie viel
 * von der Antragsreife überhaupt in eigener Hand liegt.
 */
export function antragsreife(
  eintraege: KatalogEintrag[] = ANFORDERUNGSKATALOG
): AntragsreifeBericht {
  const blocker = antragsBlocker(eintraege)
  return {
    bereit: blocker.length === 0,
    blocker,
    blockerIntern: blocker.filter(e => ['A', 'B', 'C'].includes(e.klasse)).length,
    blockerExtern: blocker.filter(e => ['D', 'E'].includes(e.klasse)).length,
    fortschritt: katalogFortschritt(eintraege),
  }
}

/** Kurzform für Log-/Bannerausgabe: „AK-SEC-01 (Datensicherheitszertifikat …)". */
export function formatiereBlocker(eintrag: KatalogEintrag): string {
  const kurz = eintrag.formulierung.length > 72
    ? `${eintrag.formulierung.slice(0, 69)}…`
    : eintrag.formulierung
  return `${eintrag.id} [${eintrag.klasse}] ${kurz}`
}

// ── Dokument-Aktualität ──────────────────────────────────────────────

/**
 * Kritische externe Vorbereitungsdokumente, deren „Stand:"-Datum nicht
 * beliebig alt werden darf — jedes von ihnen hängt an einer Rechtslage
 * oder Anbieterbeziehung, die sich ändern kann, ohne dass das Dokument es
 * bemerkt. Maximalalter ist eine fachliche Setzung (180 Tage ≈ ein
 * DiPAV-Novellierungszyklus), keine Rechtsvorschrift.
 */
export interface KritischesDokument {
  /** Pfad relativ zur Projektwurzel. */
  pfad: string
  /** Welche(r) Katalogpunkt(e) daran hängen — nur zur Einordnung im Bericht. */
  deckt: string[]
  maxTageAlter: number
}

export const KRITISCHE_DOKUMENTE: readonly KritischesDokument[] = [
  { pfad: 'audit/dipa/dsfa_pflegecoach.md', deckt: ['AK-DS-02'], maxTageAlter: 180 },
  { pfad: 'audit/dipa/avv_dossier_pflegecoach.md', deckt: ['AK-DS-04'], maxTageAlter: 180 },
  { pfad: 'audit/dipa/tr03161_checkliste.md', deckt: ['AK-SEC-01'], maxTageAlter: 180 },
  { pfad: 'audit/dipa/isms_scope_vorbereitung.md', deckt: ['AK-SEC-05'], maxTageAlter: 180 },
  { pfad: 'audit/dipa/evaluationskonzept.md', deckt: ['AK-NN-01'], maxTageAlter: 180 },
  { pfad: 'audit/dipa/inhalte_pruefdossier.md', deckt: ['AK-QI-01'], maxTageAlter: 180 },
  { pfad: 'audit/dipa/qms_handbuch_pflegecoach.md', deckt: ['QMS-01'], maxTageAlter: 365 },
] as const

/** Erkennt „**Stand:** JJJJ-MM-TT" (auch mit Folgetext danach, z. B. „ · Block:"). */
const STAND_MUSTER = /\*\*Stand:\*\*\s*(\d{4}-\d{2}-\d{2})/

export interface DokumentStandPruefung {
  gefunden: boolean
  datum: string | null
  tageAlt: number | null
  aktuell: boolean
}

/**
 * Reine Funktion: kein Dateizugriff hier drin (wie überall in lib/coach),
 * damit sie ohne Dateisystem-Mock testbar bleibt. Wer den Dateiinhalt
 * liest, ist Sache des Aufrufers (Skript, Testfall).
 */
export function pruefeDokumentStand(
  inhalt: string,
  heuteIso: string,
  maxTageAlter: number
): DokumentStandPruefung {
  const treffer = inhalt.match(STAND_MUSTER)
  if (!treffer) return { gefunden: false, datum: null, tageAlt: null, aktuell: false }

  const datum = treffer[1]
  const tageAlt = Math.round(
    (Date.parse(`${heuteIso}T00:00:00Z`) - Date.parse(`${datum}T00:00:00Z`)) / 86_400_000
  )
  return { gefunden: true, datum, tageAlt, aktuell: tageAlt >= 0 && tageAlt <= maxTageAlter }
}

export interface KritischesDokumentBefund extends KritischesDokument {
  pruefung: DokumentStandPruefung
}

/**
 * Iteriert `KRITISCHE_DOKUMENTE` gegen einen injizierten Dateileser.
 * `dateiLeser` liefert `null` für eine fehlende Datei (dann `gefunden:
 * false`) — dieselbe Trennung von IO und Logik wie beim Nachweis-Check in
 * scripts/dipa-katalog-check.ts, nur hier als aufrufbare Funktion statt
 * als Skriptblock, damit ein Test sie ohne echtes Dateisystem durchlaufen
 * kann.
 */
export function pruefeKritischeDokumente(
  dateiLeser: (pfad: string) => string | null,
  heuteIso: string,
  dokumente: readonly KritischesDokument[] = KRITISCHE_DOKUMENTE
): KritischesDokumentBefund[] {
  return dokumente.map(dok => {
    const inhalt = dateiLeser(dok.pfad)
    const pruefung = inhalt === null
      ? { gefunden: false, datum: null, tageAlt: null, aktuell: false }
      : pruefeDokumentStand(inhalt, heuteIso, dok.maxTageAlter)
    return { ...dok, pruefung }
  })
}

/** Zeitklassen-Label eines Katalog-Eintrags, oder „—" wenn nicht belegt (Hilfsfunktion für Ausgabe). */
export function zeitklasseLabel(id: string): string {
  const klasse = ZEITKLASSE[id]
  return klasse ? ZEITKLASSE_LABELS[klasse] : '—'
}
