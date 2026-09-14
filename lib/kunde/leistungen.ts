// ═══════════════════════════════════════════════════════════════
// Kunden-Portal — gemeinsame Labels & Formatierung
// ═══════════════════════════════════════════════════════════════
// Wird von /kunde/budget, /kunde/rechnungen und /kunde/leistungsnachweis
// geteilt, damit Budgettöpfe und Leistungsarten überall gleich heißen.
// Kundengerichtete Langform der Labels (mit SGB-XI-Paragraf) — die
// Kurzform für das Admin-Panel lebt in lib/admin/ops.ts.
// ═══════════════════════════════════════════════════════════════

import { hatUnterschrift, istStorniert } from '@/lib/leistungsnachweis/status-sync'

export const BUDGET_TYPE_LABEL: Record<string, string> = {
  entlastung: 'Entlastungsbetrag §45b SGB XI',
  verhinderung: 'Verhinderungspflege §39 SGB XI',
  carryover: 'Übertrag Vorjahr',
  private: 'Privat',
}

// Kurzlabels für enge Tabellen-Spalten
export const BUDGET_TYPE_SHORT: Record<string, string> = {
  entlastung: '§45b Entlastung',
  verhinderung: '§39 Verhinderung',
  carryover: 'Übertrag',
  private: 'Privat',
}

export const BUDGET_TYPE_COLOR: Record<string, string> = {
  entlastung: '#C9963C',
  verhinderung: '#2196F3',
  carryover: '#9C27B0',
  private: '#5CB882',
}

export const SERVICE_TYPE_LABEL: Record<string, string> = {
  alltagsbegleitung: 'Alltagsbegleitung',
  betreuung_45a: 'Betreuung nach §45a',
  verhinderungspflege: 'Verhinderungspflege',
  hauswirtschaft: 'Hauswirtschaftliche Unterstützung',
  einkaufsservice: 'Einkaufsservice',
  begleitservice: 'Begleitservice',
  nachtbetreuung: 'Nachtbetreuung',
  wochenendbetreuung: 'Wochenendbetreuung',
  krankenfahrt: 'Krankenfahrt',
  sonstige: 'Sonstige Leistung',
}

export function budgetTypeLabel(t: string | null | undefined): string {
  if (!t) return '—'
  return BUDGET_TYPE_LABEL[t] || t
}

export function serviceTypeLabel(t: string | null | undefined): string {
  if (!t) return 'Leistung'
  return SERVICE_TYPE_LABEL[t] || t
}

export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

// "90" → "1 Std 30 Min", "45" → "45 Min"
export function fmtDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} Min`
  if (m === 0) return `${h} Std`
  return `${h} Std ${m} Min`
}

// ═══════════════════════════════════════════════════════════════
// Nachweisstand — was die Kundin über ihren Einsatz erfährt
// ═══════════════════════════════════════════════════════════════
//
// BEFUND 14.09.2026
// /kunde/leistungsnachweis kannte zwei Etiketten, „✓ Unterschrieben" und
// „Ohne Unterschrift", und entschied zwischen ihnen über das Statuswort:
// `!!client_signature || status === 'signed' || status === 'invoiced'`.
//
// Beim Vereinheitlichen lag nahe, stattdessen die Regel des
// Sammelrechnungslaufs zu nehmen (`zaehltAlsUnterschrieben` — die
// Nachbildung von create_invoice_draft_atomic). Gegen die Produktionsdaten
// gemessen war das ein Rückschritt: von 28 sichtbaren Nachweisen wären
// ALLE 28 auf „Unterschrift fehlt" gekippt, darunter 15 längst
// abgerechnete und 24 mit hinterlegtem Unterschriftsbild.
//
// Der Grund steht im Kopf von lib/leistungsnachweis/status-sync.ts: den
// Rückweg `status → proof_status` gibt es nirgends. `proof_status` bleibt
// deshalb auf 'ENTWURF' stehen, auch wenn längst unterschrieben und
// bezahlt wurde. Die RPC-Regel beantwortet „was wird die Abrechnung tun" —
// eine Betriebsfrage. Die Kundin stellt eine andere.
//
// Deshalb hier: `hatUnterschrift` (fragt nach dem Beleg, zählt das
// Unterschriftsbild mit) plus ein dritter Zustand. Für einen bezahlten
// Einsatz ist „Abgerechnet" die stärkere und ehrlichere Aussage als jede
// Unterschriftsmeldung — und sie beendet die Frage.
//
// Live ergibt das 15× Abgerechnet, 10× Unterschrieben, 3× fehlend. Die
// drei sind echt: 31.07.2026, kein Hash, kein Bild, kein Beleg.

/** Die Felder, aus denen sich der Stand eines Nachweises ablesen lässt. */
export interface NachweisAnzeigeFelder {
  status?: string | null
  proof_status?: string | null
  billing_status?: string | null
  signature_hash?: string | null
  client_signature?: string | null
}

export type Nachweisstand = 'storniert' | 'abgerechnet' | 'unterschrieben' | 'offen'

/**
 * Der Stand eines Leistungsnachweises aus Sicht der Kundin.
 *
 * Reihenfolge ist Absicht: Storno schlägt alles (ein widerrufener Einsatz
 * braucht keine Unterschrift mehr), Abrechnung schlägt die Unterschrift
 * (bezahlt ist die endgültigere Auskunft). Erst danach wird überhaupt nach
 * dem Beleg gefragt.
 */
export function nachweisstand(r: NachweisAnzeigeFelder): Nachweisstand {
  if (istStorniert(r)) return 'storniert'
  if (r.status === 'invoiced' || r.proof_status === 'ABGERECHNET') return 'abgerechnet'
  if (hatUnterschrift(r)) return 'unterschrieben'
  return 'offen'
}

/**
 * Wartet dieser Nachweis noch auf die Unterschrift der Kundin?
 *
 * Nur 'offen' ist eine offene Aufforderung — storniert und abgerechnet
 * sind beide entschieden.
 */
export function wartetAufUnterschrift(r: NachweisAnzeigeFelder): boolean {
  return nachweisstand(r) === 'offen'
}

/** Etikett je Stand. Farben liegen in der Seite, der Text gehört hierher. */
export const NACHWEISSTAND_LABEL: Record<Nachweisstand, string> = {
  abgerechnet: 'Abgerechnet',
  unterschrieben: '✓ Unterschrieben',
  offen: 'Unterschrift fehlt',
  storniert: 'Storniert',
}
