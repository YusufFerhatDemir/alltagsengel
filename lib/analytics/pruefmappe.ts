// ═══════════════════════════════════════════════════════════════
// Block 19 — Prüfprotokoll: MDK/MD-Prüfvorbereitung
// Stellt für einen Klienten und Zeitraum die prüfungsrelevanten
// Nachweise aus den bestehenden Pflegedoku-/Leistungsnachweis-
// Datenquellen zusammen (Block 6/7). Keine neuen Fake-Daten — jede
// Kategorie liest ausschließlich reale, org-gefenced Tabellen.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'

export type PruefmappenStatus = 'vollstaendig' | 'unvollstaendig' | 'keine_daten'

export interface PruefmappenKategorie {
  schluessel: string
  bezeichnung: string
  status: PruefmappenStatus
  anzahl: number
  hinweis: string
}

export interface Pruefmappe {
  clientId: string
  zeitraum: { von: string; bis: string }
  kategorien: PruefmappenKategorie[]
}

// ── Pure Bewertungen ─────────────────────────────────────────────

export function bewerteLeistungsnachweise(
  saetze: { client_signature?: string | null | unknown }[],
  offeneFehler: number,
): PruefmappenKategorie {
  if (saetze.length === 0) {
    return { schluessel: 'leistungsnachweise', bezeichnung: 'Leistungsnachweise', status: 'keine_daten', anzahl: 0, hinweis: 'Keine Leistungsnachweise im Zeitraum.' }
  }
  const signiert = saetze.filter(s => s.client_signature).length
  const vollstaendig = signiert === saetze.length && offeneFehler === 0
  return {
    schluessel: 'leistungsnachweise',
    bezeichnung: 'Leistungsnachweise',
    status: vollstaendig ? 'vollstaendig' : 'unvollstaendig',
    anzahl: saetze.length,
    hinweis: `${signiert}/${saetze.length} signiert${offeneFehler > 0 ? `, ${offeneFehler} offene Prüfhinweis(e)` : ''}.`,
  }
}

export function bewertePflegeverlauf(eintraege: unknown[]): PruefmappenKategorie {
  return {
    schluessel: 'pflegeverlauf',
    bezeichnung: 'Pflegedokumentation / Verlauf',
    status: eintraege.length > 0 ? 'vollstaendig' : 'keine_daten',
    anzahl: eintraege.length,
    hinweis: eintraege.length > 0 ? `${eintraege.length} Verlaufseintrag/-einträge im Zeitraum.` : 'Kein Verlaufseintrag im Zeitraum.',
  }
}

export function bewerteMassnahmenplan(plaene: { status: string }[], massnahmen: { status: string }[]): PruefmappenKategorie {
  const aktiverPlan = plaene.some(p => p.status === 'aktiv')
  if (!aktiverPlan) {
    return { schluessel: 'massnahmenplan', bezeichnung: 'Maßnahmenplan', status: 'keine_daten', anzahl: plaene.length, hinweis: 'Kein aktiver Maßnahmenplan hinterlegt.' }
  }
  const offen = massnahmen.filter(m => m.status === 'geplant' || m.status === 'aktiv').length
  return {
    schluessel: 'massnahmenplan',
    bezeichnung: 'Maßnahmenplan',
    status: 'vollstaendig',
    anzahl: massnahmen.length,
    hinweis: `Aktiver Plan vorhanden, ${offen} laufende Maßnahme(n).`,
  }
}

export function bewerteWunddoku(wunden: { status: string }[]): PruefmappenKategorie {
  if (wunden.length === 0) {
    return { schluessel: 'wunddoku', bezeichnung: 'Wunddokumentation', status: 'keine_daten', anzahl: 0, hinweis: 'Keine Wunden dokumentiert (ggf. nicht zutreffend).' }
  }
  const offen = wunden.filter(w => w.status !== 'abgeheilt').length
  return {
    schluessel: 'wunddoku',
    bezeichnung: 'Wunddokumentation',
    status: 'vollstaendig',
    anzahl: wunden.length,
    hinweis: `${offen} aktive, ${wunden.length - offen} abgeheilte Wunde(n).`,
  }
}

export function bewerteVitalwerte(messungen: unknown[]): PruefmappenKategorie {
  return {
    schluessel: 'vitalwerte',
    bezeichnung: 'Vitalwerte',
    status: messungen.length > 0 ? 'vollstaendig' : 'keine_daten',
    anzahl: messungen.length,
    hinweis: messungen.length > 0 ? `${messungen.length} Messung(en) im Zeitraum.` : 'Keine Vitalwert-Messung im Zeitraum.',
  }
}

