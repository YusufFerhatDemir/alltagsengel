// ═══════════════════════════════════════════════════════════════════════
// Block 28 — Kennzahlen des Kontrollzentrums
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (14.09.2026)
//
// `/mis` nannte sich „Echtzeit-Übersicht aller Geschäftskennzahlen" und
// rechnete den Umsatz als `Anzahl Buchungen × 35 €`. Eine Buchung ist
// weder eine Stunde noch ein Euro: sie kann abgesagt, unbezahlt oder nie
// erbracht worden sein. Live standen so 105 € auf der Karte.
//
// Damit gab dasselbe System drei Antworten auf dieselbe Frage:
//
//   /mis                      105 €   Buchungen × Stundensatz (erfunden)
//   /admin/analytics/kpi    1.901 €   Summe über invoices, ohne Prüfung
//   offene Posten (OPOS)        0 €   verlangt frozen_at — korrekt
//
// Richtig ist die dritte: keine der drei Rechnungen im Bestand ist
// festgeschrieben, alle sind synthetisch. Der echte Umsatz ist 0 € —
// passend zu FIRST_REAL_INVOICE_APPROVED=false.
//
// ── WARUM DIESES MODUL UND NICHT NOCH EINE RECHNUNG ───────────────────
//
// Weil die Wahrheit schon existierte. `berechneUmsatz` und
// `berechneAuslastung` liegen in lib/analytics/kpi.ts, das Statusvokabular
// in lib/billing/status-vokabular.ts, die Belegregel in
// lib/billing/nachweis-beleg.ts. `/mis` hatte daneben eine eigene, falsche
// Zweitrechnung gebaut. Dieses Modul beschafft die Zahlen und gibt sie
// weiter — es erfindet keine eigene Regel.
//
// ── IST UND PLAN AUSEINANDERHALTEN ────────────────────────────────────
//
// Die Seite mischte Gemessenes (Nutzerzahl) mit Annahmen (TAM, LTV/CAC,
// „95 % API-Verfügbarkeit") in identisch aussehenden Karten. Jede Zahl
// hier traegt deshalb ihre `herkunft`. Was nicht gemessen ist, darf nicht
// aussehen wie eine Messung.
import type { SupabaseClient } from '@supabase/supabase-js'
import { berechneUmsatz, berechneAuslastung, type UmsatzKpi, type AuslastungKpi } from '@/lib/analytics/kpi'
import { RECHNUNG_ERLEDIGT } from '@/lib/billing/status-vokabular'
import { unterschriftBelegt, type BelegFelder } from '@/lib/billing/nachweis-beleg'
import { heuteBerlin } from '@/lib/utils/timezone'

/** Woher eine Zahl stammt. „plan" ist eine Annahme, keine Messung. */
export type Herkunft = 'ist' | 'plan'

export interface BetriebKpi {
  klienten: number
  aktiveKlienten: number
  kraefte: number
  /** Kräfte mit erteilter Einsatzfreigabe — der Engpass der ganzen Kette. */
  einsatzbereiteKraefte: number
  aktiveEinsaetze: number
}

export interface OffenePostenKpi {
  summeEuro: number
  anzahl: number
  ueberfaelligEuro: number
  ueberfaelligAnzahl: number
  /** Rechnungen mit offenem Betrag, die mangels frozen_at nicht zählen. */
  nichtFestgeschrieben: number
}

export interface NachweisKpi {
  gesamt: number
  belegt: number
  ohneBeleg: number
  abgerechnet: number
}

export interface MarktZeile {
  slug: string
  name: string
  wert: number
  ziel: number | null
  einheit: string | null
  kategorie: string | null
  periode: string | null
  herkunft: Herkunft
}

export interface MisKennzahlen {
  stand: string
  betrieb: BetriebKpi
  umsatz: UmsatzKpi
  /**
   * Umsatz je aktiver Kraft — `null`, wenn es keine gibt.
   *
   * Bewusst `null` statt 0: „0 € pro Kraft" liest sich wie ein Ergebnis,
   * „—" sagt, dass die Frage mangels Nenner gar nicht gestellt werden
   * kann. Der Nenner sind die AKTIVEN Kräfte, nicht die freigegebenen:
   * sonst teilt die Kennzahl live durch null und verschwindet genau dann,
   * wenn sie am meisten zu sagen hätte.
   */
  umsatzProKraft: number | null
  auslastung: AuslastungKpi
  offenePosten: OffenePostenKpi
  nachweise: NachweisKpi
  markt: MarktZeile[]
}

// ── Pure Berechnungen ────────────────────────────────────────────────

