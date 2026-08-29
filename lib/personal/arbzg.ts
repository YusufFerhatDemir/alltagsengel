/**
 * Arbeitszeitgesetz (ArbZG) — die Regeln an EINER Stelle.
 *
 * WARUM ES DIESE DATEI GIBT (Befund GAP-13, 29.08.2026):
 *
 * Die ArbZG-Pruefung des Projekts lebte bisher ausschliesslich im
 * DB-Trigger `arbzg_pruefung()` auf `dienstplan_eintraege` — also auf dem
 * PLAN. Die tatsaechlich erfasste Arbeitszeit (`personal_arbeitszeiten`)
 * wurde nie geprueft. Das ist genau die falsche Haelfte: das ArbZG bindet
 * an die geleistete Arbeitszeit, nicht an die geplante. Wer 8 h eingeplant
 * bekommt und 11,5 h arbeitet, erzeugt einen Verstoss, den heute nichts
 * sieht — der Plan bleibt ja unauffaellig.
 *
 * Ausserdem fehlte § 4 ArbZG (Ruhepausen) vollstaendig. Geprueft wurden nur
 * § 3 (Tageshoechstarbeitszeit) und § 5 (Ruhezeit).
 *
 * DIE RECHENGRUNDLAGE: `arbeitszeit` im Sinne von § 3 und § 4 ArbZG ist die
 * Zeit OHNE Ruhepausen (§ 2 Abs. 1 ArbZG). In `personal_arbeitszeiten`
 * entspricht das `ist_minuten` — die Oberflaeche rechnet
 * `(Ende − Start) − Pause`. `nettoMinuten()` hier bildet dieselbe Rechnung
 * ab, damit der Server sie NACHRECHNEN kann statt sie zu glauben.
 *
 * NACHTDIENST: ein Ende vor dem Beginn ist kein Fehler, sondern ein Dienst
 * ueber Mitternacht. Wer naiv subtrahiert, bekommt fuer 22:00–06:00 minus
 * 16 Stunden — dieselbe Falle wie bei `duration_minutes` und bei
 * `dienstDauer()` in `lib/pdl/dienstplanfreigabe.ts`.
 *
 * BEWUSST NICHT BLOCKIEREND: die Befunde dieser Datei protokollieren, sie
 * verbieten nicht. Ein hartes Verbot wuerde in Notfaellen (spontaner
 * Ausfallersatz) die Einsatzplanung lahmlegen — dieselbe Entscheidung wie
 * in `20260920060000_arbeitszeit_verstoesse.sql`. Die PDL entscheidet ueber
 * `quittiereVerstoss()`, und diese Entscheidung verlangt eine Begruendung.
 */

/** § 3 ArbZG: werktaeglich 8 h, verlaengerbar auf hoechstens 10 h. */
export const MAX_TAGESARBEITSZEIT_MINUTEN = 600

/** § 5 Abs. 1 ArbZG: mindestens 11 h ununterbrochene Ruhezeit. */
export const MIN_RUHEZEIT_MINUTEN = 660

/**
 * § 4 ArbZG: Ruhepausen.
 *   mehr als  6 h bis  9 h → mindestens 30 min
 *   mehr als  9 h         → mindestens 45 min
 *   bis einschliesslich 6 h → keine Pflichtpause
 *
 * Die Schwellen sind „mehr als", nicht „ab": exakt 360 Minuten Arbeitszeit
 * loesen KEINE Pausenpflicht aus. Genau 6 h ohne Pause ist zulaessig.
 */
export const PFLICHTPAUSE_STUFEN = [
  { abMinutenAusschliesslich: 540, pauseMinuten: 45 },
  { abMinutenAusschliesslich: 360, pauseMinuten: 30 },
] as const

/** Die Arten, die `arbeitszeit_verstoesse.verstoss_art` kennt. */
export type VerstossArt =
  | 'max_tagesarbeitszeit'
  | 'mindestruhezeit'
  | 'pflichtpause'

