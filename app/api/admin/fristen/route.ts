import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

// ═══════════════════════════════════════════════════════════════
// Fristen-Dashboard API — aggregiert Fristen aus allen Quellen
// ═══════════════════════════════════════════════════════════════

type Dringlichkeit = 'ueberfaellig' | 'kritisch' | 'warnung' | 'ok'

interface FristItem {
  id: string
  typ: string
  titel: string
  beschreibung: string
  bezug: string
  faellig_am: string
  tage_verbleibend: number
  dringlichkeit: Dringlichkeit
  quelle: string
}

function berechneDringlichkeit(tage: number): Dringlichkeit {
  if (tage < 0) return 'ueberfaellig'
  if (tage <= 14) return 'kritisch'
  if (tage <= 30) return 'warnung'
  return 'ok'
}

function tageVerbleibend(datumStr: string): number {
  const d = new Date(datumStr)
  if (isNaN(d.getTime())) return 999
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

function vollerName(row: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!row) return 'Unbekannt'
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unbekannt'
}

export async function GET() {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const orgId = auth.ctx.organizationId
  const admin = createAdminClient()
  const fristen: FristItem[] = []
  const warnungen: string[] = []

  // ── 1. Qualifikationen ──────────────────────────────────────────
  try {
    const { data: quals, error } = await admin
      .from('caregiver_qualifications')
      .select('id, qualification_type, title, valid_until, caregivers(first_name, last_name)')
      .eq('organization_id', orgId)
      .not('valid_until', 'is', null)

    if (error) throw error

    for (const q of quals || []) {
      const tage = tageVerbleibend(q.valid_until)
      const caregiver = Array.isArray(q.caregivers) ? q.caregivers[0] : q.caregivers
      fristen.push({
        id: `qual-${q.id}`,
        typ: 'Qualifikation',
        titel: q.title || q.qualification_type || 'Qualifikation',
        beschreibung: `Qualifikation ${q.title || q.qualification_type} laeuft ab`,
        bezug: vollerName(caregiver),
        faellig_am: q.valid_until,
        tage_verbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Qualifikationen',
      })
    }
  } catch (e) {
    warnungen.push(`Qualifikationen: ${(e as Error).message}`)
  }

  // ── 2. Verordnungen / Genehmigungen ────────────────────────────
  try {
    const { data: verordnungen, error } = await admin
      .from('verordnungen')
      .select('id, verordnung_type, gueltig_bis, genehmigung_bis, genehmigung_status, clients(first_name, last_name)')
      .eq('organization_id', orgId)
      .neq('genehmigung_status', 'abgelehnt')
      .is('deleted_at', null)

    if (error) throw error

    for (const v of verordnungen || []) {
      const client = Array.isArray(v.clients) ? v.clients[0] : v.clients
      const typLabel = VERORDNUNG_LABELS[v.verordnung_type] || v.verordnung_type || 'Verordnung'

      // Verordnungs-Gueltigkeitsfrist
      if (v.gueltig_bis) {
        const tage = tageVerbleibend(v.gueltig_bis)
        fristen.push({
          id: `verordn-${v.id}`,
          typ: 'Verordnung',
          titel: typLabel,
          beschreibung: `Verordnung ${typLabel} laeuft ab`,
          bezug: vollerName(client),
          faellig_am: v.gueltig_bis,
          tage_verbleibend: tage,
          dringlichkeit: berechneDringlichkeit(tage),
          quelle: 'Verordnungen',
        })
      }

      // Genehmigungsfrist (falls vorhanden und anders als gueltig_bis)
      if (v.genehmigung_bis && v.genehmigung_bis !== v.gueltig_bis) {
        const tage = tageVerbleibend(v.genehmigung_bis)
        fristen.push({
          id: `genehm-${v.id}`,
          typ: 'Genehmigung',
          titel: `Genehmigung: ${typLabel}`,
          beschreibung: `Kassengenehmigung fuer ${typLabel} laeuft ab`,
          bezug: vollerName(client),
          faellig_am: v.genehmigung_bis,
          tage_verbleibend: tage,
          dringlichkeit: berechneDringlichkeit(tage),
          quelle: 'Verordnungen',
        })
      }
    }
  } catch (e) {
    warnungen.push(`Verordnungen: ${(e as Error).message}`)
  }

  // ── 3. Schulungen ──────────────────────────────────────────────
  try {
    const { data: schulungen, error } = await admin
      .from('personal_schulungen')
      .select('id, titel, schulungsart, naechste_auffrischung, caregivers(first_name, last_name)')
      .eq('organization_id', orgId)
      .not('naechste_auffrischung', 'is', null)

    if (error) throw error

    for (const s of schulungen || []) {
      const tage = tageVerbleibend(s.naechste_auffrischung)
      const caregiver = Array.isArray(s.caregivers) ? s.caregivers[0] : s.caregivers
      fristen.push({
        id: `schulung-${s.id}`,
        typ: 'Schulung',
        titel: s.titel || 'Schulung',
        beschreibung: `Auffrischung faellig: ${s.titel || s.schulungsart}`,
        bezug: vollerName(caregiver),
        faellig_am: s.naechste_auffrischung,
        tage_verbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Schulungen',
      })
    }
  } catch (e) {
    warnungen.push(`Schulungen: ${(e as Error).message}`)
  }

  // ── 4. Dokumente (akten_dokumente) ─────────────────────────────
  try {
    const { data: dokumente, error } = await admin
      .from('akten_dokumente')
      .select('id, titel, dokument_typ, ablaufdatum, client_id, caregiver_id, clients(first_name, last_name), caregivers(first_name, last_name)')
      .eq('organization_id', orgId)
      .eq('status', 'aktiv')
      .is('deleted_at', null)
      .not('ablaufdatum', 'is', null)

    if (error) throw error

    for (const d of dokumente || []) {
      const tage = tageVerbleibend(d.ablaufdatum)
      const client = Array.isArray(d.clients) ? d.clients[0] : d.clients
      const caregiver = Array.isArray(d.caregivers) ? d.caregivers[0] : d.caregivers
      const bezugPerson = d.client_id ? vollerName(client) : d.caregiver_id ? vollerName(caregiver) : 'Organisation'
      fristen.push({
        id: `dok-${d.id}`,
        typ: 'Dokument',
        titel: d.titel || DOKUMENT_TYP_LABELS[d.dokument_typ] || d.dokument_typ,
        beschreibung: `Dokument ${d.titel || d.dokument_typ} laeuft ab`,
        bezug: bezugPerson,
        faellig_am: d.ablaufdatum,
        tage_verbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Dokumente',
      })
    }
  } catch (e) {
    warnungen.push(`Dokumente: ${(e as Error).message}`)
  }

  // ── 5. Abrechnungsfristen ──────────────────────────────────────
  try {
    const { data: bfristen, error } = await admin
      .from('billing_fristen')
      .select('id, frist_typ, faellig_am, status, notiz')
      .eq('organization_id', orgId)
      .in('status', ['offen', 'eskaliert'])

    if (error) throw error

    for (const b of bfristen || []) {
      const tage = tageVerbleibend(b.faellig_am)
      fristen.push({
        id: `bfrist-${b.id}`,
        typ: 'Abrechnungsfrist',
        titel: FRIST_TYP_LABELS[b.frist_typ] || b.frist_typ,
        beschreibung: b.notiz || `Abrechnungsfrist: ${b.frist_typ}`,
        bezug: b.status === 'eskaliert' ? 'Eskaliert' : 'Offen',
        faellig_am: b.faellig_am,
        tage_verbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Abrechnung',
      })
    }
  } catch (e) {
    warnungen.push(`Abrechnungsfristen: ${(e as Error).message}`)
  }

  // ── Sortierung + Zusammenfassung ───────────────────────────────
  fristen.sort((a, b) => a.tage_verbleibend - b.tage_verbleibend)

  const zusammenfassung = {
    ueberfaellig: fristen.filter(f => f.dringlichkeit === 'ueberfaellig').length,
    kritisch: fristen.filter(f => f.dringlichkeit === 'kritisch').length,
    warnung: fristen.filter(f => f.dringlichkeit === 'warnung').length,
    ok: fristen.filter(f => f.dringlichkeit === 'ok').length,
    gesamt: fristen.length,
  }

  return NextResponse.json({
    fristen,
    zusammenfassung,
    ...(warnungen.length > 0 ? { warnungen } : {}),
  })
}

