// ═══════════════════════════════════════════════════════════════
// PDL-Cockpit — Erweiterte operative Steuerungskennzahlen
// Leistungen, Umsatz, Personal, Klienten, Budgets, Qualitaet.
// Alle Abfragen org-gefenced (organizationId Pflicht).
// Jede Einzelabfrage ist try/catch-resilient — bei Fehlern
// (z.B. fehlende Tabelle/Spalte) wird mit 0/leer weitergemacht.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import { aufCent } from '@/lib/geld'
import { pflegegradVon } from '@/lib/clients/pflegegrad'
import { heuteBerlin } from '@/lib/utils/timezone'

export interface PdlCockpitZeitraum {
  von: string // YYYY-MM-DD, inklusive
  bis: string // YYYY-MM-DD, inklusive
}

export interface LeistungsartZeile {
  leistungsart: string
  stunden: number
  anzahl: number
}

export interface LeistungsUebersicht {
  gesamtStunden: number
  geplanteStunden: number
  erfuellungsquoteProzent: number | null
  nachLeistungsart: LeistungsartZeile[]
}

export interface KostentraegerZeile {
  typ: string
  betrag: number
  anzahl: number
}

export interface UmsatzUebersicht {
  gesamt: number
  nachKostentraegerTyp: KostentraegerZeile[]
  vormonat: number | null
  veraenderungProzent: number | null
}

export interface PersonalUebersicht {
  aktiveKraefte: number
  imEinsatz: number
  krankgemeldet: number
  imUrlaub: number
  ueberStundenKonto: number
  unterStundenKonto: number
  /** Genehmigte Kranktage je aktiver Kraft/Kalendertag im Zeitraum, in %. */
  krankenstandsquoteProzent: number | null
  /** Ungeplante Abwesenheitstage (krank/sonstige/unbezahlt) je aktiver Kraft/Kalendertag, in %. */
  fehlzeitenquoteProzent: number | null
}

export interface PflegegradZeile {
  pflegegrad: number | string
  anzahl: number
}

export interface KlientenUebersicht {
  aktiv: number
  neuImZeitraum: number
  beendetImZeitraum: number
  pflegegradVerteilung: PflegegradZeile[]
}

export interface BudgetUebersicht {
  gesamtBudgetEuro: number
  verbrauchtEuro: number
  auslastungProzent: number | null
  kritischeBudgets: number
}

export interface QualitaetUebersicht {
  zufriedenheitSchnitt: number | null
  offeneWunden: number
  sturzEreignisse: number
  ueberfaelligeVerordnungen: number
}

export interface PdlCockpitData {
  zeitraum: PdlCockpitZeitraum
  leistungen: LeistungsUebersicht
  umsatz: UmsatzUebersicht
  personal: PersonalUebersicht
  klienten: KlientenUebersicht
  budgets: BudgetUebersicht
  qualitaet: QualitaetUebersicht
}

// ── Leistungen ──────────────────────────────────────────────────

async function ladeLeistungen(
  supabase: SupabaseClient,
  orgId: string,
  zeitraum: PdlCockpitZeitraum,
): Promise<LeistungsUebersicht> {
  const leer: LeistungsUebersicht = {
    gesamtStunden: 0,
    geplanteStunden: 0,
    erfuellungsquoteProzent: null,
    nachLeistungsart: [],
  }

  // Geleistete Stunden aus service_records
  let gesamtStunden = 0
  const artMap = new Map<string, { stunden: number; anzahl: number }>()
  try {
    const { data, error } = await supabase
      .from('service_records')
      .select('duration_minutes, service_type')
      .eq('organization_id', orgId)
      .gte('date', zeitraum.von)
      .lte('date', zeitraum.bis)
    if (error) throw error
    for (const r of data || []) {
      const min = Number(r.duration_minutes) || 0
      const h = min / 60
      gesamtStunden += h
      const art = r.service_type || 'Sonstige'
      const entry = artMap.get(art) || { stunden: 0, anzahl: 0 }
      entry.stunden += h
      entry.anzahl += 1
      artMap.set(art, entry)
    }
  } catch { /* Tabelle/Spalte fehlt — weiter mit 0 */ }

  // Geplante Stunden aus dienstplan_eintraege (falls vorhanden)
  let geplanteStunden = 0
  try {
    const { data, error } = await supabase
      .from('dienstplan_eintraege')
      .select('start_zeit, end_zeit')
      .eq('organization_id', orgId)
      .gte('datum', zeitraum.von)
      .lte('datum', zeitraum.bis)
    if (error) throw error
    for (const e of data || []) {
      if (e.start_zeit && e.end_zeit) {
        const diffMin = zeitDiffMinuten(e.start_zeit, e.end_zeit)
        geplanteStunden += diffMin / 60
      }
    }
  } catch { /* dienstplan_eintraege existiert evtl. nicht */ }

  const erfuellungsquoteProzent =
    geplanteStunden > 0 ? Math.round((gesamtStunden / geplanteStunden) * 1000) / 10 : null

  const nachLeistungsart: LeistungsartZeile[] = Array.from(artMap.entries())
    .map(([leistungsart, v]) => ({
      leistungsart,
      stunden: Math.round(v.stunden * 10) / 10,
      anzahl: v.anzahl,
    }))
    .sort((a, b) => b.stunden - a.stunden)

  return {
    gesamtStunden: Math.round(gesamtStunden * 10) / 10,
    geplanteStunden: Math.round(geplanteStunden * 10) / 10,
    erfuellungsquoteProzent,
    nachLeistungsart,
  }
}

