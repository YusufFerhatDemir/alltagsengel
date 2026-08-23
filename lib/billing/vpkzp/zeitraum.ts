/**
 * VP/KZP — Zeitraumlogik
 *
 * Rein rechnend: kein Datenbankzugriff, keine Seiteneffekte, keine
 * Zeitzonen. Alle Datumsangaben sind ISO-Kalendertage (YYYY-MM-DD) und
 * werden ueber UTC-Mitternacht gerechnet — ein Leistungstag ist ein
 * Kalendertag, keine 24-Stunden-Spanne. Mit lokaler Zeit gerechnet
 * verschoebe sich ein Zeitraum ueber die Sommerzeitgrenze um einen Tag.
 *
 * ── Warum die Aufteilung nach Kalenderjahr der Kern ist ────────────────
 * Sowohl das Tageskontingent (§ 39 / § 42) als auch der gemeinsame
 * Jahresbetrag (§ 42a) sind KALENDERJAHRESbezogen. Eine Kurzzeitpflege
 * vom 27.12. bis 09.01. ist damit kein Vorgang, sondern zwei: fuenf Tage
 * zulasten des alten Jahres, neun zulasten des neuen. Wer den Zeitraum
 * als Ganzes einem Jahr zuschlaegt, rechnet in einem Jahr zu viel und im
 * anderen zu wenig ab — und zwar unbemerkt, weil die Summe stimmt.
 */

/** Ein Leistungszeitraum, beide Grenzen einschliesslich. */
export interface Zeitraum {
  /** Erster Leistungstag (YYYY-MM-DD). */
  von: string
  /** Letzter Leistungstag (YYYY-MM-DD), einschliesslich. */
  bis: string
}

/** Ein auf ein Kalenderjahr zugeschnittener Teil eines Zeitraums. */
export interface JahresSegment extends Zeitraum {
  jahr: number
  /** Leistungstage in diesem Segment (einschliesslich beider Grenzen). */
  tage: number
}

export class ZeitraumUngueltigError extends Error {
  public readonly zeitraum: Zeitraum

  constructor(zeitraum: Zeitraum, grund: string) {
    super(`Zeitraum ${zeitraum.von} bis ${zeitraum.bis} ist unzulaessig: ${grund}`)
    this.name = 'ZeitraumUngueltigError'
    this.zeitraum = zeitraum
  }
}

const ISO_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/

const MS_PRO_TAG = 24 * 60 * 60 * 1000

/**
 * Wandelt ein ISO-Datum in einen UTC-Zeitstempel.
 *
 * Prueft dabei, dass das Datum tatsaechlich existiert: `new Date('2025-02-30')`
 * ergibt in JavaScript den 02.03. — eine solche stille Verschiebung darf in
 * einer Abrechnung nicht passieren.
 */
export function zuUtcTag(datum: string): number {
  const treffer = ISO_DATUM.exec(String(datum ?? '').trim())
  if (!treffer) {
    throw new Error(`"${datum}" ist kein Kalendertag im Format YYYY-MM-DD.`)
  }
  const [, j, m, t] = treffer
  const jahr = Number(j)
  const monat = Number(m)
  const tag = Number(t)
  const zeitstempel = Date.UTC(jahr, monat - 1, tag)
  const d = new Date(zeitstempel)
  if (
    d.getUTCFullYear() !== jahr
    || d.getUTCMonth() !== monat - 1
    || d.getUTCDate() !== tag
  ) {
    throw new Error(`"${datum}" ist kein existierender Kalendertag.`)
  }
  return zeitstempel
}

/** ISO-Datum aus einem UTC-Zeitstempel. */
export function zuIsoDatum(zeitstempel: number): string {
  return new Date(zeitstempel).toISOString().slice(0, 10)
}

/** Kalenderjahr eines ISO-Datums. */
export function jahrVon(datum: string): number {
  return new Date(zuUtcTag(datum)).getUTCFullYear()
}

/**
 * Obergrenze fuer einen einzelnen Vorgang. Ein Zeitraum ueber mehr als
 * zwei Kalenderjahre kann keine VP/KZP-Leistung sein; er deutet auf einen
 * Eingabefehler (z. B. Jahreszahl vertippt) und wuerde beim Fortschreiben
 * der Jahresstaende stillen Schaden anrichten.
 */
export const MAX_ZEITRAUM_TAGE = 400

/**
 * Prueft einen Zeitraum und liefert ihn normalisiert zurueck.
 * Fail-closed: jede Unstimmigkeit wirft, es wird nichts stillschweigend
 * zurechtgebogen (kein Vertauschen von von/bis).
 */
export function pruefeZeitraum(zeitraum: Zeitraum): Zeitraum {
  const von = String(zeitraum?.von ?? '').trim()
  const bis = String(zeitraum?.bis ?? '').trim()
  const normalisiert: Zeitraum = { von, bis }

  let vonTag: number
  let bisTag: number
  try {
    vonTag = zuUtcTag(von)
    bisTag = zuUtcTag(bis)
  } catch (err) {
    throw new ZeitraumUngueltigError(
      normalisiert,
      err instanceof Error ? err.message : String(err),
    )
  }

  if (bisTag < vonTag) {
    throw new ZeitraumUngueltigError(normalisiert, 'das Ende liegt vor dem Beginn')
  }

  const tage = Math.round((bisTag - vonTag) / MS_PRO_TAG) + 1
  if (tage > MAX_ZEITRAUM_TAGE) {
    throw new ZeitraumUngueltigError(
      normalisiert,
      `${tage} Tage ueberschreiten die Plausibilitaetsgrenze von ${MAX_ZEITRAUM_TAGE} Tagen`,
    )
  }

  return normalisiert
}

