// ═══════════════════════════════════════════════════════════
// VERFÜGBARKEIT VON ENGELN — Zeitfenster-Logik
// ═══════════════════════════════════════════════════════════
// Quelle der Wahrheit ist die Tabelle `angel_availability`
// (wöchentliche Zeitfenster, siehe Migration 20260719).
//
// Bestandsdaten-Fallback: Engel, die noch keine Zeitfenster
// gepflegt haben, haben ggf. nur `angels.availability`
// (Wochentagskürzel ohne Uhrzeit). Für die werten wir den
// ganzen Wochentag als verfügbar — sonst würden alle
// Bestands-Engel über Nacht aus dem Matching fallen.
// Engel ganz ohne beide Angaben werden ebenfalls angezeigt
// (fail-open), damit die Buchungsstrecke nie leer läuft.
// ═══════════════════════════════════════════════════════════

/** Ein wöchentlich wiederkehrendes Zeitfenster. */
export type Zeitfenster = {
  /** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
  weekday: number
  /** "HH:MM" oder "HH:MM:SS" (Postgres `time`) */
  start_time: string
  end_time: string
}

/** Wochentage in Anzeige-Reihenfolge, ISO-Nummerierung. */
export const WOCHENTAGE: { nr: number; kurz: string; lang: string }[] = [
  { nr: 1, kurz: 'Mo', lang: 'Montag' },
  { nr: 2, kurz: 'Di', lang: 'Dienstag' },
  { nr: 3, kurz: 'Mi', lang: 'Mittwoch' },
  { nr: 4, kurz: 'Do', lang: 'Donnerstag' },
  { nr: 5, kurz: 'Fr', lang: 'Freitag' },
  { nr: 6, kurz: 'Sa', lang: 'Samstag' },
  { nr: 7, kurz: 'So', lang: 'Sonntag' },
]

/** "Mo" → 1, "So" → 7 (für den Alt-Datenbestand `angels.availability`). */
export function kuerzelZuWochentag(kuerzel: string): number | null {
  const treffer = WOCHENTAGE.find(
    t => t.kurz.toLowerCase() === kuerzel.trim().slice(0, 2).toLowerCase()
  )
  return treffer ? treffer.nr : null
}

/**
 * ISO-Wochentag (1–7) eines Datums im Format "YYYY-MM-DD".
 * Bewusst über Date.UTC — `new Date("2026-07-20")` wird sonst je nach
 * Server-Zeitzone auf den Vortag gezogen.
 */
export function isoWochentag(datum: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(datum)
  if (!m) return null
  const tag = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return tag === 0 ? 7 : tag // getUTCDay: Sonntag = 0 → ISO 7
}

/** "09:30" / "09:30:00" → 570 Minuten. null bei ungültiger Eingabe. */
export function zeitZuMinuten(zeit: string | null | undefined): number | null {
  if (!zeit) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(zeit.trim())
  if (!m) return null
  const stunden = Number(m[1])
  const minuten = Number(m[2])
  if (stunden > 23 || minuten > 59) return null
  return stunden * 60 + minuten
}

/** 570 → "09:30". Werte ab 24:00 werden auf 24:00 gedeckelt. */
export function minutenZuZeit(minuten: number): string {
  const gedeckelt = Math.max(0, Math.min(24 * 60, Math.round(minuten)))
  const h = Math.floor(gedeckelt / 60)
  const m = gedeckelt % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "09:00:00" → "09:00" für die Anzeige. */
export function zeitAnzeige(zeit: string): string {
  const minuten = zeitZuMinuten(zeit)
  return minuten === null ? zeit : minutenZuZeit(minuten)
}

/**
 * Deckt eines der Zeitfenster den gewünschten Einsatz vollständig ab?
 * Der Einsatz muss in EIN Fenster passen — zwei aneinandergrenzende
 * Fenster werden bewusst nicht zusammengefasst, weil der Engel sie
 * getrennt gepflegt hat (z.B. Pause dazwischen eingeplant).
 */
export function passtInZeitfenster(
  fenster: Zeitfenster[],
  weekday: number,
  startzeit: string,
  dauerStunden: number
): boolean {
  const start = zeitZuMinuten(startzeit)
  if (start === null) return false
  const ende = start + Math.round(dauerStunden * 60)

  return fenster.some(f => {
    if (f.weekday !== weekday) return false
    const fStart = zeitZuMinuten(f.start_time)
    const fEnde = zeitZuMinuten(f.end_time)
    if (fStart === null || fEnde === null) return false
    return start >= fStart && ende <= fEnde
  })
}

/**
 * Ist der Engel zum Wunschtermin verfügbar?
 *
 * @param fenster        Zeilen aus `angel_availability` des Engels
 * @param altTage        Fallback `angels.availability` ("Mo","Di",…)
 * @param datum          "YYYY-MM-DD"
 * @param startzeit      "HH:MM"
 * @param dauerStunden   gewünschte Einsatzdauer
 */
export function istVerfuegbar(
  fenster: Zeitfenster[],
  altTage: string[] | null | undefined,
  datum: string,
  startzeit: string,
  dauerStunden: number
): boolean {
  const weekday = isoWochentag(datum)
  if (weekday === null) return true // ohne gültiges Datum nicht filtern

  // Gepflegte Zeitfenster haben Vorrang und sind verbindlich
  if (fenster.length > 0) {
    return passtInZeitfenster(fenster, weekday, startzeit, dauerStunden)
  }

  // Fallback: nur Wochentage bekannt → ganzer Tag gilt als verfügbar
  const tage = (altTage || []).map(kuerzelZuWochentag).filter(t => t !== null)
  if (tage.length > 0) return tage.includes(weekday)

  // Keine Angabe → nicht ausschließen
  return true
}

/** Zeitfenster eines Tages, aufsteigend nach Startzeit. */
export function fensterProTag(fenster: Zeitfenster[], weekday: number): Zeitfenster[] {
  return fenster
    .filter(f => f.weekday === weekday)
    .sort((a, b) => (zeitZuMinuten(a.start_time) ?? 0) - (zeitZuMinuten(b.start_time) ?? 0))
}

/** "09:00 – 14:00 Uhr" für die Anzeige. */
export function fensterText(f: Zeitfenster): string {
  return `${zeitAnzeige(f.start_time)} – ${zeitAnzeige(f.end_time)} Uhr`
}

/** Überschneidet sich ein neues Fenster mit einem bestehenden desselben Tages? */
export function ueberschneidetSich(
  bestehende: Zeitfenster[],
  weekday: number,
  start: string,
  ende: string
): boolean {
  const s = zeitZuMinuten(start)
  const e = zeitZuMinuten(ende)
  if (s === null || e === null) return false
  return bestehende.some(f => {
    if (f.weekday !== weekday) return false
    const fs = zeitZuMinuten(f.start_time)
    const fe = zeitZuMinuten(f.end_time)
    if (fs === null || fe === null) return false
    return s < fe && e > fs
  })
}
