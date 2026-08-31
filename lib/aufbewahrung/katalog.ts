// ═══════════════════════════════════════════════════════════════════════
// Der Aufbewahrungskatalog — EINE Stelle, an der Fristen entschieden werden
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DIESE DATEI GIBT
//
// Es gab schon eine Aufbewahrung: `lib/perimeter/aufbewahrung.ts`, gebaut
// fuer die vier Tabellen, die die oeffentliche Website ohne Anmeldung
// befuellt. Sie ist richtig gebaut — zwei Stufen (IP kuerzen, dann Zeile
// loeschen), Trockenlauf als Standard, ausgenommene Tabellen mit
// Begruendung statt stillschweigendem Weglassen.
//
// Sie deckt aber nur den Perimeter ab. Alles, was der BETRIEB erzeugt,
// hatte keine Frist: `geo_events` (Standortnachweise der Einsaetze) und
// `offline_queue` (in der App gepufferte Aenderungen) wachsen unbegrenzt.
//
// Zwei getrennte Systeme dafuer zu bauen waere der Fehler. Es gaebe dann
// zwei Orte, an denen „wie lange heben wir das auf?" beantwortet wird,
// und ein dritter Bereich landete beim naechsten Mal in einem dritten.
// Diese Datei ist deshalb der GEMEINSAME Katalog: die Perimeter-Regeln
// kommen unveraendert aus ihrem Modul herueber, die Betriebsregeln
// stehen daneben, und beide laufen durch denselben Ablauf.
//
// ── KONFIGURIERBAR HEISST: ENV SCHLAEGT VORGABE ───────────────────────
//
// Jede Regel nennt einen ENV-Schluessel. Steht dort eine Zahl, gilt sie;
// sonst die Vorgabe aus dem Katalog. Die Vorgabe ist damit kein
// festverdrahteter Wert, sondern der Standardfall — und eine Anpassung
// braucht kein Deployment.
//
// Ein UNGUELTIGER Wert (Null, negativ, keine Zahl) faellt NICHT stumm auf
// die Vorgabe zurueck: `fristAus` meldet ihn. Ein Tippfehler in einer
// Aufbewahrungsfrist darf nicht als „dann eben der Standard" durchgehen —
// wer `0` schreibt, meint vielleicht „sofort loeschen", und das waere das
// Gegenteil einer harmlosen Fehlkonfiguration.
//
// ── WOHER DIE ZAHLEN KOMMEN ───────────────────────────────────────────
//
// Es wird hier keine gesetzliche Frist erfunden. Fuer Betriebsdaten
// dieser Art gibt es keine; es gibt die Pflicht, eine zu HABEN (Art. 5
// Abs. 1 lit. e DSGVO, Speicherbegrenzung). Die Werte sind
// Betriebsentscheidungen mit Begruendung an der Regel.

import {
  AUFBEWAHRUNG as PERIMETER_REGELN,
  NICHT_AUTOMATISCH as PERIMETER_AUSGENOMMEN,
  type AufbewahrungsEintrag,
} from '../perimeter/aufbewahrung'

/** Fachbereich, aus dem die Regel stammt — nur fuer die Berichte. */
export type Aufbewahrungsbereich = 'perimeter' | 'betrieb'

export interface AufbewahrungsRegel extends AufbewahrungsEintrag {
  bereich: Aufbewahrungsbereich
  /**
   * ENV-Schluessel, der `loeschFristTage` ueberschreibt.
   *
   * Namensschema `AUFBEWAHRUNG_<TABELLE>_TAGE`, damit man vom Tabellennamen
   * auf den Schluessel schliessen kann und nicht nachsehen muss.
   */
  envSchluessel: string
  /** ENV-Schluessel fuer `ipFristTage`, wo es eine IP-Stufe gibt. */
  envSchluesselIp?: string
  /**
   * Zusaetzliche Bedingung, die eine Zeile vor der Loeschung bewahrt.
   *
   * Deklarativ, damit sie im Bericht lesbar ist und nicht in einer
   * Funktion verschwindet. Wird als PostgREST-Filter angehaengt:
   * `.<operator>(spalte, wert)`.
   */
  schutz?: {
    spalte: string
    /** PostgREST-Operator, z. B. `in` oder `eq`. */
    operator: 'in' | 'eq' | 'neq'
    wert: string | readonly string[]
    begruendung: string
  }
}

/**
 * Die Perimeter-Regeln, unveraendert uebernommen.
 *
 * Sie werden hier NICHT abgeschrieben, sondern importiert. Eine Kopie
 * waere die naechste Liste, die auseinanderlaeuft — genau der Fehler, den
 * das Status-Vokabular der Rechnungen zweimal gemacht hat.
 */
