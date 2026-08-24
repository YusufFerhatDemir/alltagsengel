// ═══════════════════════════════════════════════════════════════
// Stripe: Zuordnung Plan ↔ Price-ID
// ═══════════════════════════════════════════════════════════════
//
// WARUM DIESE DATEI FAIL-CLOSED IST
// Die Zuordnung wurde vorher direkt aus `process.env.X!` gebaut. Fehlte
// eine der drei Variablen in der Laufzeitumgebung, hatte das zwei stille
// Folgen:
//
//   1. Der berechnete Schluessel `[process.env.X!]` wurde zur Zeichenkette
//      "undefined" — die Zuordnungstabelle enthielt also einen
//      Phantom-Eintrag, bei mehreren fehlenden Variablen gewann der
//      letzte.
//   2. Schlimmer: planFromPriceId() lieferte fuer eine ECHTE, bezahlte
//      Price-ID `null`, und syncSubscriptionToDb() schrieb daraufhin
//      `plan: 'free'`. Ein zahlender Mandant wurde also stillschweigend
//      auf den Gratis-Plan zurueckgesetzt — der Webhook antwortete mit
//      200, Stripe sah eine erfolgreiche Zustellung, es gab keinen Log
//      und keinen Fehler.
//
// Deshalb gilt jetzt: eine unvollstaendige Konfiguration ist ein Fehler,
// kein Gratis-Plan. planFromPriceId() wirft in diesem Fall. Im Webhook
// fuehrt das zu HTTP 500 — Stripe wiederholt die Zustellung, und nach dem
// Nachtragen der Variable landet der richtige Plan in der Datenbank.
//
// Eine VOLLSTAENDIG konfigurierte Umgebung verhaelt sich unveraendert:
// eine unbekannte Price-ID (z. B. ein anderes Produkt im selben
// Stripe-Konto) ergibt weiter `null` → 'free'.
// ═══════════════════════════════════════════════════════════════

import type { BillingPlan } from '@/lib/organizations/types'

/** Nur die kostenpflichtigen Pläne haben einen Stripe-Price. */
export type PaidPlan = 'starter' | 'pro' | 'scale'

export const PAID_PLANS: PaidPlan[] = ['starter', 'pro', 'scale']

export function isPaidPlan(plan: string): plan is BillingPlan & PaidPlan {
  return (PAID_PLANS as string[]).includes(plan)
}

/** Env-Variable je Plan — an einer Stelle, damit Fehlermeldungen sie nennen können. */
const ENV_NAME: Record<PaidPlan, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  pro: 'STRIPE_PRICE_PRO',
  scale: 'STRIPE_PRICE_SCALE',
}

/**
 * Rohwert einer Price-ID, oder null wenn nicht (sinnvoll) gesetzt.
 *
 * Bewusst zur Aufrufzeit gelesen und nicht beim Laden des Moduls: die
 * Variablen können je Umgebung fehlen, und ein Modul-Konstante würde den
 * Zustand des ersten Kaltstarts für die Lebensdauer der Instanz einfrieren.
 */
function preisId(plan: PaidPlan): string | null {
  const wert = process.env[ENV_NAME[plan]]
  const getrimmt = wert?.trim()
  return getrimmt ? getrimmt : null
}

/** Namen der Env-Variablen, die für den Verkauf fehlen (leer = vollständig). */
export function fehlendePreisVariablen(): string[] {
  return PAID_PLANS.filter(p => !preisId(p)).map(p => ENV_NAME[p])
}

/**
 * Price-ID für einen Plan — wirft, wenn die Variable fehlt.
 *
 * Vorher lieferte PLAN_TO_PRICE[plan] in diesem Fall `undefined`, das als
 * `string` typisiert war; Stripe bekam `price: undefined` und antwortete
 * mit einem generischen Parameter-Fehler, aus dem niemand die fehlende
 * Env-Variable ablesen konnte.
 */
export function preisIdFuerPlan(plan: PaidPlan): string {
  const id = preisId(plan)
  if (!id) {
    throw new Error(
      `Stripe-Preis für Plan "${plan}" ist nicht konfiguriert (${ENV_NAME[plan]} fehlt).`
    )
  }
  return id
}

/**
 * Plan zu einer Price-ID.
 *
 * - unvollständige Konfiguration → Fehler (siehe Kopf dieser Datei)
 * - vollständige Konfiguration, unbekannte ID → null
 */
export function planFromPriceId(priceId: string | null | undefined): BillingPlan | null {
  const fehlend = fehlendePreisVariablen()
  if (fehlend.length) {
    throw new Error(
      `Stripe-Preiszuordnung unvollständig (${fehlend.join(', ')} fehlt) — ` +
        'der Plan eines Abos lässt sich nicht bestimmen. Kein stiller Rückfall auf "free".'
    )
  }
  if (!priceId) return null
  const treffer = PAID_PLANS.find(p => preisId(p) === priceId)
  return treffer ?? null
}
