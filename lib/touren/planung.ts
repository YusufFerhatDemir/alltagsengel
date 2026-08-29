// ═══════════════════════════════════════════════════════════
// TOURENPLANUNG — reine Planungslogik (ohne DB-Zugriff)
// ═══════════════════════════════════════════════════════════
// Zeitplan-Konsistenz, Überlappungs- und Kapazitätsprüfung für
// Touren. Die harte Doppelbelegungs-Wahrheit bleibt der
// DB-Trigger check_assignment_overlap auf assignments — diese
// Funktionen liefern die Planungs-Warnungen VOR dem Speichern.
// ═══════════════════════════════════════════════════════════

import { zeitZuMinuten, minutenZuZeit } from '@/lib/availability'

export interface PlanStop {
  position: number
  clientName?: string | null
  geplante_ankunft: string | null
  geplantes_ende: string | null
  /** Anfahrt vom vorherigen Stop in Minuten (null = unbekannt) */
  fahrzeit_minuten: number | null
}

export interface ZeitplanWarnung {
  position: number
  typ: 'FAHRZEIT_ZU_KNAPP' | 'ZEITEN_UNVOLLSTAENDIG' | 'ENDE_VOR_START' | 'REIHENFOLGE'
  text: string
}

/**
 * Prüft eine geordnete Stop-Liste auf Zeitplan-Konsistenz:
 * - Ankunft eines Stops muss >= Ende des Vorgängers + Fahrzeit sein
 * - Ende >= Ankunft je Stop
 * - Ankunftszeiten in Positionsreihenfolge
 */
export function pruefeZeitplan(stops: PlanStop[]): ZeitplanWarnung[] {
  const warnungen: ZeitplanWarnung[] = []
  const sortiert = [...stops].sort((a, b) => a.position - b.position)

  let vorherEnde: number | null = null
  let vorherAnkunft: number | null = null

  for (const stop of sortiert) {
    const wer = stop.clientName ? ` (${stop.clientName})` : ''
    const ankunft = zeitZuMinuten(stop.geplante_ankunft)
    const ende = zeitZuMinuten(stop.geplantes_ende)

    if (ankunft === null || ende === null) {
      warnungen.push({
        position: stop.position,
        typ: 'ZEITEN_UNVOLLSTAENDIG',
        text: `Stop ${stop.position}${wer}: Ankunft oder Ende fehlt.`,
      })
      continue
    }

    if (ende < ankunft) {
      warnungen.push({
        position: stop.position,
        typ: 'ENDE_VOR_START',
        text: `Stop ${stop.position}${wer}: Ende (${minutenZuZeit(ende)}) liegt vor der Ankunft (${minutenZuZeit(ankunft)}).`,
      })
    }

    if (vorherAnkunft !== null && ankunft < vorherAnkunft) {
      warnungen.push({
        position: stop.position,
        typ: 'REIHENFOLGE',
        text: `Stop ${stop.position}${wer}: Ankunft liegt vor dem vorherigen Stop — Reihenfolge prüfen.`,
      })
    }

    if (vorherEnde !== null && stop.fahrzeit_minuten !== null) {
      const fruehesteAnkunft = vorherEnde + stop.fahrzeit_minuten
      if (ankunft < fruehesteAnkunft) {
        warnungen.push({
          position: stop.position,
          typ: 'FAHRZEIT_ZU_KNAPP',
          text: `Stop ${stop.position}${wer}: Ankunft ${minutenZuZeit(ankunft)} ist nicht erreichbar — Vorgänger endet ${minutenZuZeit(vorherEnde)}, Fahrzeit ${stop.fahrzeit_minuten} Min (frühestens ${minutenZuZeit(fruehesteAnkunft)}).`,
        })
      }
    }

    vorherEnde = ende
    vorherAnkunft = ankunft
  }

  return warnungen
}

export interface ZeitIntervall {
  start: string | null
  ende: string | null
}