const perimeter: AufbewahrungsRegel[] = PERIMETER_REGELN.map(r => ({
  ...r,
  bereich: 'perimeter' as const,
  envSchluessel: `AUFBEWAHRUNG_${r.tabelle.toUpperCase()}_TAGE`,
  envSchluesselIp: r.ipSpalte ? `AUFBEWAHRUNG_${r.tabelle.toUpperCase()}_IP_TAGE` : undefined,
}))

const betrieb: AufbewahrungsRegel[] = [
  {
    bereich: 'betrieb',
    tabelle: 'geo_events',
    zeitSpalte: 'created_at',
    loeschFristTage: 14,
    envSchluessel: 'AUFBEWAHRUNG_GEO_EVENTS_TAGE',
    // ── DIE SCHUTZBEDINGUNG IST HIER KEIN ZUSATZ, SONDERN DER KERN ────
    //
    // Ein geo_event ist der Standortnachweis eines Einsatzes: „die
    // Betreuungskraft war um 09:02 in 60311, 18 m vom Klienten entfernt".
    // Er haengt an einem `service_record` und ist damit ein BELEG fuer
    // eine abzurechnende Leistung, kein Messwert.
    //
    // 14 Tage sind KUERZER ALS EIN ABRECHNUNGSZEITRAUM. Ein Einsatz vom
    // 3. eines Monats wird am Monatsende abgerechnet; ohne Schutz waere
    // sein Standortnachweis zu diesem Zeitpunkt schon weg — und mit ihm
    // die Antwort auf jede spaetere Rueckfrage des Kostentraegers.
    //
    // Deshalb: geloescht wird nur, was KEINEN Nachweis mehr traegt
    // (service_record_id IS NULL). Alles andere haengt am Nachweis und
    // teilt dessen Schicksal — es verschwindet mit ihm ueber die
    // Fremdschluessel-Kaskade, nicht ueber einen Kalender.
    schutz: {
      spalte: 'service_record_id',
      operator: 'eq',
      wert: 'IST_NULL',
      begruendung:
        'Nur Ereignisse ohne Leistungsnachweis werden entfernt. Ein geo_event an einem service_record ist '
        + 'der Standortbeleg einer abzurechnenden Leistung; 14 Tage sind kuerzer als ein Abrechnungszeitraum, '
        + 'und ein geloeschter Beleg laesst sich nicht wiederherstellen.',
    },
    begruendung:
      'Check-in/Check-out-Punkte der Einsatz-App (Breitengrad, Laengengrad, Genauigkeit, Abstand zum '
      + 'Klienten). Ein Bewegungsprofil der Mitarbeitenden — deshalb kurz. Live 0 Zeilen (31.08.2026), '
      + 'die Frist greift also ab dem ersten Einsatz mit Standorterfassung. BETRIEBSENTSCHEIDUNG.',
  },
  {
    bereich: 'betrieb',
    tabelle: 'offline_queue',
    zeitSpalte: 'created_at',
    loeschFristTage: 30,
    envSchluessel: 'AUFBEWAHRUNG_OFFLINE_QUEUE_TAGE',
    // Eine Zeile auf `pending` oder `conflict` ist eine Aenderung, die den
    // Server NIE erreicht hat: eine Zeiterfassung, eine Dokumentation, ein
    // Statuswechsel aus einem Funkloch. Sie nach 30 Tagen zu loeschen
    // hiesse, die Arbeit einer Kollegin wegzuwerfen, weil die Synchronisation
    // nicht durchkam. Weg darf nur, was angekommen ist — oder was endgueltig
    // gescheitert und damit bereits an anderer Stelle als Fehler erfasst ist.
    schutz: {
      spalte: 'status',
      operator: 'in',
      wert: ['synced', 'failed'],
      begruendung:
        'Nur uebertragene (`synced`) und endgueltig gescheiterte (`failed`) Eintraege werden entfernt. '
        + '`pending` und `conflict` sind Aenderungen, die den Server nie erreicht haben — sie zu loeschen '
        + 'hiesse, die Arbeit einer Kollegin wegzuwerfen, weil die Synchronisation nicht durchkam.',
    },
    begruendung:
      'In der App gepufferte Aenderungen (Nutzlast als JSON, Geraetekennung, Nutzer). Nach der '
      + 'Uebertragung ist der Inhalt in der Zieltabelle und hier nur noch eine Kopie — eine Kopie, die '
      + 'Gesundheits- und Zeitdaten mitfuehrt. Live 0 Zeilen (31.08.2026). BETRIEBSENTSCHEIDUNG.',
  },
]