// ── DB-Beschaffung ───────────────────────────────────────────────

export async function erstellePruefmappe(
  supabase: SupabaseClient,
  params: { organizationId: string; clientId: string; von: string; bis: string },
): Promise<Pruefmappe> {
  const { organizationId, clientId, von, bis } = params
  const vonIso = `${von}T00:00:00.000Z`
  const bisIso = `${bis}T23:59:59.999Z`

  const [recordsRes, verlaufRes, planeRes, woundsRes, vitalsRes] = await Promise.all([
    supabase
      // proof_status/billing_status mitlesen — sonst filtert ohneStornierte()
      // unten nichts (beide Felder waeren undefined).
      .from('service_records')
      .select('id, client_signature, proof_status, billing_status')
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .gte('date', von)
      .lte('date', bis),
    supabase
      .from('pflege_verlauf')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .gte('eintrag_datum', vonIso)
      .lte('eintrag_datum', bisIso),
    supabase
      .from('pflege_massnahmenplaene')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('client_id', clientId),
    supabase
      .from('wounds')
      .select('status')
      .eq('organization_id', organizationId)
      .eq('client_id', clientId),
    supabase
      .from('vital_signs')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .gte('measured_at', vonIso)
      .lte('measured_at', bisIso),
  ])

  if (recordsRes.error) throw new Error(`Leistungsnachweise konnten nicht geladen werden: ${recordsRes.error.message}`)
  if (verlaufRes.error) throw new Error(`Pflegeverlauf konnte nicht geladen werden: ${verlaufRes.error.message}`)
  if (planeRes.error) throw new Error(`Maßnahmenpläne konnten nicht geladen werden: ${planeRes.error.message}`)
  if (woundsRes.error) throw new Error(`Wunddoku konnte nicht geladen werden: ${woundsRes.error.message}`)
  if (vitalsRes.error) throw new Error(`Vitalwerte konnten nicht geladen werden: ${vitalsRes.error.message}`)

  // Ein STORNIERTER Nachweis ist keine erbrachte Leistung. In der
  // Pruefmappe zaehlte er bisher voll mit: einmal in der Gesamtzahl und
  // einmal in der Unterschriftenquote, an der die Kategorie
  // "Leistungsnachweise" haengt. Ein Widerruf ohne Unterschrift drueckte
  // damit die Quote der Dokumentation, obwohl gar keine Leistung offen ist —
  // und das ist die Zahl, die bei einer MD-Pruefung vorgelegt wird.
  const alleRecords = (recordsRes.data || []) as { id: string; client_signature?: unknown; proof_status?: string | null; billing_status?: string | null }[]
  const gueltigeRecords = ohneStornierte(alleRecords)
  const recordIds = gueltigeRecords.map(r => r.id)
  let offeneFehler = 0
  if (recordIds.length > 0) {
    const { data: fehlerData, error: fehlerErr } = await supabase
      .from('review_errors')
      .select('id')
      .in('service_record_id', recordIds)
      .eq('resolved', false)
    if (fehlerErr) throw new Error(`Prüfhinweise konnten nicht geladen werden: ${fehlerErr.message}`)
    offeneFehler = (fehlerData || []).length
  }

  const planIds = (planeRes.data || []).map((p: any) => p.id as string)
  let massnahmen: { status: string }[] = []
  if (planIds.length > 0) {
    const { data: massnahmenData, error: massnahmenErr } = await supabase
      .from('pflege_massnahmen')
      .select('status')
      .in('plan_id', planIds)
    if (massnahmenErr) throw new Error(`Maßnahmen konnten nicht geladen werden: ${massnahmenErr.message}`)
    massnahmen = massnahmenData || []
  }

  const kategorien: PruefmappenKategorie[] = [
    bewerteLeistungsnachweise(gueltigeRecords, offeneFehler),
    bewertePflegeverlauf(verlaufRes.data || []),
    bewerteMassnahmenplan(planeRes.data || [], massnahmen),
    bewerteWunddoku(woundsRes.data || []),
    bewerteVitalwerte(vitalsRes.data || []),
  ]

  return { clientId, zeitraum: { von, bis }, kategorien }
}