/** Überschneiden sich zwei Zeitintervalle desselben Tages? */
export function intervalleUeberlappen(a: ZeitIntervall, b: ZeitIntervall): boolean {
  const as = zeitZuMinuten(a.start)
  const ae = zeitZuMinuten(a.ende)
  const bs = zeitZuMinuten(b.start)
  const be = zeitZuMinuten(b.ende)
  if (as === null || ae === null || bs === null || be === null) return false
  return as < be && ae > bs
}

export interface KapazitaetsInput {
  /** Soll-Wochenstunden des Mitarbeiters (caregivers.wochenstunden_soll) */
  wochenstundenSoll: number | null
  /** bereits verplante Minuten in der Woche (Einsatz + Fahrt) */
  verplanteMinutenWoche: number
  /** Minuten der neuen/geänderten Tour (Einsatz + Fahrt) */
  neueMinuten: number
}

export interface KapazitaetsErgebnis {
  ueberlastet: boolean
  auslastungProzent: number | null
  text: string | null
}

/** Wochenkapazität gegen Soll-Stunden prüfen (Warnung, keine Blockade). */
export function pruefeWochenkapazitaet(input: KapazitaetsInput): KapazitaetsErgebnis {
  if (!input.wochenstundenSoll || input.wochenstundenSoll <= 0) {
    return { ueberlastet: false, auslastungProzent: null, text: null }
  }
  const sollMinuten = input.wochenstundenSoll * 60
  const gesamt = input.verplanteMinutenWoche + input.neueMinuten
  const prozent = Math.round((gesamt / sollMinuten) * 100)
  if (gesamt > sollMinuten) {
    return {
      ueberlastet: true,
      auslastungProzent: prozent,
      text: `Wochenkapazität überschritten: ${Math.round(gesamt / 60)} von ${input.wochenstundenSoll} Soll-Stunden verplant (${prozent}%).`,
    }
  }
  if (prozent >= 90) {
    return {
      ueberlastet: false,
      auslastungProzent: prozent,
      text: `Wochenauslastung bei ${prozent}% der Soll-Stunden.`,
    }
  }
  return { ueberlastet: false, auslastungProzent: prozent, text: null }
}

export interface VorlagenStop {
  client_id?: unknown
  dauer_minuten?: unknown
  service_type?: string
  notes?: string
}

/**
 * Prueft die Stop-Liste einer Tour-Vorlage, bevor daraus Zeiten gerechnet
 * werden.
 *
 * `tour_templates.stops` ist ein jsonb-Array ohne jede Struktur-Zusage — der
 * CHECK-Constraint deckt nur `weekday` ab. Beim Anwenden wurde `dauer_minuten`
 * ungeprueft aufaddiert: fehlte das Feld oder stand Text darin, ergab
 * `zeiger += undefined` NaN, `minutenZuZeit(NaN)` lieferte "NaN:NaN", und
 * dieser Wert ging als Uhrzeit an die Einsatz-Anlage — Postgres antwortete
 * mit einem rohen Formatfehler (HTTP 500). Eine negative Dauer erzeugte
 * stillschweigend einen Stop, dessen Ende vor seiner Ankunft liegt.
 *
 * @returns Fehlermeldung oder null
 */
export function pruefeVorlagenStops(stops: VorlagenStop[]): string | null {
  if (!Array.isArray(stops) || stops.length === 0) {
    return 'Vorlage enthält keine Stops.'
  }
  for (const [i, stop] of stops.entries()) {
    const nr = i + 1
    if (typeof stop?.client_id !== 'string' || stop.client_id.trim() === '') {
      return `Vorlage, Stop ${nr}: client_id fehlt.`
    }
    const dauer = stop.dauer_minuten
    if (typeof dauer !== 'number' || !Number.isFinite(dauer) || !Number.isInteger(dauer)) {
      return `Vorlage, Stop ${nr}: dauer_minuten muss eine ganze Zahl von Minuten sein (gefunden: ${JSON.stringify(dauer)}).`
    }
    if (dauer <= 0) {
      return `Vorlage, Stop ${nr}: dauer_minuten muss größer als 0 sein (gefunden: ${dauer}).`
    }
    if (dauer > 1440) {
      return `Vorlage, Stop ${nr}: dauer_minuten übersteigt einen ganzen Tag (${dauer} Minuten).`
    }
  }
  return null
}