export interface ArbzgBefund {
  art: VerstossArt
  /** Der gemessene Wert in Minuten (Arbeitszeit, Ruhezeit bzw. Pause). */
  gemessenMinuten: number
  /** Der Grenzwert, an dem gemessen wurde. */
  grenzwertMinuten: number
}

/**
 * Nach § 4 ArbZG mindestens zu gewaehrende Ruhepause bei dieser
 * Arbeitszeit (netto, also ohne Pause).
 */
export function pflichtpauseMinuten(nettoMinuten: number): number {
  if (!Number.isFinite(nettoMinuten) || nettoMinuten <= 0) return 0
  for (const stufe of PFLICHTPAUSE_STUFEN) {
    if (nettoMinuten > stufe.abMinutenAusschliesslich) return stufe.pauseMinuten
  }
  return 0
}

/** "08:30" bzw. "08:30:00" → 510. Gibt `null` bei unbrauchbarer Eingabe. */
export function zeitZuMinuten(zeit: string | null | undefined): number | null {
  if (typeof zeit !== 'string') return null
  const treffer = zeit.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!treffer) return null
  const stunden = Number(treffer[1])
  const minuten = Number(treffer[2])
  if (stunden > 23 || minuten > 59) return null
  return stunden * 60 + minuten
}

/**
 * Netto-Arbeitszeit in Minuten: `(Ende − Start) − Pause`, Mitternacht
 * beruecksichtigt. Gibt `null`, wenn Start oder Ende unbrauchbar sind.
 *
 * Ein Ergebnis <= 0 (Pause laenger als der Dienst) wird als 0 gemeldet,
 * nicht als negative Zahl — die Plausibilitaetspruefung in
 * `assertPlausibleZeiten` weist so etwas ohnehin ab, und eine negative
 * Arbeitszeit hier wuerde jede nachgelagerte Rechnung vergiften.
 */
export function nettoMinuten(
  startZeit: string | null | undefined,
  endZeit: string | null | undefined,
  pauseMinuten: number | null | undefined,
): number | null {
  const start = zeitZuMinuten(startZeit)
  const ende = zeitZuMinuten(endZeit)
  if (start == null || ende == null) return null
  const brutto = ende > start ? ende - start : 24 * 60 - start + ende
  const pause = Number.isFinite(Number(pauseMinuten)) ? Number(pauseMinuten) : 0
  return Math.max(0, brutto - Math.max(0, pause))
}

export interface ArbeitszeitTag {
  startZeit: string
  endZeit: string
  pauseMinuten?: number | null
  /**
   * Netto-Arbeitszeit, falls schon bekannt. Fehlt sie, wird sie aus
   * Start/Ende/Pause gerechnet. Sie zu uebergeben ist nur dort richtig, wo
   * der Wert bereits serverseitig hergeleitet wurde.
   */
  istMinuten?: number | null
}

/**
 * § 3 und § 4 ArbZG fuer EINEN erfassten Arbeitstag.
 *
 * Gibt eine (moeglicherweise leere) Liste zurueck — nie einen Wurf. Der
 * Aufrufer entscheidet, was er damit tut; das ist die Trennung zwischen
 * „Regel" und „Folge".
 */
export function pruefeArbeitstag(tag: ArbeitszeitTag): ArbzgBefund[] {
  const netto = tag.istMinuten != null && Number.isFinite(Number(tag.istMinuten))
    ? Number(tag.istMinuten)
    : nettoMinuten(tag.startZeit, tag.endZeit, tag.pauseMinuten)
  if (netto == null) return []

  const befunde: ArbzgBefund[] = []

  if (netto > MAX_TAGESARBEITSZEIT_MINUTEN) {
    befunde.push({
      art: 'max_tagesarbeitszeit',
      gemessenMinuten: netto,
      grenzwertMinuten: MAX_TAGESARBEITSZEIT_MINUTEN,
    })
  }

  const pflicht = pflichtpauseMinuten(netto)
  const gewaehrt = Number.isFinite(Number(tag.pauseMinuten)) ? Number(tag.pauseMinuten) : 0
  if (pflicht > 0 && gewaehrt < pflicht) {
    befunde.push({
      art: 'pflichtpause',
      gemessenMinuten: Math.max(0, gewaehrt),
      grenzwertMinuten: pflicht,
    })
  }

  return befunde
}