/**
 * Leistungstage eines Zeitraums — beide Grenzen einschliesslich.
 * Ein eintaegiger Einsatz (von === bis) zaehlt als 1 Tag.
 */
export function tageImZeitraum(zeitraum: Zeitraum): number {
  const { von, bis } = pruefeZeitraum(zeitraum)
  return Math.round((zuUtcTag(bis) - zuUtcTag(von)) / MS_PRO_TAG) + 1
}

/**
 * Zerlegt einen Zeitraum in seine Kalenderjahres-Anteile.
 *
 * Der Jahreswechsel ist damit kein Sonderfall im aufrufenden Code, sondern
 * faellt hier an: jedes Segment wird gegen die Kontingente SEINES Jahres
 * geprueft und in der Jahreszeile SEINES Jahres fortgeschrieben.
 *
 * Beispiel 27.12.2025 – 09.01.2026 →
 *   [{ jahr: 2025, von: '2025-12-27', bis: '2025-12-31', tage: 5 },
 *    { jahr: 2026, von: '2026-01-01', bis: '2026-01-09', tage: 9 }]
 */
export function teileNachKalenderjahr(zeitraum: Zeitraum): JahresSegment[] {
  const { von, bis } = pruefeZeitraum(zeitraum)
  const ersteJahr = jahrVon(von)
  const letztesJahr = jahrVon(bis)

  const segmente: JahresSegment[] = []
  for (let jahr = ersteJahr; jahr <= letztesJahr; jahr++) {
    const segmentVon = jahr === ersteJahr ? von : `${jahr}-01-01`
    const segmentBis = jahr === letztesJahr ? bis : `${jahr}-12-31`
    segmente.push({
      jahr,
      von: segmentVon,
      bis: segmentBis,
      tage: Math.round((zuUtcTag(segmentBis) - zuUtcTag(segmentVon)) / MS_PRO_TAG) + 1,
    })
  }
  return segmente
}

/** true, wenn sich zwei Zeitraeume an mindestens einem Tag beruehren. */
export function ueberschneidetSich(a: Zeitraum, b: Zeitraum): boolean {
  const aVon = zuUtcTag(pruefeZeitraum(a).von)
  const aBis = zuUtcTag(a.bis)
  const bVon = zuUtcTag(pruefeZeitraum(b).von)
  const bBis = zuUtcTag(b.bis)
  return aVon <= bBis && bVon <= aBis
}

/** Anzahl gemeinsamer Tage zweier Zeitraeume (0 = keine Ueberschneidung). */
export function ueberschneidungsTage(a: Zeitraum, b: Zeitraum): number {
  const aVon = zuUtcTag(pruefeZeitraum(a).von)
  const aBis = zuUtcTag(a.bis)
  const bVon = zuUtcTag(pruefeZeitraum(b).von)
  const bBis = zuUtcTag(b.bis)
  const von = Math.max(aVon, bVon)
  const bis = Math.min(aBis, bBis)
  if (bis < von) return 0
  return Math.round((bis - von) / MS_PRO_TAG) + 1
}

export interface UeberschneidungsBefund<T extends Zeitraum = Zeitraum> {
  bestand: T
  tage: number
}

/**
 * Findet alle bestehenden Buchungen, die den neuen Zeitraum beruehren.
 *
 * ── Mehrfachleistungen im selben Zeitraum ──────────────────────────────
 * Zwei Buchungen am selben Tag sind fachlich moeglich (etwa VP am Vormittag
 * und eine weitere Leistung am Nachmittag) — der TAG darf dann aber nur
 * EINMAL auf das Kontingent zaehlen. Diese Funktion liefert deshalb nicht
 * nur "ja/nein", sondern die Zahl der doppelt erfassten Tage; die
 * Berechnung zieht sie ab (siehe berechnung.ts, `bereitsGezaehlteTage`).
 * Ohne diesen Abzug verbraucht ein Klient sein Kontingent doppelt so
 * schnell, wie ihm zusteht.
 */
export function findeUeberschneidungen<T extends Zeitraum>(
  neuerZeitraum: Zeitraum,
  bestand: readonly T[],
): UeberschneidungsBefund<T>[] {
  const geprueft = pruefeZeitraum(neuerZeitraum)
  const befunde: UeberschneidungsBefund<T>[] = []
  for (const b of bestand) {
    const tage = ueberschneidungsTage(geprueft, b)
    if (tage > 0) befunde.push({ bestand: b, tage })
  }
  return befunde
}

/**
 * Zaehlt die eindeutigen Kalendertage einer Menge von Zeitraeumen.
 * Ueberlappende Zeitraeume werden nur einmal gezaehlt — das ist die Zahl,
 * die gegen das Kontingent laeuft.
 */
export function eindeutigeTage(zeitraeume: readonly Zeitraum[]): number {
  const tage = new Set<number>()
  for (const z of zeitraeume) {
    const { von, bis } = pruefeZeitraum(z)
    const vonTag = zuUtcTag(von)
    const bisTag = zuUtcTag(bis)
    for (let t = vonTag; t <= bisTag; t += MS_PRO_TAG) tage.add(t)
  }
  return tage.size
}