/** Gesamtminuten einer Stop-Liste: Einsatzzeit + Fahrzeit. */
export function tourGesamtMinuten(stops: PlanStop[]): number {
  return stops.reduce((summe, stop) => {
    const ankunft = zeitZuMinuten(stop.geplante_ankunft)
    const ende = zeitZuMinuten(stop.geplantes_ende)
    const einsatz = ankunft !== null && ende !== null && ende > ankunft ? ende - ankunft : 0
    return summe + einsatz + (stop.fahrzeit_minuten ?? 0)
  }, 0)
}

// ═══════════════════════════════════════════════════════════
// WOCHENTAG EINER TOURVORLAGE
// ═══════════════════════════════════════════════════════════
//
// tour_templates.weekday zaehlt nach ISO-8601: Montag = 1 … Sonntag = 7.
// Genau so validiert es auch POST /api/tours/templates.
//
// Beim ANWENDEN einer Vorlage prueft die Route den Wochentag NICHT — und
// das ist richtig so: eine Montagstour an einem Mittwoch nachzuholen ist
// ein zulaessiger Vorgang, kein Fehler. Ungeprueft bliebe es aber auch
// unbemerkt, und eine Vorlage, die versehentlich auf den falschen Tag
// gelegt wird, erzeugt eine vollstaendige Tour mit allen Klienten am
// falschen Datum. Deshalb: warnen, nicht blockieren.

/** Wochentag eines ISO-Datums (YYYY-MM-DD) nach ISO-8601: Mo=1 … So=7. */
export function isoWochentag(datumIso: string): number | null {
  if (typeof datumIso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datumIso)) return null
  // ORTSZEIT-Parse ueber das angehaengte 'T00:00:00' — bewusst NICHT
  // new Date('2026-08-30'). Der kurze Form-Parse ist nach Norm UTC-Mitternacht;
  // in jeder Zone westlich von UTC faellt getDay() dann auf den VORTAG und die
  // Warnung meldete den falschen Wochentag (bzw. schwiege, wenn sie warnen muesste).
  const d = new Date(`${datumIso}T00:00:00`)
  const tag = d.getDay()
  if (Number.isNaN(tag)) return null
  // RUECKPROBE statt blossem NaN-Riegel, und das aus einem beim Testen
  // gefundenen Grund: ein Datum wie 2026-02-30 ergibt KEIN Invalid Date —
  // JavaScript rollt es stillschweigend auf den 2. Maerz weiter. Der
  // NaN-Riegel allein haette dafuer „Montag" geliefert, also genau den
  // erfundenen Wochentag, den er verhindern soll. Nur der Vergleich mit den
  // eingegebenen Zahlen deckt den Ueberlauf auf.
  const [jahr, monat, tagImMonat] = datumIso.split('-').map(Number)
  if (d.getFullYear() !== jahr || d.getMonth() + 1 !== monat || d.getDate() !== tagImMonat) return null
  return tag === 0 ? 7 : tag
}

const WOCHENTAG_NAMEN = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

/** Name eines ISO-Wochentags (1–7), sonst null. */
export function wochentagName(weekday: number | null | undefined): string | null {
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null
  return WOCHENTAG_NAMEN[weekday]
}

/**
 * Warnt, wenn eine Vorlage mit hinterlegtem Wochentag auf ein Datum mit
 * einem anderen Wochentag angewendet wird. Kein hinterlegter Wochentag,
 * unlesbares Datum oder Uebereinstimmung ergeben null (= keine Warnung).
 */
export function vorlagenWochentagWarnung(
  weekday: number | null | undefined,
  datumIso: string,
): string | null {
  const soll = wochentagName(weekday)
  if (soll === null) return null
  const ist = isoWochentag(datumIso)
  if (ist === null || ist === weekday) return null
  return `Die Vorlage ist für ${soll} hinterlegt, das gewählte Datum ist ein ${wochentagName(ist)}.`
}
