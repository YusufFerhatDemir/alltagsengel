// ═══════════════════════════════════════════════════════════════
// Block 19 — KPI-Dashboard
// Echtzeit-Kennzahlen: Umsatz, Auslastung, Ablehnungsquote,
// Pflegequalität. Alle Abfragen org-gefenced (organizationId Pflicht).
// Pure Berechnungsfunktionen sind von der DB-Beschaffung getrennt,
// damit sie ohne Supabase-Verbindung testbar sind.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import { berlinParts } from '@/lib/utils/timezone'
import { zaehltAlsUmsatz } from '@/lib/billing/status-vokabular'

export interface KpiZeitraum {
  von: string // ISO-Datum YYYY-MM-DD, inklusive
  bis: string // ISO-Datum YYYY-MM-DD, inklusive
}

export interface UmsatzKpi {
  summeEuro: number
  anzahlRechnungen: number
  /**
   * Rechnungen im Zeitraum, die wegen ihres STATUS nicht als Umsatz zaehlen
   * (storniert, abgelehnt, Entwurf, abgeschrieben).
   */
  nichtGezaehlt: number
  /**
   * Rechnungen im Zeitraum ohne `frozen_at` — nicht festgeschrieben, also
   * nie rechtswirksam ausgestellt.
   *
   * Wird getrennt ausgewiesen und NICHT stillschweigend weggelassen: am
   * 14.09.2026 sind das live ALLE drei Rechnungen im Bestand (1.901 €).
   * Eine Kennzahl, die deshalb wortlos auf 0 faellt, sieht aus wie ein
   * Geschaeftseinbruch statt wie das, was sie ist — ein leerer Bestand.
   */
  nichtFestgeschrieben: number
}

export interface AuslastungKpi {
  aktiveCaregiver: number
  eingesetzteCaregiver: number
  quoteProzent: number | null
}

export interface AblehnungsquoteKpi {
  gesamtBuchungen: number
  abgelehnt: number
  quoteProzent: number | null
}

export interface PflegequalitaetKpi {
  datenquelle: 'zufriedenheitsanrufe' | 'keine_daten'
  durchschnittsbewertung: number | null
  anzahlBewertungen: number
}

export interface KpiDashboard {
  zeitraum: KpiZeitraum
  umsatz: UmsatzKpi
  auslastung: AuslastungKpi
  ablehnungsquote: AblehnungsquoteKpi
  pflegequalitaet: PflegequalitaetKpi
}

// ── Pure Berechnungen ────────────────────────────────────────────

/**
 * Zeile einer Umsatzrechnung. `status` und `frozen_at` sind PFLICHT, nicht
 * optional: Beide entscheiden ueber Geld, und ein Aufrufer, der sie nicht
 * mitselektiert, bekaeme sonst lautlos eine zu hohe Zahl. So verlangt der
 * Typ die Entscheidung an jeder Aufrufstelle.
 */
export interface UmsatzZeile {
  total_amount: number | null
  status: string | null
  frozen_at: string | null
}

export function berechneUmsatz(rechnungen: UmsatzZeile[]): UmsatzKpi {
  // Zwei Fragen, zwei Riegel — und beide fehlten hier vor Block 28:
  //
  //  1. Ist die Rechnung ueberhaupt ausgestellt? Ohne `frozen_at` ist sie
  //     nicht festgeschrieben und damit keine rechtswirksame Forderung.
  //     Genau diese Bedingung traegt `getOposListe` seit jeher — das
  //     KPI-Dashboard trug sie nicht, und so beantworteten zwei
  //     Auswertungen desselben Systems dieselbe Frage verschieden:
  //     offene Posten 0 €, Umsatz 1.901 €.
  //  2. Zaehlt der Status als Umsatz? Ein Storno nimmt der Zeile ihren
  //     Status, nicht ihren Betrag.
  const nichtFestgeschrieben = rechnungen.filter(r => !r.frozen_at).length
  const gezaehlt = rechnungen.filter(r => r.frozen_at && zaehltAlsUmsatz(r.status))
  const summeEuro = gezaehlt.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0)
  return {
    summeEuro: Math.round(summeEuro * 100) / 100,
    anzahlRechnungen: gezaehlt.length,
    nichtGezaehlt: rechnungen.filter(r => r.frozen_at && !zaehltAlsUmsatz(r.status)).length,
    nichtFestgeschrieben,
  }
}

