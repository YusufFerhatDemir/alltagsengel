// ═══════════════════════════════════════════════════════════════
// EINSATZ-KONFLIKTE — Überschneidungen erkennen, bevor die DB sie meldet
// ═══════════════════════════════════════════════════════════════
// Befund Bereich 3 der Lückenanalyse (P2): „Kalender und Schedule enthalten
// keinerlei Konflikt-/Überschneidungslogik; ein Konflikt äußert sich erst als
// Datenbankfehler beim Speichern."
//
// Der DB-Trigger `check_assignment_overlap` (Migration 20260808200000) fängt
// die Doppelbelegung EINER Betreuungskraft ab — aber erst beim INSERT, mit
// einer rohen Postgres-Meldung ("DOPPELBELEGUNG: Mitarbeiter <uuid> …"), die
// der Fehler-Sanitizer zu Recht verschluckt. Der Planende sieht also nur, dass
// etwas schiefging, nicht was.
//
// Diese Datei ist bewusst FREI von Server-Importen (kein supabase, kein next):
// dieselbe Funktion prüft serverseitig vor dem Schreiben und markiert
// clientseitig im Kalender. Zwei Implementierungen derselben Regel wären genau
// die Sorte Drift, die den Trigger und die UI auseinanderlaufen lässt.
//
// KEINE zweite Wahrheit gegenüber dem Trigger: die Mitarbeiter-Überschneidung
// hat exakt dieselbe Semantik (gleicher ODER benachbarter Tag bzw. Wochentag,
// echte Zeitüberlappung inklusive Nachteinsatz über Mitternacht — Stand der
// Migration 20261012000000 —, Status STORNIERT/cancelled/NO_SHOW zählen nicht,
// inkl. des Serien-Zweigs mit Wochentag + Gültigkeitsfenster, siehe unten). Zusätzlich —
// und darüber hinaus — wird die Klienten-Überschneidung erkannt, die der
// Trigger NICHT kennt: zwei Betreuungskräfte gleichzeitig bei derselben
// Person. Das ist fachlich nicht immer falsch (Doppelbesetzung beim
// Transfer), deshalb warnt sie nur.
// ═══════════════════════════════════════════════════════════════

/** Status, die keinen Konflikt mehr auslösen — identisch zum DB-Trigger. */
export const KONFLIKTFREIE_STATUS = ['STORNIERT', 'cancelled', 'NO_SHOW'] as const

export interface KonfliktEinsatz {
  id: string
  client_id: string | null
  caregiver_id: string | null
  assignment_date: string | null
  /** Wochentag einer Serie ohne Einzeldatum (0/7=So … 6=Sa, wie in `assignments.weekday`). */
  weekday?: number | null
  /** Gültigkeitsfenster einer Serie — nur relevant, wenn `weekday` gesetzt ist. */
  valid_from?: string | null
  valid_until?: string | null
  start_time: string | null
  end_time: string | null
  status: string | null
  /** Optional, nur für die Meldung — nie für die Prüfung. */
  client_name?: string | null
  caregiver_name?: string | null
}

export type KonfliktArt = 'mitarbeiter' | 'klient'

export interface Konflikt {
  art: KonfliktArt
  /** Der bestehende Einsatz, mit dem sich der Kandidat überschneidet. */
  gegenId: string
  meldung: string
}

/**
 * 'HH:MM' und 'HH:MM:SS' zu Minuten seit Mitternacht.
 *
 * Ein reiner String-Vergleich wäre hier falsch: '09:00' und '09:00:00'
 * bezeichnen dieselbe Uhrzeit, sortieren aber unterschiedlich. Postgres
 * liefert `time`-Spalten als 'HH:MM:SS', Formulare schicken 'HH:MM'.
 */
