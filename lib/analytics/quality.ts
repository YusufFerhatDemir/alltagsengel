// ═══════════════════════════════════════════════════════════════
// Block 19 — Quality-Dashboard
// Aggregiert Qualitätskennzahlen aus den Block-7-Modulen: Wunddoku,
// Vitalwerte-Alarme, Sturzereignisse, offene Maßnahmen. Alle
// Abfragen org-gefenced. Vitalwerte-Alarme respektieren den
// MDR-Kill-Switch (grenzwertAlarmeAktiv) — fail-closed.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import { grenzwertAlarmeAktiv } from '@/lib/vitals/config'
import { berechneAktuelleAlarme } from '@/lib/vitals/vitals'
import type { VitalSign, VitalSignThreshold } from '@/lib/vitals/types'

export interface QualityZeitraum {
  von: string
  bis: string
}

export interface WundKennzahlen {
  gesamt: number
  aktiv: number
  verschlechtert: number
  abgeheilt: number
}

export interface SturzKennzahlen {
  anzahl: number
}

export interface VitalalarmKennzahlen {
  aktiv: boolean // MDR-Kill-Switch (grenzwertAlarmeAktiv)
  kritisch: number
  warnung: number
}

export interface MassnahmenKennzahlen {
  offen: number
  abgeschlossen: number
}

export interface QualityDashboard {
  zeitraum: QualityZeitraum
  wunden: WundKennzahlen
  sturzereignisse: SturzKennzahlen
  vitalalarme: VitalalarmKennzahlen
  massnahmen: MassnahmenKennzahlen
}

// ── Pure Berechnungen ────────────────────────────────────────────

export function berechneWundKennzahlen(wunden: { status: string }[]): WundKennzahlen {
  return {
    gesamt: wunden.length,
    aktiv: wunden.filter(w => w.status === 'aktiv' || w.status === 'in_abheilung' || w.status === 'stagnierend').length,
    verschlechtert: wunden.filter(w => w.status === 'verschlechtert').length,
    abgeheilt: wunden.filter(w => w.status === 'abgeheilt').length,
  }
}

export function berechneMassnahmenKennzahlen(massnahmen: { status: string }[]): MassnahmenKennzahlen {
  return {
    offen: massnahmen.filter(m => m.status === 'geplant' || m.status === 'aktiv').length,
    abgeschlossen: massnahmen.filter(m => m.status === 'abgeschlossen').length,
  }
}

export function berechneSturzKennzahlen(verlaufEintraege: { eintrag_typ: string }[]): SturzKennzahlen {
  return { anzahl: verlaufEintraege.filter(e => e.eintrag_typ === 'sturz').length }
}

// ── DB-Beschaffung ───────────────────────────────────────────────

export async function ladeQualityDashboard(
  supabase: SupabaseClient,
  organizationId: string,
  zeitraum: QualityZeitraum,
): Promise<QualityDashboard> {
  const vonIso = `${zeitraum.von}T00:00:00.000Z`
  const bisIso = `${zeitraum.bis}T23:59:59.999Z`

  const [woundsRes, verlaufRes, massnahmenRes] = await Promise.all([
    supabase.from('wounds').select('status').eq('organization_id', organizationId),
    supabase
      .from('pflege_verlauf')
      .select('eintrag_typ')
      .eq('organization_id', organizationId)
      .gte('eintrag_datum', vonIso)
      .lte('eintrag_datum', bisIso),
    supabase.from('pflege_massnahmen').select('status').eq('organization_id', organizationId),
  ])

  if (woundsRes.error) throw new Error(`Wunddoku konnte nicht geladen werden: ${woundsRes.error.message}`)
  if (verlaufRes.error) throw new Error(`Pflegeverlauf konnte nicht geladen werden: ${verlaufRes.error.message}`)
  if (massnahmenRes.error) throw new Error(`Maßnahmen konnten nicht geladen werden: ${massnahmenRes.error.message}`)

  const vitalalarme = await ladeVitalalarme(supabase, organizationId)

  return {
    zeitraum,
    wunden: berechneWundKennzahlen(woundsRes.data || []),
    sturzereignisse: berechneSturzKennzahlen(verlaufRes.data || []),
    vitalalarme,
    massnahmen: berechneMassnahmenKennzahlen(massnahmenRes.data || []),
  }
}

async function ladeVitalalarme(supabase: SupabaseClient, organizationId: string): Promise<VitalalarmKennzahlen> {
  if (!grenzwertAlarmeAktiv()) {
    return { aktiv: false, kritisch: 0, warnung: 0 }
  }
  const [messungenRes, grenzwerteRes] = await Promise.all([
    supabase
      .from('vital_signs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('measured_at', { ascending: false })
      .limit(2000),
    supabase.from('vital_sign_thresholds').select('*').eq('organization_id', organizationId).eq('enabled', true),
  ])
  if (messungenRes.error) throw new Error(`Vitalwerte konnten nicht geladen werden: ${messungenRes.error.message}`)
  if (grenzwerteRes.error) throw new Error(`Grenzwerte konnten nicht geladen werden: ${grenzwerteRes.error.message}`)

  const alarme = berechneAktuelleAlarme(
    (messungenRes.data || []) as VitalSign[],
    (grenzwerteRes.data || []) as VitalSignThreshold[],
  )
  return {
    aktiv: true,
    kritisch: alarme.filter(a => a.bewertung.stufe === 'kritisch').length,
    warnung: alarme.filter(a => a.bewertung.stufe === 'warnung').length,
  }
}