export interface OposZeile {
  total_amount: number | null
  paid_amount: number | null
  status: string | null
  due_date: string | null
  frozen_at: string | null
}

/**
 * Offene Posten: was gestellt, aber nicht bezahlt ist.
 *
 * Dieselben zwei Riegel wie beim Umsatz — `frozen_at` und das
 * Statusvokabular —, damit die beiden Zahlen nicht wieder auseinander
 * laufen. Die nicht festgeschriebenen Zeilen werden gezaehlt und
 * ausgewiesen, nicht verschwiegen.
 */
export function berechneOffenePosten(rechnungen: OposZeile[], heute: string): OffenePostenKpi {
  let summeEuro = 0
  let anzahl = 0
  let ueberfaelligEuro = 0
  let ueberfaelligAnzahl = 0
  let nichtFestgeschrieben = 0

  for (const r of rechnungen) {
    const offen = (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0)
    if (offen <= 0) continue
    if (r.status != null && RECHNUNG_ERLEDIGT.includes(r.status)) continue
    if (!r.frozen_at) {
      nichtFestgeschrieben++
      continue
    }
    summeEuro += offen
    anzahl++
    if (r.due_date && r.due_date < heute) {
      ueberfaelligEuro += offen
      ueberfaelligAnzahl++
    }
  }

  return {
    summeEuro: Math.round(summeEuro * 100) / 100,
    anzahl,
    ueberfaelligEuro: Math.round(ueberfaelligEuro * 100) / 100,
    ueberfaelligAnzahl,
    nichtFestgeschrieben,
  }
}

/**
 * Nachweisstand. „belegt" beantwortet die Belegregel aus
 * lib/billing/nachweis-beleg.ts — NICHT `proof_status`. Live steht jede
 * der 30 Zeilen auf proof_status='ENTWURF'; wer danach zaehlt, meldet
 * null belegte Nachweise, obwohl 13 eine Unterschrift tragen.
 */
export function berechneNachweisstand(
  nachweise: (BelegFelder & { status?: string | null })[],
): NachweisKpi {
  let belegt = 0
  let abgerechnet = 0
  for (const n of nachweise) {
    if (unterschriftBelegt(n)) belegt++
    if (n.status === 'invoiced' || n.status === 'abgerechnet') abgerechnet++
  }
  return { gesamt: nachweise.length, belegt, ohneBeleg: nachweise.length - belegt, abgerechnet }
}

/**
 * Einsatzbereitschaft. Gezaehlt wird `einsatzfreigabe`, nicht der blosse
 * Personalbestand: eine Kraft ohne Freigabe darf nicht zum Klienten, und
 * eine Kennzahl „2 Kräfte" verdeckt genau das.
 */
export function berechneBetrieb(
  klienten: { status: string | null }[],
  kraefte: { status: string | null; einsatzfreigabe: boolean | null }[],
  einsaetze: { status: string | null }[],
): BetriebKpi {
  const AKTIV_KLIENT = ['aktiv', 'active', 'neu']
  return {
    klienten: klienten.length,
    aktiveKlienten: klienten.filter(k => k.status != null && AKTIV_KLIENT.includes(k.status)).length,
    kraefte: kraefte.length,
    einsatzbereiteKraefte: kraefte.filter(k => k.einsatzfreigabe === true).length,
    aktiveEinsaetze: einsaetze.filter(e => e.status === 'active' || e.status === 'aktiv').length,
  }
}

/**
 * Umsatz je aktiver Kraft. `null` bei keinem Nenner — siehe
 * `MisKennzahlen.umsatzProKraft`.
 */
export function berechneUmsatzProKraft(umsatzEuro: number, aktiveKraefte: number): number | null {
  if (aktiveKraefte <= 0) return null
  return Math.round((umsatzEuro / aktiveKraefte) * 100) / 100
}

/**
 * Marktzahlen aus `mis_kpis`.
 *
 * Die Tabelle fuehrt 14 gepflegte Zeilen und wurde von niemandem gelesen —
 * `/mis` hatte TAM/SAM stattdessen fest im Quelltext stehen, und die
 * Zahlen widersprachen sich: Tabelle 24,6 Mrd. €, Seite 50 Mrd. €. Ein
 * fest verdrahteter Wert ist keine Kennzahl, sondern eine Behauptung.
 */