export function zeitZuMinuten(zeit: string | null | undefined): number | null {
  if (!zeit) return null
  const treffer = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(zeit.trim())
  if (!treffer) return null
  const stunden = Number(treffer[1])
  const minuten = Number(treffer[2])
  // Postgres kennt fuer `time` den Grenzwert 24:00:00 als Tagesende, und
  // Formulare schicken ihn fuer den Spaetdienst bis Mitternacht. Er wurde
  // hier bisher als unlesbar verworfen — und weil `zeitenUeberschneiden()`
  // bei unlesbarer Zeit fail-open arbeitet, meldete ein Einsatz
  // "20:00–24:00" gegen einen bestehenden "21:00–22:00" KEINEN Konflikt.
  if (stunden === 24) return minuten === 0 ? 1440 : null
  if (stunden > 23 || minuten > 59) return null
  return stunden * 60 + minuten
}

/** Eine Zeitspanne als Startminute + Dauer, aufgelöst über den Tageswechsel. */
export interface Zeitspanne {
  /** Minuten seit Mitternacht des eigenen Tages. */
  start: number
  /** Dauer in Minuten; 0 = Null-Einsatz (Beginn = Ende). */
  dauer: number
}

/**
 * Zeitspanne eines Einsatzes — inklusive Nachteinsatz über Mitternacht.
 *
 * Ein Einsatz mit `end_time <= start_time` ist kein leeres Intervall, sondern
 * einer, der in den Folgetag reicht (22:00–06:00 = 480 Minuten). Genau das
 * hat der DB-Trigger bis 20261012000000 nicht gerechnet — und diese Datei
 * bildet den Trigger nach, also muss sie es genauso rechnen.
 * Beginn = Ende bleibt ein Null-Einsatz mit Dauer 0.
 */
export function spanneInMinuten(
  start: string | null | undefined,
  ende: string | null | undefined,
): Zeitspanne | null {
  const s = zeitZuMinuten(start)
  const e = zeitZuMinuten(ende)
  if (s === null || e === null) return null
  if (e > s) return { start: s, dauer: e - s }
  if (e === s) return { start: s, dauer: 0 }
  return { start: s, dauer: e - s + 1440 }
}

/**
 * Echte Überschneidung zweier Zeitspannen — Berührung an den Rändern zählt
 * nicht (09:00–10:00 und 10:00–11:00 sind kein Konflikt). Gleiche Regel wie
 * `neu_start < s + dauer AND s < neu_start + neu_dauer` im Trigger
 * `check_assignment_overlap` (Migration 20261012000000).
 *
 * `versatzTage` legt die zweite Spanne auf die Zeitachse der ersten: +1 für
 * den Folgetag, -1 für den Vortag. Ohne diesen Versatz bliebe ein
 * Nachteinsatz, der in den nächsten Tag hineinragt, unsichtbar.
 *
 * Ein Null-Einsatz (Dauer 0) belegt keine Zeit und kollidiert deshalb mit
 * nichts — dieselbe Entscheidung wie im Trigger, sonst würde das entartete
 * Intervall [t, t) fälschlich treffen.
 *
 * Fail-open bei unlesbaren Zeiten: eine kaputte Uhrzeit ist ein Eingabefehler,
 * den die Pflichtfeldprüfung meldet — hier daraus einen Konflikt zu machen,
 * würde eine falsche Ursache anzeigen.
 */
export function zeitenUeberschneiden(
  aStart: string | null, aEnde: string | null,
  bStart: string | null, bEnde: string | null,
  versatzTage: number = 0,
): boolean {
  const a = spanneInMinuten(aStart, aEnde)
  const b = spanneInMinuten(bStart, bEnde)
  if (!a || !b) return false
  if (a.dauer <= 0 || b.dauer <= 0) return false
  const bStartAbsolut = versatzTage * 1440 + b.start
  return a.start < bStartAbsolut + b.dauer && bStartAbsolut < a.start + a.dauer
}

/**
 * Abstand zweier ISO-Daten in ganzen Tagen (`bis - von`), null bei
 * unlesbarem Datum. Bewusst über Date.UTC — die lokale Zeitzone würde
 * an Sommerzeitgrenzen halbe Tage erzeugen.
 */
export function tagesVersatz(
  von: string | null | undefined,
  bis: string | null | undefined,
): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(von ?? ''))
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(bis ?? ''))
  if (!a || !b) return null
  const msA = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const msB = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  return Math.round((msB - msA) / 86_400_000)
}

