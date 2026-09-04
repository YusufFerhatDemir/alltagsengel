/**
 * Onboarding — personalisierte Anleitung
 *
 * Rein rechnend. Macht aus dem Stand eines Ablaufs eine Liste, die eine
 * Person lesen kann: was ist erledigt, was ist noch nötig, was ist
 * freiwillig.
 *
 * ── DREI ZUSTÄNDE, NICHT ZWEI ──────────────────────────────────────────
 * „Erledigt / nicht erledigt" wäre zu grob und in der Wirkung unfair:
 * ein freiwilliger Schritt, der offen ist, sieht dann genauso aus wie
 * eine fehlende Pflichtangabe. Wer die Liste überfliegt, sieht fünf rote
 * Punkte und macht gar nicht erst weiter — obwohl drei davon niemanden
 * aufhalten.
 *
 *   erledigt      ✅  ist ausgefüllt oder bewusst übersprungen
 *   erforderlich  ⚠️  ohne das geht es nicht weiter
 *   offen         ⏳  freiwillig, kann jederzeit nachgereicht werden
 *
 * ── DIE ANLEITUNG BEHAUPTET NICHTS ─────────────────────────────────────
 * Sie sagt, was im Ablauf steht — nicht, was bei uns angekommen ist.
 * Unterlagen, die per Post kamen, tauchen hier nicht auf. Dieselbe Regel
 * wie beim Assistenten, und aus demselben Grund.
 */

import {
  erwarteteAngabenFuer, schrittfolge, type OnboardingTyp, type SchrittDefinition,
} from './schritte'
import { angabeText } from './notifications'
import type { SchrittEintrag } from './service'

export const PUNKT_ZUSTAENDE = ['erledigt', 'erforderlich', 'offen'] as const
export type PunktZustand = (typeof PUNKT_ZUSTAENDE)[number]

/** Zeichen und Klartext je Zustand — eine Quelle für alle Anzeigen. */
export const ZUSTAND_DARSTELLUNG: Record<PunktZustand, { zeichen: string; text: string }> = {
  erledigt: { zeichen: '✅', text: 'Erledigt' },
  erforderlich: { zeichen: '⚠️', text: 'Wird noch gebraucht' },
  offen: { zeichen: '⏳', text: 'Freiwillig' },
}

export interface AnleitungsPunkt {
  /** 1-basierte Schrittnummer — Sprungziel. */
  nummer: number
  schluessel: string
  titel: string
  hinweis: string
  zustand: PunktZustand
  /** Was in diesem Schritt noch fehlt, in Klartext. */
  fehlendeAngaben: string[]
  /** Wurde der Schritt bewusst übersprungen? */
  uebersprungen: boolean
}

export interface Anleitung {
  typ: OnboardingTyp
  ueberschrift: string
  /** Ein Satz, der die Lage zusammenfasst. */
  lage: string
  punkte: AnleitungsPunkt[]
  erledigt: number
  gesamt: number
  prozent: number
  /** Nächster Punkt, der jemanden aufhält. null = nichts hält auf. */
  naechsterPflichtpunkt: AnleitungsPunkt | null
  abgeschlossen: boolean
}

export interface AnleitungsLage {
  typ: OnboardingTyp
  schritteDaten: Record<string, SchrittEintrag>
  abgeschlossenAm: string | null
}

const UEBERSCHRIFT: Record<OnboardingTyp, string> = {
  bewerber: 'Ihr Weg zur Bewerbung',
  kunde: 'Ihr Weg zur Unterstützung',
  angehoerige: 'Ihr Weg zum Zugang',
}

function zustandVon(
  schritt: SchrittDefinition,
  eintrag: SchrittEintrag | undefined,
): { zustand: PunktZustand; uebersprungen: boolean } {
  const status = eintrag?.status
  if (status === 'fertig') return { zustand: 'erledigt', uebersprungen: false }
  // Bewusst übersprungen zählt als erledigt: die Person hat entschieden,
  // und diese Entscheidung soll nicht als Mahnung zurückkommen.
  if (status === 'uebersprungen') return { zustand: 'erledigt', uebersprungen: true }
  return {
    zustand: schritt.ueberspringbar ? 'offen' : 'erforderlich',
    uebersprungen: false,
  }
}

/**
 * Baut die Anleitung für einen Ablauf.
 *
 * Fail-closed bei unbekannter Ablaufart: schrittfolge() wirft. Eine
 * Anleitung für einen Ablauf, den es nicht gibt, wäre schlimmer als gar
 * keine — sie sähe verbindlich aus.
 */
export function baueAnleitung(lage: AnleitungsLage): Anleitung {
  const folge = schrittfolge(lage.typ)

  const punkte: AnleitungsPunkt[] = folge.map((schritt, index) => {
    const eintrag = lage.schritteDaten[schritt.schluessel]
    const { zustand, uebersprungen } = zustandVon(schritt, eintrag)

    const fehlend = zustand === 'erledigt'
      ? []
      : erwarteteAngabenFuer(schritt, eintrag?.daten)
        .filter(a => {
          const wert = eintrag?.daten?.[a]
          return wert === undefined || wert === null || wert === ''
            || (Array.isArray(wert) && wert.length === 0)
        })
        .map(angabeText)

    return {
      nummer: index + 1,
      schluessel: schritt.schluessel,
      titel: schritt.titel,
      hinweis: schritt.hinweis,
      zustand,
      fehlendeAngaben: fehlend,
      uebersprungen,
    }
  })

  const erledigt = punkte.filter(p => p.zustand === 'erledigt').length
  const gesamt = punkte.length
  const naechsterPflichtpunkt = punkte.find(p => p.zustand === 'erforderlich') ?? null
  const abgeschlossen = Boolean(lage.abgeschlossenAm)

  return {
    typ: lage.typ,
    ueberschrift: UEBERSCHRIFT[lage.typ],
    lage: fasseZusammen({ abgeschlossen, erledigt, gesamt, naechsterPflichtpunkt, punkte }),
    punkte,
    erledigt,
    gesamt,
    prozent: gesamt === 0 ? 0 : Math.round((erledigt / gesamt) * 100),
    naechsterPflichtpunkt,
    abgeschlossen,
  }
}

function fasseZusammen(x: {
  abgeschlossen: boolean
  erledigt: number
  gesamt: number
  naechsterPflichtpunkt: AnleitungsPunkt | null
  punkte: AnleitungsPunkt[]
}): string {
  if (x.abgeschlossen) {
    return 'Alles abgeschickt. Wir melden uns bei Ihnen — Sie müssen nichts weiter tun.'
  }
  if (x.erledigt === 0) {
    return 'Sie haben noch nicht angefangen. Es dauert nur wenige Minuten.'
  }
  if (x.naechsterPflichtpunkt) {
    return `${x.erledigt} von ${x.gesamt} Punkten sind erledigt. `
      + `Als Nächstes: ${x.naechsterPflichtpunkt.titel}.`
  }
  const freiwilligOffen = x.punkte.filter(p => p.zustand === 'offen').length
  if (freiwilligOffen > 0) {
    return `Alles Nötige ist ausgefüllt. ${freiwilligOffen} freiwillige Punkte sind `
      + 'noch offen — Sie können sie jederzeit nachreichen oder weglassen.'
  }
  return 'Alles ausgefüllt. Sie können abschicken.'
}

/** Nur die Punkte, die jemanden aufhalten. */
export function erforderlichePunkte(anleitung: Anleitung): AnleitungsPunkt[] {
  return anleitung.punkte.filter(p => p.zustand === 'erforderlich')
}