function zeitDiffMinuten(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? diff : 0
}

// ── Umsatz ──────────────────────────────────────────────────────

async function ladeUmsatz(
  supabase: SupabaseClient,
  orgId: string,
  zeitraum: PdlCockpitZeitraum,
): Promise<UmsatzUebersicht> {
  let gesamt = 0
  let anzahlRechnungen = 0
  const typMap = new Map<string, { betrag: number; anzahl: number }>()

  // Aktueller Zeitraum
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('total_amount, billing_type')
      .eq('organization_id', orgId)
      .gte('created_at', `${zeitraum.von}T00:00:00.000Z`)
      .lte('created_at', `${zeitraum.bis}T23:59:59.999Z`)
    if (error) throw error
    anzahlRechnungen = (data || []).length
    for (const r of data || []) {
      const betrag = Number(r.total_amount) || 0
      gesamt += betrag
      const typ = labelKostentraeger(r.billing_type)
      const entry = typMap.get(typ) || { betrag: 0, anzahl: 0 }
      entry.betrag += betrag
      entry.anzahl += 1
      typMap.set(typ, entry)
    }
  } catch {
    // billing_type-Spalte fehlt evtl. — Fallback ohne Aufschluesselung
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('organization_id', orgId)
        .gte('created_at', `${zeitraum.von}T00:00:00.000Z`)
        .lte('created_at', `${zeitraum.bis}T23:59:59.999Z`)
      if (error) throw error
      anzahlRechnungen = (data || []).length
      for (const r of data || []) {
        gesamt += Number(r.total_amount) || 0
      }
    } catch { /* kein Zugriff auf invoices */ }
  }

  // Vormonat berechnen
  let vormonat: number | null = null
  try {
    const vmZeitraum = vormonatZeitraum(zeitraum)
    const { data, error } = await supabase
      .from('invoices')
      .select('total_amount')
      .eq('organization_id', orgId)
      .gte('created_at', `${vmZeitraum.von}T00:00:00.000Z`)
      .lte('created_at', `${vmZeitraum.bis}T23:59:59.999Z`)
    if (error) throw error
    vormonat = (data || []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  } catch { /* Vormonat nicht ladbar */ }

  const veraenderungProzent =
    vormonat != null && vormonat > 0
      ? Math.round(((gesamt - vormonat) / vormonat) * 1000) / 10
      : null

  return {
    gesamt,
    nachKostentraegerTyp: Array.from(typMap.entries())
      .map(([typ, v]) => ({ typ, betrag: aufCent(v.betrag), anzahl: v.anzahl }))
      .sort((a, b) => b.betrag - a.betrag),
    vormonat,
    veraenderungProzent,
  }
}

function labelKostentraeger(typ: string | null | undefined): string {
  switch (typ) {
    case 'kasse': return 'Krankenkasse'
    case 'sozialamt': return 'Sozialamt'
    case 'privat': return 'Privat'
    case 'misch': return 'Misch'
    case 'sonstiger_kostentraeger': return 'Sonstige'
    default: return 'Privat'
  }
}