// ── Lookup-Tabellen ────────────────────────────────────────────────

const VERORDNUNG_LABELS: Record<string, string> = {
  entlastung_45b: 'Entlastungsbetrag §45b',
  verhinderung_39: 'Verhinderungspflege §39',
  behandlungspflege_37: 'Behandlungspflege §37',
  haeusliche_pflege_36: 'Haeusliche Pflege §36',
  alltagsbegleitung_45a: 'Alltagsbegleitung §45a',
  pflegebox_40: 'Pflegebox §40',
  fahrdienst: 'Fahrdienst',
  kombinationsleistung_38: 'Kombinationsleistung §38',
  sonstige: 'Sonstige',
}

const DOKUMENT_TYP_LABELS: Record<string, string> = {
  vertrag: 'Vertrag',
  verordnung: 'Verordnung',
  genehmigung: 'Genehmigung',
  vollmacht: 'Vollmacht',
  fuehrungszeugnis: 'Fuehrungszeugnis',
  erste_hilfe: 'Erste-Hilfe-Kurs',
  qualifikation: 'Qualifikation',
  zertifikat: 'Zertifikat',
  schulung: 'Schulung',
  arbeitsvertrag: 'Arbeitsvertrag',
  sonstiges: 'Sonstiges',
}

const FRIST_TYP_LABELS: Record<string, string> = {
  technischer_fehler: 'Technischer Fehler',
  fachlicher_fehler: 'Fachlicher Fehler',
  abgelehnt: 'Abgelehnt',
  teilweise_abgelehnt: 'Teilweise abgelehnt',
  korrektur_erforderlich: 'Korrektur erforderlich',
  wiedervorlage: 'Wiedervorlage',
  eskalation: 'Eskalation',
}
