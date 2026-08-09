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

/** Gesamtminuten einer Stop-Liste: Einsatzzeit + Fahrzeit. */
export function tourGesamtMinuten(stops: PlanStop[]): number {
  return stops.reduce((summe, stop) => {
    const ankunft = zeitZuMinuten(stop.geplante_ankunft)
    const ende = zeitZuMinuten(stop.geplantes_ende)
    const einsatz = ankunft !== null && ende !== null && ende > ankunft ? ende - ankunft : 0
    return summe + einsatz + (stop.fahrzeit_minuten ?? 0)
  }, 0)
}