/**
 * ISO-Datum um `tage` verschieben ('2026-09-10', -1 → '2026-09-09').
 * null bei unlesbarem Datum.
 */
export function tagVerschieben(datum: string | null | undefined, tage: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum ?? ''))
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

/**
 * Abstand zweier Wochentage einer Serie als -1 / 0 / +1 — oder null, wenn
 * sie weiter auseinanderliegen (dann kann kein Einsatz von höchstens 24
 * Stunden sie verbinden).
 *
 * `assignments.weekday` führt Sonntag historisch als 0 ODER 7. Deshalb wird
 * durchgängig modulo 7 gerechnet: sonst wäre der Abstand zwischen 0 und 7
 * scheinbar 7 statt 0, und eine Sonntagsnacht liefe an der Montagsfrühschicht
 * vorbei.
 */
export function wochentagsVersatz(
  kandidat: number | null | undefined,
  vorhanden: number | null | undefined,
): number | null {
  if (kandidat == null || vorhanden == null) return null
  if (!Number.isInteger(kandidat) || !Number.isInteger(vorhanden)) return null
  const abstand = ((((vorhanden % 7) - (kandidat % 7)) % 7) + 7) % 7
  if (abstand === 0) return 0
  if (abstand === 1) return 1
  if (abstand === 6) return -1
  return null
}

/** Zählt dieser Einsatz für die Konfliktprüfung noch? */
export function istAktiv(status: string | null | undefined): boolean {
  return !(KONFLIKTFREIE_STATUS as readonly string[]).includes(status ?? '')
}

function name(wert: string | null | undefined, ersatz: string): string {
  const s = (wert ?? '').trim()
  return s === '' ? ersatz : s
}