export interface RuhezeitFenster {
  /** Datum des frueheren Dienstes, ISO (`YYYY-MM-DD`). */
  datumVorher: string
  startZeitVorher: string
  endZeitVorher: string
  /** Datum des spaeteren Dienstes, ISO. */
  datumNachher: string
  startZeitNachher: string
}

/**
 * Minuten seit Epoche 00:00 UTC fuer ein ISO-Datum. `null` bei Unfug.
 *
 * Datumsarithmetik ueber `Date.parse` mit festem `Z`, NICHT ueber die
 * lokale Zeitzone: `new Date('2026-08-29')` und `new Date('2026-08-29
 * 00:00')` liegen in Berlin zwei Stunden auseinander, und genau daran
 * kippt eine Ruhezeitrechnung an der Sommerzeitgrenze.
 */
function tagInMinuten(datum: string): number | null {
  if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null
  const ms = Date.parse(`${datum}T00:00:00Z`)
  return Number.isFinite(ms) ? ms / 60_000 : null
}

/**
 * § 5 ArbZG fuer den Abstand zwischen zwei aufeinanderfolgenden Diensten
 * derselben Person.
 *
 * Das Ende des frueheren Dienstes faellt bei einem Nachtdienst auf den
 * FOLGETAG. Genau das ist der Fall, in dem eine naive Rechnung 20 Stunden
 * Ruhezeit meldet, wo tatsaechlich 8 liegen: Dienst 22:00–06:00 am 01.,
 * naechster Dienst 14:00 am 02. — das Ende liegt am 02. um 06:00, der
 * Abstand betraegt 8 Stunden, nicht 20. Deshalb braucht diese Funktion den
 * BEGINN des frueheren Dienstes: nur daran ist ablesbar, ob sein Ende
 * ueber Mitternacht gerutscht ist.
 *
 * Gibt `null`, wenn die Ruhezeit eingehalten ist, die Reihenfolge nicht
 * stimmt oder die Eingabe unbrauchbar ist.
 */
export function pruefeRuhezeit(fenster: RuhezeitFenster): ArbzgBefund | null {
  const beginnVorher = zeitZuMinuten(fenster.startZeitVorher)
  const endeVorher = zeitZuMinuten(fenster.endZeitVorher)
  const beginnNachher = zeitZuMinuten(fenster.startZeitNachher)
  if (beginnVorher == null || endeVorher == null || beginnNachher == null) return null

  const tagVorher = tagInMinuten(fenster.datumVorher)
  const tagNachher = tagInMinuten(fenster.datumNachher)
  if (tagVorher == null || tagNachher == null) return null

  const ueberMitternacht = endeVorher <= beginnVorher ? 24 * 60 : 0
  const endeAbsolut = tagVorher + endeVorher + ueberMitternacht
  const beginnAbsolut = tagNachher + beginnNachher

  const abstand = beginnAbsolut - endeAbsolut
  // Ein negativer Abstand ist keine kurze Ruhezeit, sondern eine
  // Ueberschneidung — die faengt `check_doppelbelegung` ab, und sie hier
  // als „0 Minuten Ruhezeit" zu melden wuerde denselben Sachverhalt ein
  // zweites Mal und unter falschem Namen protokollieren.
  if (abstand < 0) return null
  if (abstand >= MIN_RUHEZEIT_MINUTEN) return null
  return {
    art: 'mindestruhezeit',
    gemessenMinuten: abstand,
    grenzwertMinuten: MIN_RUHEZEIT_MINUTEN,
  }
}

/** Klartext fuer die Oberflaeche und fuer Benachrichtigungen. */
export const VERSTOSS_LABEL: Record<VerstossArt, string> = {
  max_tagesarbeitszeit: 'Tageshöchstarbeitszeit überschritten (§ 3 ArbZG)',
  mindestruhezeit: 'Mindestruhezeit unterschritten (§ 5 ArbZG)',
  pflichtpause: 'Ruhepause zu kurz (§ 4 ArbZG)',
}