/** Alle Regeln, Perimeter und Betrieb, in einer Liste. */
export const AUFBEWAHRUNGSKATALOG: readonly AufbewahrungsRegel[] = [...perimeter, ...betrieb]

/**
 * Tabellen, die AUSDRUECKLICH keine automatische Frist bekommen.
 *
 * Dieselbe Rolle wie der Loeschkatalog bei der Kontoloeschung: „wird
 * nicht geloescht" soll eine Entscheidung sein und kein Vergessen.
 */
export const NICHT_AUTOMATISCH: readonly { tabelle: string; begruendung: string }[] = [
  ...PERIMETER_AUSGENOMMEN,
  {
    tabelle: 'personal_audit_log',
    begruendung:
      'Revisionsspur des Personalbereichs. Sie ist per Trigger unveraenderlich („HR-Audit-Log ist '
      + 'unveraenderlich (Revisionssicherheit)") — eine Loeschfrist waere ein Widerspruch zu genau der '
      + 'Eigenschaft, wegen der sie gefuehrt wird. Ihre Frist ergibt sich aus der Aufbewahrungspflicht der '
      + 'Personalakte und gehoert nicht in einen naechtlichen Lauf.',
  },
  {
    tabelle: 'service_records',
    begruendung:
      'Leistungsnachweise sind Rechnungsgrundlage und unterliegen der handels- und steuerrechtlichen '
      + 'Aufbewahrung (§ 147 AO, § 257 HGB). Ein unterschriebener Nachweis ist zudem `is_locked` und laesst '
      + 'sich nicht einmal aendern. Hier entscheidet kein Kalender, sondern die Aufbewahrungspflicht.',
  },
  {
    tabelle: 'security_audit_log',
    begruendung:
      'Fuehrt bereits eine eigene Bereinigung mit (`security_audit_log_aufraeumen`, Migration '
      + '20261018000002). Eine zweite Frist daneben waere eine zweite Antwort auf dieselbe Frage.',
  },
]

export interface FristBefund {
  tage: number
  /** Woher der Wert stammt — fuer den Bericht des Laufs. */
  quelle: 'vorgabe' | 'umgebung'
  /** Gesetzt, wenn ein ENV-Wert vorlag und verworfen wurde. */
  warnung?: string
}

/**
 * Loest eine Frist auf: ENV schlaegt Vorgabe.
 *
 * Ein unbrauchbarer ENV-Wert faellt NICHT stumm auf die Vorgabe zurueck,
 * sondern wird gemeldet. Wer `AUFBEWAHRUNG_GEO_EVENTS_TAGE=0` setzt, meint
 * moeglicherweise „sofort loeschen" — das still als „dann eben 14 Tage" zu
 * lesen, waere die gefaehrlichere Auslegung.
 */
export function fristAus(
  schluessel: string | undefined,
  vorgabe: number,
  env: Record<string, string | undefined> = process.env,
): FristBefund {
  if (!schluessel) return { tage: vorgabe, quelle: 'vorgabe' }
  const roh = env[schluessel]
  if (roh === undefined || roh.trim() === '') return { tage: vorgabe, quelle: 'vorgabe' }

  const zahl = Number(roh.trim())
  if (!Number.isInteger(zahl) || zahl < 1) {
    return {
      tage: vorgabe,
      quelle: 'vorgabe',
      warnung:
        `${schluessel}="${roh}" ist keine Anzahl von Tagen (erwartet: ganze Zahl ≥ 1). `
        + `Es gilt die Vorgabe ${vorgabe} — der Wert wurde NICHT uebernommen.`,
    }
  }
  return { tage: zahl, quelle: 'umgebung' }
}

export interface AufgelosteRegel extends AufbewahrungsRegel {
  loeschFrist: FristBefund
  ipFrist?: FristBefund
}

/** Der Katalog mit aufgeloesten Fristen — die Fassung, die der Lauf benutzt. */
export function katalogMitFristen(
  env: Record<string, string | undefined> = process.env,
): AufgelosteRegel[] {
  return AUFBEWAHRUNGSKATALOG.map(regel => ({
    ...regel,
    loeschFrist: fristAus(regel.envSchluessel, regel.loeschFristTage, env),
    ipFrist: regel.ipFristTage != null
      ? fristAus(regel.envSchluesselIp, regel.ipFristTage, env)
      : undefined,
  }))
}

/** Alle ENV-Schluessel, mit denen sich Fristen stellen lassen. */
export function alleEnvSchluessel(): string[] {
  const namen: string[] = []
  for (const r of AUFBEWAHRUNGSKATALOG) {
    namen.push(r.envSchluessel)
    if (r.envSchluesselIp) namen.push(r.envSchluesselIp)
  }
  return namen.sort()
}