function vormonatZeitraum(z: PdlCockpitZeitraum): PdlCockpitZeitraum {
  const vonDate = new Date(z.von)
  vonDate.setMonth(vonDate.getMonth() - 1)
  const year = vonDate.getFullYear()
  const month = vonDate.getMonth()
  const von = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const letzterTag = new Date(year, month + 1, 0).getDate()
  const bis = `${year}-${String(month + 1).padStart(2, '0')}-${String(letzterTag).padStart(2, '0')}`
  return { von, bis }
}

// ── Personal ────────────────────────────────────────────────────

async function ladePersonal(
  supabase: SupabaseClient,
  orgId: string,
  zeitraum: PdlCockpitZeitraum,
): Promise<PersonalUebersicht> {
  let aktiveKraefte = 0
  let imEinsatz = 0

  // Aktive Kraefte
  try {
    const { data, error } = await supabase
      .from('caregivers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
    if (error) throw error
    aktiveKraefte = (data || []).length

    // Im Einsatz: aktive assignments im Zeitraum
    try {
      const { data: assignments, error: aErr } = await supabase
        .from('assignments')
        .select('caregiver_id')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .lte('valid_from', zeitraum.bis)
        .or(`valid_until.is.null,valid_until.gte.${zeitraum.von}`)
      if (aErr) throw aErr
      const caregiverIds = new Set((data || []).map((c: any) => c.id))
      const eingesetzt = new Set<string>()
      for (const a of assignments || []) {
        if (caregiverIds.has(a.caregiver_id)) eingesetzt.add(a.caregiver_id)
      }
      imEinsatz = eingesetzt.size
    } catch { /* assignments nicht ladbar */ }
  } catch { /* caregivers nicht ladbar */ }

  // Abwesenheiten: krank & urlaub
  let krankgemeldet = 0
  let imUrlaub = 0
  try {
    const heute = heuteBerlin()
    const { data, error } = await supabase
      .from('absences')
      .select('absence_type')
      .eq('organization_id', orgId)
      .lte('start_date', heute)
      .gte('end_date', heute)
    if (error) throw error
    for (const a of data || []) {
      if (a.absence_type === 'sick') krankgemeldet++
      if (a.absence_type === 'vacation') imUrlaub++
    }
  } catch { /* absences nicht ladbar */ }

  // Stundenkonto: versuche personal_arbeitszeitkonto-View
  let ueberStundenKonto = 0
  let unterStundenKonto = 0
  try {
    const { data, error } = await supabase
      .from('personal_arbeitszeitkonto')
      .select('ueberstunden_gesamt')
      .eq('organization_id', orgId)
    if (error) throw error
    for (const row of data || []) {
      const ueberstunden = Number(row.ueberstunden_gesamt) || 0
      if (ueberstunden > 0) ueberStundenKonto += ueberstunden
      if (ueberstunden < 0) unterStundenKonto += Math.abs(ueberstunden)
    }
    // In Stunden umrechnen (gespeichert in Minuten)
    ueberStundenKonto = Math.round((ueberStundenKonto / 60) * 10) / 10
    unterStundenKonto = Math.round((unterStundenKonto / 60) * 10) / 10
  } catch { /* View existiert evtl. nicht */ }

  // Krankenstands-/Fehlzeitenquote über den Zeitraum: genehmigte Abwesenheitstage
  // je aktiver Kraft / Kalendertage im Zeitraum. Fehlzeitenquote zählt nur
  // ungeplante Ausfälle (krank/sonstige/unbezahlt) — Urlaub/Fortbildung/
  // Mutterschutz/Elternzeit/Sonderurlaub sind geplant und keine "Fehlzeit"
  // im Controlling-Sinn.
  let krankenstandsquoteProzent: number | null = null
  let fehlzeitenquoteProzent: number | null = null
  try {
    const kalendertage = Math.round((new Date(zeitraum.bis).getTime() - new Date(zeitraum.von).getTime()) / 86400000) + 1
    if (aktiveKraefte > 0 && kalendertage > 0) {
      const { data, error } = await supabase
        .from('absences')
        .select('absence_type, start_date, end_date')
        .eq('organization_id', orgId)
        .eq('status', 'genehmigt')
        .lte('start_date', zeitraum.bis)
        .or(`end_date.gte.${zeitraum.von},end_date.is.null`)
      if (error) throw error

      const UNGEPLANT = new Set(['sick', 'personal', 'other', 'unbezahlt'])
      let krankTage = 0
      let fehlTage = 0
      for (const a of data || []) {
        const von = new Date(Math.max(new Date(a.start_date).getTime(), new Date(zeitraum.von).getTime()))
        const bis = new Date(Math.min(new Date(a.end_date || zeitraum.bis).getTime(), new Date(zeitraum.bis).getTime()))
        const tage = Math.max(0, Math.round((bis.getTime() - von.getTime()) / 86400000) + 1)
        if (a.absence_type === 'sick') krankTage += tage
        if (UNGEPLANT.has(a.absence_type)) fehlTage += tage
      }
      const basis = aktiveKraefte * kalendertage
      krankenstandsquoteProzent = Math.round((krankTage / basis) * 1000) / 10
      fehlzeitenquoteProzent = Math.round((fehlTage / basis) * 1000) / 10
    }
  } catch { /* absences nicht ladbar */ }

  return {
    aktiveKraefte, imEinsatz, krankgemeldet, imUrlaub, ueberStundenKonto, unterStundenKonto,
    krankenstandsquoteProzent, fehlzeitenquoteProzent,
  }
}

// ── Klienten ────────────────────────────────────────────────────

async function ladeKlienten(
  supabase: SupabaseClient,
  orgId: string,
  zeitraum: PdlCockpitZeitraum,
): Promise<KlientenUebersicht> {
  let aktiv = 0
  let neuImZeitraum = 0
  let beendetImZeitraum = 0
  const pgVerteilung = new Map<number | string, number>()

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('status, care_level, pflegegrad, created_at, updated_at')
      .eq('organization_id', orgId)
    if (error) throw error

    for (const c of data || []) {
      if (c.status === 'active') {
        aktiv++
        const pg = pflegegradVon(c)
        const key = pg ?? 'Kein PG'
        pgVerteilung.set(key, (pgVerteilung.get(key) || 0) + 1)
      }

      // Neu im Zeitraum (created_at)
      if (c.created_at) {
        const createdDate = c.created_at.slice(0, 10)
        if (createdDate >= zeitraum.von && createdDate <= zeitraum.bis) {
          neuImZeitraum++
        }
      }

      // Beendet im Zeitraum (status != active und updated_at im Zeitraum)
      if (c.status !== 'active' && c.updated_at) {
        const updatedDate = c.updated_at.slice(0, 10)
        if (updatedDate >= zeitraum.von && updatedDate <= zeitraum.bis) {
          beendetImZeitraum++
        }
      }
    }
  } catch { /* clients nicht ladbar */ }

  const pflegegradVerteilung: PflegegradZeile[] = Array.from(pgVerteilung.entries())
    .map(([pflegegrad, anzahl]) => ({ pflegegrad, anzahl }))
    .sort((a, b) => {
      if (typeof a.pflegegrad === 'number' && typeof b.pflegegrad === 'number') return a.pflegegrad - b.pflegegrad
      if (typeof a.pflegegrad === 'number') return -1
      return 1
    })

  return { aktiv, neuImZeitraum, beendetImZeitraum, pflegegradVerteilung }
}

