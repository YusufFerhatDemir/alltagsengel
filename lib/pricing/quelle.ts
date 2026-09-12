/**
 * DIE EINE STELLE für Preise — Wegweiser, nicht neue Wahrheit.
 *
 * ── WOZU ──────────────────────────────────────────────────────────────
 * Am 12.09.2026 lagen Preise an fünf Orten: zwei Code-Module und drei
 * Datenbanktabellen, dazu rund 1.200 Geldbeträge in Texten. Niemand konnte
 * beantworten, welcher Wert gilt, ohne alle fünf zu kennen.
 *
 * Diese Datei **ändert keinen einzigen Preis**. Sie sagt je Preisart, wer
 * sie besitzt, und bündelt die Werte, die im Code stehen, an einer Stelle.
 * Wer künftig einen Preis ändert, ändert ihn hier oder in der genannten
 * Tabelle — nicht in einer Seite.
 *
 * ── DIE FÜNF QUELLEN, NACH BESITZER ───────────────────────────────────
 *
 * 1. CODE (diese Datei, über b2c-constants / budget-constants)
 *    B2C-Marktplatz und gesetzliche Budgets. Ändern heißt deployen.
 *
 * 2. `service_pricing` (DB)     Stundensätze je service_type × budget_type
 * 3. `billing_tariffs` (DB)     Abrechnungstarife je Rechtsgrundlage,
 *                               mit `tarif_status` als Freigabe
 * 4. `billing_gesetzliche_obergrenzen` (DB)  PfluV-Deckel, `bestaetigt`
 * 5. `leistungspreise` (DB)     Altbestand, durchgehend `unverified`
 *
 * ── WAS 35 € UND 40 € WIRKLICH SIND ───────────────────────────────────
 * Kein Widerspruch, sondern zwei Rechtsgrundlagen — am 12.09.2026 live
 * nachgesehen:
 *
 *   35,00 €/Std  §45b / §39 SGB XI (Kasse)  → tarif_status = **blocked**
 *   40,00 €/Std  privat (Selbstzahler)      → tarif_status = **verified**
 *
 * Die Kassentarife sind gesperrt, weil die §45a-Anerkennung fehlt. Die
 * Privattarife sind frei. Beide Zahlen sind gleichzeitig richtig.
 *
 * ── DER ECHTE KONFLIKT, UND ER IST STRUKTURELL SICHER ─────────────────
 * Die gesperrten Kassentarife stehen auf **35,00 €**. Der bestätigte
 * PfluV-Deckel in Hessen liegt bei **30,00 €** (Betreuungsangebot) und
 * **25,00 €** (Entlastungsangebot). Am Tag der Anerkennung wären die
 * Tarife also 5 bis 10 Euro zu hoch — nicht aus Versehen, sondern weil
 * niemand sie vorher angepasst hat.
 *
 * Das ist keine Entscheidung für diese Datei. Sie hält sie nur fest, damit
 * sie nicht erst am Tag der Freischaltung auffällt.
 */

import {
  CUSTOMER_HOURLY_RATE, ENGEL_HOURLY_RATE, PLATFORM_FEE_FACTOR,
  NATIVE_FALLBACK_HOURLY_RATE,
} from '@/lib/pricing/b2c-constants'
import { ENTLASTUNG_MONATLICH_EUR, ENTLASTUNG_JAEHRLICH_EUR } from '@/lib/config/budget-constants'

/** Wer besitzt diesen Preis? */
export type PreisBesitzer =
  | 'code'
  | 'service_pricing'
  | 'billing_tariffs'
  | 'billing_gesetzliche_obergrenzen'
  | 'leistungspreise'

export interface PreisEintrag {
  key: string
  /** Was es ist, in einem Satz. */
  was: string
  besitzer: PreisBesitzer
  /** Wert, wenn er im Code steht. `null` = liegt in der Datenbank. */
  wert: number | null
  einheit: 'EUR/Std' | 'EUR/Monat' | 'EUR/Jahr' | 'Faktor'
  /** Darf die Zahl in Kundentexten erscheinen? */
  verbraucherrelevant: boolean
}

/**
 * Die Preise, die im Code leben. Alles andere steht in der Datenbank und
 * gehört nicht hierher gespiegelt — eine Kopie wäre ein zweiter Ort.
 */