export function marktKennzahlenAus(zeilen: Record<string, unknown>[]): MarktZeile[] {
  return zeilen.map(z => ({
    slug: String(z.slug ?? ''),
    name: String(z.name ?? ''),
    wert: Number(z.value) || 0,
    ziel: z.target == null ? null : Number(z.target),
    einheit: z.unit == null ? null : String(z.unit),
    kategorie: z.category == null ? null : String(z.category),
    periode: z.period == null ? null : String(z.period),
    // `mis_kpis` ist eine gepflegte Planungstabelle, keine Messung aus dem
    // Betrieb. Sie traegt deshalb durchgehend „plan" — auch wenn einzelne
    // Zeilen (Burn Rate) einen realen Hintergrund haben.
    herkunft: 'plan' as const,
  }))
}

// ── DB-Beschaffung ───────────────────────────────────────────────────

/**
 * Alle Kennzahlen des Kontrollzentrums — org-gefenced.
 *
 * `organizationId` ist Pflicht. Die alte Seite fragte `profiles`,
 * `bookings` und `angels` ganz ohne Mandantenbedingung ab; in einem
 * Mehrmandantensystem ist das kein Dashboard, sondern ein Leck.
 */
export async function ladeMisKennzahlen(
  supabase: SupabaseClient,
  organizationId: string,
  heute: string = heuteBerlin(),
): Promise<MisKennzahlen> {
  const [rechnungenRes, klientenRes, kraefteRes, einsaetzeRes, nachweiseRes, marktRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('total_amount, paid_amount, status, due_date, frozen_at')
      .eq('organization_id', organizationId)
      .is('deleted_at', null),
    supabase.from('clients').select('status').eq('organization_id', organizationId),
    supabase.from('caregivers').select('id, status, einsatzfreigabe').eq('organization_id', organizationId),
    supabase.from('assignments').select('caregiver_id, status').eq('organization_id', organizationId),
    supabase
      .from('service_records')
      .select('status, proof_status, client_signature, client_signed_at, signature_hash')
      .eq('organization_id', organizationId),
    supabase
      .from('mis_kpis')
      .select('slug, name, value, target, unit, category, period')
      .eq('organization_id', organizationId),
  ])

  // Jede Abfrage wirft einzeln und benannt. Ein `|| []` an dieser Stelle
  // waere genau die stille Null, die dieses Dashboard schon einmal hatte:
  // eine fehlgeschlagene Abfrage sieht dann aus wie ein leerer Bestand.
  if (rechnungenRes.error) throw new Error(`Rechnungen konnten nicht geladen werden: ${rechnungenRes.error.message}`)
  if (klientenRes.error) throw new Error(`Klienten konnten nicht geladen werden: ${klientenRes.error.message}`)
  if (kraefteRes.error) throw new Error(`Kräfte konnten nicht geladen werden: ${kraefteRes.error.message}`)
  if (einsaetzeRes.error) throw new Error(`Einsätze konnten nicht geladen werden: ${einsaetzeRes.error.message}`)
  if (nachweiseRes.error) throw new Error(`Leistungsnachweise konnten nicht geladen werden: ${nachweiseRes.error.message}`)
  if (marktRes.error) throw new Error(`Marktkennzahlen konnten nicht geladen werden: ${marktRes.error.message}`)

  const rechnungen = (rechnungenRes.data ?? []) as OposZeile[]
  const kraefte = (kraefteRes.data ?? []) as { id: string; status: string | null; einsatzfreigabe: boolean | null }[]
  const einsaetze = (einsaetzeRes.data ?? []) as { caregiver_id: string | null; status: string | null }[]

  const aktiveKraftIds = kraefte.filter(k => k.status === 'active' || k.status === 'aktiv').map(k => k.id)
  const eingesetzt = new Set(
    einsaetze.filter(e => e.status === 'active' || e.status === 'aktiv').map(e => e.caregiver_id).filter((id): id is string => !!id),
  )

  const umsatz = berechneUmsatz(
    rechnungen.map(r => ({ total_amount: r.total_amount, status: r.status, frozen_at: r.frozen_at })),
  )

  return {
    stand: new Date().toISOString(),
    betrieb: berechneBetrieb((klientenRes.data ?? []) as { status: string | null }[], kraefte, einsaetze),
    umsatz,
    umsatzProKraft: berechneUmsatzProKraft(umsatz.summeEuro, aktiveKraftIds.length),
    auslastung: berechneAuslastung(aktiveKraftIds, eingesetzt),
    offenePosten: berechneOffenePosten(rechnungen, heute),
    nachweise: berechneNachweisstand((nachweiseRes.data ?? []) as (BelegFelder & { status?: string | null })[]),
    markt: marktKennzahlenAus((marktRes.data ?? []) as Record<string, unknown>[]),
  }
}