function zeitraum(e: KonfliktEinsatz): string {
  return `${(e.start_time ?? '').slice(0, 5)}–${(e.end_time ?? '').slice(0, 5)}`
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

function wochentagName(tag: number): string {
  return WOCHENTAGE[tag === 7 ? 0 : tag] ?? `Wochentag ${tag}`
}

/** 'jeden Montag' bzw. 'am 2026-08-27' — für die Konfliktmeldung. */
function zeitpunkt(e: KonfliktEinsatz): string {
  if (e.assignment_date) return `am ${e.assignment_date}`
  if (e.weekday != null) return `jeden ${wochentagName(e.weekday)}`
  return ''
}

/**
 * Heutiges Datum als 'YYYY-MM-DD' — Fallback für ein leeres Gültigkeits-
 * fenster, exakt wie `CURRENT_DATE` im DB-Trigger.
 */
function isoHeute(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Überschneiden sich zwei Gültigkeitsfenster einer Serie? Fehlender Start
 * gilt ab heute, fehlendes Ende gilt unbegrenzt — dieselbe COALESCE-Regel
 * wie im DB-Trigger (`check_assignment_overlap`, Serien-Zweig).
 */
function serienfensterUeberschneiden(
  aVon: string | null | undefined, aBis: string | null | undefined,
  bVon: string | null | undefined, bBis: string | null | undefined,
  heute: string,
): boolean {
  const vonA = aVon ?? heute
  const bisA = aBis ?? '9999-12-31'
  const vonB = bVon ?? heute
  const bisB = bBis ?? '9999-12-31'
  return vonA <= bisB && vonB <= bisA
}

/**
 * Die Wochentage, die für einen Serien-Kandidaten überhaupt kollidieren
 * können: der eigene, der davor und der danach — jeweils in BEIDEN
 * Schreibweisen für Sonntag (0 und 7), weil der Bestand historisch beide
 * enthält.
 */
export function wochentagsNachbarn(weekday: number): number[] {
  const n = ((weekday % 7) + 7) % 7
  const tage = new Set<number>([(n + 6) % 7, n, (n + 1) % 7])
  if (tage.has(0)) tage.add(7)
  return [...tage]
}

/**
 * Findet alle Überschneidungen eines Kandidaten mit einem Bestand.
 *
 * Zwei Fälle, exakt wie im DB-Trigger `check_assignment_overlap`:
 *  - Kandidat hat ein `assignment_date`: geprüft wird nur gegen Einsätze mit
 *    demselben Datum.
 *  - Kandidat hat stattdessen einen `weekday` (Serie ohne Einzeldatum): ge-
 *    prüft wird nur gegen andere Serien mit demselben Wochentag, deren
 *    Gültigkeitsfenster sich überschneidet — nie gegen datierte Einsätze,
 *    weil ohne Serienauflösung nicht feststeht, ob sie je zusammenfallen.
 * `heute` steuert den COALESCE-Fallback für ein offenes Gültigkeitsfenster
 * und ist nur für Tests von außen vorgebbar.
 */
export function findeKonflikte(
  kandidat: KonfliktEinsatz,
  bestand: KonfliktEinsatz[],
  heute: string = isoHeute(),
): Konflikt[] {
  if (!istAktiv(kandidat.status)) return []
  const istSerie = !kandidat.assignment_date && kandidat.weekday != null
  if (!kandidat.assignment_date && !istSerie) return []

  const konflikte: Konflikt[] = []
  for (const vorhanden of bestand) {
    if (vorhanden.id === kandidat.id) continue
    if (!istAktiv(vorhanden.status)) continue

    // Versatz des Gegenspielers gegenüber dem Kandidaten in Tagen. Nur -1,
    // 0 und +1 kommen in Frage: ein Einsatz von höchstens 24 Stunden kann
    // nicht weiter reichen. Der Vortag MUSS mitgeprüft werden — sein
    // Nachteinsatz ragt in den Tag des Kandidaten hinein.
    let versatz: number | null
    if (istSerie) {
      if (vorhanden.assignment_date || vorhanden.weekday == null) continue
      versatz = wochentagsVersatz(kandidat.weekday, vorhanden.weekday)
      if (versatz === null) continue
      if (!serienfensterUeberschneiden(
        vorhanden.valid_from, vorhanden.valid_until,
        kandidat.valid_from, kandidat.valid_until,
        heute,
      )) continue
    } else {
      if (!vorhanden.assignment_date) continue
      versatz = tagesVersatz(kandidat.assignment_date, vorhanden.assignment_date)
      if (versatz === null || Math.abs(versatz) > 1) continue
    }

    if (!zeitenUeberschneiden(
      kandidat.start_time, kandidat.end_time,
      vorhanden.start_time, vorhanden.end_time,
      versatz,
    )) continue

    // Der Zeitpunkt des GEGENSPIELERS steht in der Meldung: bei einem
    // Nachteinsatz, der in den Folgetag ragt, ist genau das die Information,
    // die fehlt, wenn dort das Datum des Kandidaten stünde.
    const wann = zeitpunkt(vorhanden) || zeitpunkt(kandidat)

    if (kandidat.caregiver_id && vorhanden.caregiver_id === kandidat.caregiver_id) {
      konflikte.push({
        art: 'mitarbeiter',
        gegenId: vorhanden.id,
        meldung:
          `${name(vorhanden.caregiver_name, 'Die Betreuungskraft')} hat ${wann} ` +
          `bereits einen Einsatz von ${zeitraum(vorhanden)} ` +
          `bei ${name(vorhanden.client_name, 'einem anderen Klienten')}.`,
      })
      continue
    }

    if (kandidat.client_id && vorhanden.client_id === kandidat.client_id) {
      konflikte.push({
        art: 'klient',
        gegenId: vorhanden.id,
        meldung:
          `${name(vorhanden.client_name, 'Der Klient')} hat ${wann} ` +
          `zur selben Zeit (${zeitraum(vorhanden)}) bereits ` +
          `einen Einsatz mit ${name(vorhanden.caregiver_name, 'einer anderen Betreuungskraft')}.`,
      })
    }
  }
  return konflikte
}

/**
 * IDs aller Einsätze, die sich innerhalb einer Liste gegenseitig
 * überschneiden — für die Markierung im Kalender.
 */
export function konfliktIds(einsaetze: KonfliktEinsatz[]): Set<string> {
  const treffer = new Set<string>()
  for (const kandidat of einsaetze) {
    for (const k of findeKonflikte(kandidat, einsaetze)) {
      treffer.add(kandidat.id)
      treffer.add(k.gegenId)
    }
  }
  return treffer
}