// ── Budgets ─────────────────────────────────────────────────────

async function ladeBudgets(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BudgetUebersicht> {
  let gesamtBudgetEuro = 0
  let verbrauchtEuro = 0
  let kritischeBudgets = 0

  try {
    const { data, error } = await supabase
      .from('client_budgets')
      .select('annual_amount, used_amount, combined_annual_amount, combined_used_amount')
      .eq('organization_id', orgId)
      .eq('status', 'active')
    if (error) throw error
    for (const b of data || []) {
      const budget = (Number(b.annual_amount) || 0) + (Number(b.combined_annual_amount) || 0)
      const used = (Number(b.used_amount) || 0) + (Number(b.combined_used_amount) || 0)
      gesamtBudgetEuro += budget
      verbrauchtEuro += used
      // Kritisch: > 90% verbraucht
      if (budget > 0 && (used / budget) > 0.9) {
        kritischeBudgets++
      }
    }
  } catch { /* client_budgets nicht ladbar */ }

  const auslastungProzent =
    gesamtBudgetEuro > 0 ? Math.round((verbrauchtEuro / gesamtBudgetEuro) * 1000) / 10 : null

  return {
    gesamtBudgetEuro: aufCent(gesamtBudgetEuro),
    verbrauchtEuro: aufCent(verbrauchtEuro),
    auslastungProzent,
    kritischeBudgets,
  }
}

// ── Qualitaet ───────────────────────────────────────────────────

async function ladeQualitaet(
  supabase: SupabaseClient,
  orgId: string,
  zeitraum: PdlCockpitZeitraum,
): Promise<QualitaetUebersicht> {
  // Zufriedenheit aus satisfaction_calls
  let zufriedenheitSchnitt: number | null = null
  try {
    const { data, error } = await supabase
      .from('satisfaction_calls')
      .select('satisfaction_rating')
      .eq('organization_id', orgId)
      .gte('call_date', zeitraum.von)
      .lte('call_date', zeitraum.bis)
    if (error) throw error
    const bewertet = (data || []).filter(d => d.satisfaction_rating != null)
    if (bewertet.length > 0) {
      const summe = bewertet.reduce((s, d) => s + Number(d.satisfaction_rating), 0)
      zufriedenheitSchnitt = Math.round((summe / bewertet.length) * 100) / 100
    }
  } catch { /* satisfaction_calls nicht ladbar */ }

  // Offene Wunden
  let offeneWunden = 0
  try {
    const { data, error } = await supabase
      .from('wounds')
      .select('status')
      .eq('organization_id', orgId)
      .in('status', ['aktiv', 'in_abheilung', 'stagnierend', 'verschlechtert'])
    if (error) throw error
    offeneWunden = (data || []).length
  } catch { /* wounds nicht ladbar */ }

  // Sturzereignisse im Zeitraum
  let sturzEreignisse = 0
  try {
    const { data, error } = await supabase
      .from('pflege_verlauf')
      .select('eintrag_typ')
      .eq('organization_id', orgId)
      .eq('eintrag_typ', 'sturz')
      .gte('eintrag_datum', `${zeitraum.von}T00:00:00.000Z`)
      .lte('eintrag_datum', `${zeitraum.bis}T23:59:59.999Z`)
    if (error) throw error
    sturzEreignisse = (data || []).length
  } catch { /* pflege_verlauf nicht ladbar */ }

  // Ueberfaellige Verordnungen
  let ueberfaelligeVerordnungen = 0
  try {
    const heute = heuteBerlin()
    const { data, error } = await supabase
      .from('verordnungen')
      .select('id')
      .eq('organization_id', orgId)
      .lt('gueltig_bis', heute)
      .is('deleted_at', null)
      .in('genehmigung_status', ['ausstehend', 'beantragt', 'genehmigt'])
    if (error) throw error
    ueberfaelligeVerordnungen = (data || []).length
  } catch { /* verordnungen nicht ladbar */ }

  return { zufriedenheitSchnitt, offeneWunden, sturzEreignisse, ueberfaelligeVerordnungen }
}

// ── Hauptfunktion ───────────────────────────────────────────────

export async function ladePdlCockpit(
  supabase: SupabaseClient,
  organizationId: string,
  zeitraum: PdlCockpitZeitraum,
): Promise<PdlCockpitData> {
  const [leistungen, umsatz, personal, klienten, budgets, qualitaet] = await Promise.all([
    ladeLeistungen(supabase, organizationId, zeitraum),
    ladeUmsatz(supabase, organizationId, zeitraum),
    ladePersonal(supabase, organizationId, zeitraum),
    ladeKlienten(supabase, organizationId, zeitraum),
    ladeBudgets(supabase, organizationId),
    ladeQualitaet(supabase, organizationId, zeitraum),
  ])

  return { zeitraum, leistungen, umsatz, personal, klienten, budgets, qualitaet }
}

// ── Zeitraum-Hilfsfunktion ──────────────────────────────────────

export function standardZeitraumAktuellerMonat(): PdlCockpitZeitraum {
  const heute = new Date()
  const year = heute.getFullYear()
  const month = heute.getMonth()
  const von = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const letzterTag = new Date(year, month + 1, 0).getDate()
  const bis = `${year}-${String(month + 1).padStart(2, '0')}-${String(letzterTag).padStart(2, '0')}`
  return { von, bis }
}