export const PREISE_IM_CODE: readonly PreisEintrag[] = [
  {
    key: 'kunde_stunde_b2c', was: 'Kundenpreis pro Stunde im Marktplatz (brutto, inkl. Gebühr)',
    besitzer: 'code', wert: CUSTOMER_HOURLY_RATE, einheit: 'EUR/Std', verbraucherrelevant: true,
  },
  {
    key: 'engel_stunde', was: 'Vergütung eines Alltagsbegleiters pro Stunde',
    besitzer: 'code', wert: ENGEL_HOURLY_RATE, einheit: 'EUR/Std', verbraucherrelevant: true,
  },
  {
    key: 'plattformgebuehr', was: 'Plattformgebühr als Dezimalfaktor',
    besitzer: 'code', wert: PLATFORM_FEE_FACTOR, einheit: 'Faktor', verbraucherrelevant: false,
  },
  {
    key: 'native_fallback', was: 'Rückfallsatz der App, wenn service_pricing nichts liefert',
    besitzer: 'code', wert: NATIVE_FALLBACK_HOURLY_RATE, einheit: 'EUR/Std', verbraucherrelevant: false,
  },
  {
    key: 'entlastung_monat', was: 'Entlastungsbetrag § 45b SGB XI je Monat',
    besitzer: 'code', wert: ENTLASTUNG_MONATLICH_EUR, einheit: 'EUR/Monat', verbraucherrelevant: true,
  },
  {
    key: 'entlastung_jahr', was: 'Entlastungsbetrag § 45b SGB XI je Jahr',
    besitzer: 'code', wert: ENTLASTUNG_JAEHRLICH_EUR, einheit: 'EUR/Jahr', verbraucherrelevant: true,
  },
] as const

/** Die Preisarten, die NUR in der Datenbank leben — als Wegweiser. */
export const PREISE_IN_DER_DB: readonly Omit<PreisEintrag, 'wert'>[] = [
  {
    key: 'stundensatz_je_budget', was: 'Stundensatz je service_type und budget_type',
    besitzer: 'service_pricing', einheit: 'EUR/Std', verbraucherrelevant: true,
  },
  {
    key: 'abrechnungstarif', was: 'Abrechnungstarif je Leistungsart und Rechtsgrundlage (mit tarif_status)',
    besitzer: 'billing_tariffs', einheit: 'EUR/Std', verbraucherrelevant: false,
  },
  {
    key: 'pfluv_deckel', was: 'Gesetzliche Obergrenze nach PfluV Hessen',
    besitzer: 'billing_gesetzliche_obergrenzen', einheit: 'EUR/Std', verbraucherrelevant: false,
  },
  {
    key: 'leistungspreis_alt', was: 'Altbestand Leistungspreise, durchgehend unverified',
    besitzer: 'leistungspreise', einheit: 'EUR/Std', verbraucherrelevant: false,
  },
] as const

export function preisImCode(key: string): PreisEintrag | undefined {
  return PREISE_IM_CODE.find(p => p.key === key)
}

/**
 * Abweichende Vergütungsaussagen in Kundentexten — eingefroren, nicht gebilligt.
 *
 * Jede Zeile ist eine **live ausgelieferte** Aussage über unsere eigene
 * Vergütung, die nicht zur Konstante `ENGEL_HOURLY_RATE` passt. Sie stehen
 * hier, damit `__tests__/pricing/verbraucherpreise.test.ts` sie zählt und
 * jede NEUE Abweichung rot macht.
 *
 * Keine davon ist hier entschieden. Welche Spanne gilt, ist
 * BUSINESS_DECISION_REQUIRED — siehe docs/reports/PRICE_SOURCE_OF_TRUTH_LATEST.md.
 */
export const VERGUETUNG_ABWEICHUNGEN: Readonly<Record<string, string>> = {
  'app/faq/page.tsx':
    '„Die Vergütung liegt zwischen 15 und 25 € pro Stunde" — eigene Aussage, Spanne statt 20 €',
  'app/blog/nebenjob-pflege/page.tsx':
    '„18–22 € pro Stunde … bei Alltagsengel als Helfer starten" — steht in der Meta-Description, also im Suchergebnis',
  'app/blog/alltagsbegleiter-werden/page.tsx':
    '„Gehalt von 18–24 €/Stunde" in der Meta-Description; im Fließtext zusätzlich Marktangaben zu ANDEREN Anbietern (14–18 € angestellt, 15–25 € privat) — die sind zulässig, weil sie nicht unser Angebot beschreiben',
}