export function berechneAuslastung(aktiveCaregiverIds: string[], eingesetzteCaregiverIds: Set<string>): AuslastungKpi {
  const aktive = new Set(aktiveCaregiverIds)
  let eingesetzt = 0
  for (const id of eingesetzteCaregiverIds) {
    if (aktive.has(id)) eingesetzt++
  }
  const quoteProzent = aktive.size > 0 ? Math.round((eingesetzt / aktive.size) * 1000) / 10 : null
  return { aktiveCaregiver: aktive.size, eingesetzteCaregiver: eingesetzt, quoteProzent }
}

export function berechneAblehnungsquote(buchungen: { status: string }[]): AblehnungsquoteKpi {
  const abgelehnt = buchungen.filter(b => b.status === 'declined').length
  const quoteProzent = buchungen.length > 0 ? Math.round((abgelehnt / buchungen.length) * 1000) / 10 : null
  return { gesamtBuchungen: buchungen.length, abgelehnt, quoteProzent }
}

export function berechnePflegequalitaet(anrufe: { satisfaction_rating: number | null }[]): PflegequalitaetKpi {
  const bewertet = anrufe.filter(a => a.satisfaction_rating != null)
  if (bewertet.length === 0) {
    return { datenquelle: 'keine_daten', durchschnittsbewertung: null, anzahlBewertungen: 0 }
  }
  const summe = bewertet.reduce((s, a) => s + Number(a.satisfaction_rating), 0)
  return {
    datenquelle: 'zufriedenheitsanrufe',
    durchschnittsbewertung: Math.round((summe / bewertet.length) * 100) / 100,
    anzahlBewertungen: bewertet.length,
  }
}

// ── DB-Beschaffung ───────────────────────────────────────────────

export async function ladeKpiDashboard(
  supabase: SupabaseClient,
  organizationId: string,
  zeitraum: KpiZeitraum,
): Promise<KpiDashboard> {
  const vonIso = `${zeitraum.von}T00:00:00.000Z`
  const bisIso = `${zeitraum.bis}T23:59:59.999Z`

  const [invoicesRes, caregiversRes, assignmentsRes, bookingsRes, callsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('total_amount, status, frozen_at')
      .eq('organization_id', organizationId)
      .gte('created_at', vonIso)
      .lte('created_at', bisIso),
    supabase
      .from('caregivers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    supabase
      .from('assignments')
      .select('caregiver_id, valid_from, valid_until')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .lte('valid_from', zeitraum.bis)
      .or(`valid_until.is.null,valid_until.gte.${zeitraum.von}`),
    supabase
      .from('bookings')
      .select('status')
      .eq('organization_id', organizationId)
      .gte('created_at', vonIso)
      .lte('created_at', bisIso),
    supabase
      .from('satisfaction_calls')
      .select('satisfaction_rating')
      .eq('organization_id', organizationId)
      .gte('call_date', zeitraum.von)
      .lte('call_date', zeitraum.bis),
  ])

  if (invoicesRes.error) throw new Error(`Umsatz konnte nicht geladen werden: ${invoicesRes.error.message}`)
  if (caregiversRes.error) throw new Error(`Kräfte konnten nicht geladen werden: ${caregiversRes.error.message}`)
  if (assignmentsRes.error) throw new Error(`Einsätze konnten nicht geladen werden: ${assignmentsRes.error.message}`)
  if (bookingsRes.error) throw new Error(`Buchungen konnten nicht geladen werden: ${bookingsRes.error.message}`)
  if (callsRes.error) throw new Error(`Zufriedenheitsanrufe konnten nicht geladen werden: ${callsRes.error.message}`)

  const aktiveCaregiverIds = (caregiversRes.data || []).map((c: any) => c.id as string)
  const eingesetzteCaregiverIds = new Set((assignmentsRes.data || []).map((a: any) => a.caregiver_id as string))

  return {
    zeitraum,
    umsatz: berechneUmsatz(invoicesRes.data || []),
    auslastung: berechneAuslastung(aktiveCaregiverIds, eingesetzteCaregiverIds),
    ablehnungsquote: berechneAblehnungsquote(bookingsRes.data || []),
    pflegequalitaet: berechnePflegequalitaet(callsRes.data || []),
  }
}

// ── Zeitraum-Hilfsfunktionen ─────────────────────────────────────

export function standardZeitraumAktuellerMonat(heute: Date = new Date()): KpiZeitraum {
  const p = berlinParts(heute)
  const year = Number(p.year)
  const month = Number(p.month)
  const von = `${p.year}-${p.month}-01`
  const letzterTag = new Date(year, month, 0).getDate()
  const bis = `${p.year}-${p.month}-${String(letzterTag).padStart(2, '0')}`
  return { von, bis }
}

function isoDatum(d: Date): string {
  const p = berlinParts(d)
  return `${p.year}-${p.month}-${p.day}`
}
