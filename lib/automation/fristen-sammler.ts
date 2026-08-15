/**
 * Fristen-Sammler — aggregiert alle fristgebundenen Entitäten einer
 * Organisation (Qualifikationen, Verordnungen/Genehmigungen, Schulungen,
 * Dokumente, Abrechnungsfristen) zu einer einheitlichen Liste.
 *
 * Geteilte Grundlage für:
 *   - app/api/admin/fristen/route.ts (Anzeige im Fristen-Dashboard)
 *   - lib/automation/fristen-warnung.ts (Kette 2: 30/14/7-Tage-Warnung)
 *   - lib/automation/eskalation-fristen.ts (Kette 3: Frist überschritten → Aufgabe)
 *
 * War bis 2026-08-15 nur als GET-Handler-Logik in der Dashboard-Route
 * vorhanden — ein reiner Anzeige-Query ohne aktiven Auslöser. Hier heraus­
 * gezogen, damit dieselbe Aggregation auch von Cron-getriebenen Ketten
 * genutzt werden kann, statt sie ein zweites Mal (und potenziell
 * abweichend) nachzubauen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type FristDringlichkeit = 'ueberfaellig' | 'kritisch' | 'warnung' | 'ok'
export type FristEntitaetTyp = 'qualifikation' | 'verordnung' | 'genehmigung' | 'schulung' | 'dokument' | 'abrechnungsfrist'
  | 'probezeit' | 'mitarbeitergespraech' | 'arbeitszeit_verstoss' | 'fem_ueberwachung'

export interface FristItem {
  /** Zusammengesetzt aus Typ + Roh-Id, z. B. "qual-<uuid>" — stabil für Dublettenschutz. */
  id: string
  entitaetTyp: FristEntitaetTyp
  entitaetId: string
  typ: string
  titel: string
  beschreibung: string
  bezug: string
  /** Betroffener Mitarbeiter, für Aufgaben-/Benachrichtigungs-Routing. */
  caregiverId: string | null
  /** Betroffener Klient, für Aufgaben-/Benachrichtigungs-Routing. */
  clientId: string | null
  faelligAm: string
  tageVerbleibend: number
  dringlichkeit: FristDringlichkeit
  quelle: string
}

export function berechneDringlichkeit(tage: number): FristDringlichkeit {
  if (tage < 0) return 'ueberfaellig'
  if (tage <= 14) return 'kritisch'
  if (tage <= 30) return 'warnung'
  return 'ok'
}

export function tageVerbleibend(datumStr: string): number {
  const d = new Date(datumStr)
  if (isNaN(d.getTime())) return 999
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

function vollerName(row: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!row) return 'Unbekannt'
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unbekannt'
}

export const VERORDNUNG_LABELS: Record<string, string> = {
  entlastung_45b: 'Entlastungsbetrag §45b',
  verhinderung_39: 'Verhinderungspflege §39',
  behandlungspflege_37: 'Behandlungspflege §37',
  haeusliche_pflege_36: 'Häusliche Pflege §36',
  alltagsbegleitung_45a: 'Alltagsbegleitung §45a',
  pflegebox_40: 'Pflegebox §40',
  fahrdienst: 'Fahrdienst',
  kombinationsleistung_38: 'Kombinationsleistung §38',
  sonstige: 'Sonstige',
}

export const DOKUMENT_TYP_LABELS: Record<string, string> = {
  vertrag: 'Vertrag',
  verordnung: 'Verordnung',
  genehmigung: 'Genehmigung',
  vollmacht: 'Vollmacht',
  fuehrungszeugnis: 'Führungszeugnis',
  erste_hilfe: 'Erste-Hilfe-Kurs',
  qualifikation: 'Qualifikation',
  zertifikat: 'Zertifikat',
  schulung: 'Schulung',
  arbeitsvertrag: 'Arbeitsvertrag',
  sonstiges: 'Sonstiges',
}

export const FRIST_TYP_LABELS: Record<string, string> = {
  technischer_fehler: 'Technischer Fehler',
  fachlicher_fehler: 'Fachlicher Fehler',
  abgelehnt: 'Abgelehnt',
  teilweise_abgelehnt: 'Teilweise abgelehnt',
  korrektur_erforderlich: 'Korrektur erforderlich',
  wiedervorlage: 'Wiedervorlage',
  eskalation: 'Eskalation',
}

export interface SammleFristenErgebnis {
  fristen: FristItem[]
  warnungen: string[]
}

export async function sammleFristen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<SammleFristenErgebnis> {
  const fristen: FristItem[] = []
  const warnungen: string[] = []

  // ── 1. Qualifikationen ──────────────────────────────────────────
  try {
    const { data: quals, error } = await supabase
      .from('caregiver_qualifications')
      .select('id, qualification_type, title, valid_until, caregiver_id, caregivers(first_name, last_name)')
      .eq('organization_id', organizationId)
      .not('valid_until', 'is', null)

    if (error) throw error

    for (const q of quals || []) {
      const tage = tageVerbleibend(q.valid_until)
      const caregiver = Array.isArray(q.caregivers) ? q.caregivers[0] : q.caregivers
      fristen.push({
        id: `qual-${q.id}`,
        entitaetTyp: 'qualifikation',
        entitaetId: q.id,
        typ: 'Qualifikation',
        titel: q.title || q.qualification_type || 'Qualifikation',
        beschreibung: `Qualifikation ${q.title || q.qualification_type} läuft ab`,
        bezug: vollerName(caregiver),
        caregiverId: q.caregiver_id ?? null,
        clientId: null,
        faelligAm: q.valid_until,
        tageVerbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Qualifikationen',
      })
    }
  } catch (e) {
    warnungen.push(`Qualifikationen: ${(e as Error).message}`)
  }

  // ── 2. Verordnungen / Genehmigungen ────────────────────────────
  try {
    const { data: verordnungen, error } = await supabase
      .from('verordnungen')
      .select('id, verordnung_type, gueltig_bis, genehmigung_bis, genehmigung_status, client_id, clients(first_name, last_name)')
      .eq('organization_id', organizationId)
      .neq('genehmigung_status', 'abgelehnt')
      .is('deleted_at', null)

    if (error) throw error

    for (const v of verordnungen || []) {
      const client = Array.isArray(v.clients) ? v.clients[0] : v.clients
      const typLabel = VERORDNUNG_LABELS[v.verordnung_type] || v.verordnung_type || 'Verordnung'

      if (v.gueltig_bis) {
        const tage = tageVerbleibend(v.gueltig_bis)
        fristen.push({
          id: `verordn-${v.id}`,
          entitaetTyp: 'verordnung',
          entitaetId: v.id,
          typ: 'Verordnung',
          titel: typLabel,
          beschreibung: `Verordnung ${typLabel} läuft ab`,
          bezug: vollerName(client),
          caregiverId: null,
          clientId: v.client_id ?? null,
          faelligAm: v.gueltig_bis,
          tageVerbleibend: tage,
          dringlichkeit: berechneDringlichkeit(tage),
          quelle: 'Verordnungen',
        })
      }

      if (v.genehmigung_bis && v.genehmigung_bis !== v.gueltig_bis) {
        const tage = tageVerbleibend(v.genehmigung_bis)
        fristen.push({
          id: `genehm-${v.id}`,
          entitaetTyp: 'genehmigung',
          entitaetId: v.id,
          typ: 'Genehmigung',
          titel: `Genehmigung: ${typLabel}`,
          beschreibung: `Kassengenehmigung für ${typLabel} läuft ab`,
          bezug: vollerName(client),
          caregiverId: null,
          clientId: v.client_id ?? null,
          faelligAm: v.genehmigung_bis,
          tageVerbleibend: tage,
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
    const { data: schulungen, error } = await supabase
      .from('personal_schulungen')
      .select('id, titel, schulungsart, naechste_auffrischung, caregiver_id, caregivers(first_name, last_name)')
      .eq('organization_id', organizationId)
      .not('naechste_auffrischung', 'is', null)

    if (error) throw error

    for (const s of schulungen || []) {
      const tage = tageVerbleibend(s.naechste_auffrischung)
      const caregiver = Array.isArray(s.caregivers) ? s.caregivers[0] : s.caregivers
      fristen.push({
        id: `schulung-${s.id}`,
        entitaetTyp: 'schulung',
        entitaetId: s.id,
        typ: 'Schulung',
        titel: s.titel || 'Schulung',
        beschreibung: `Auffrischung fällig: ${s.titel || s.schulungsart}`,
        bezug: vollerName(caregiver),
        caregiverId: s.caregiver_id ?? null,
        clientId: null,
        faelligAm: s.naechste_auffrischung,
        tageVerbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Schulungen',
      })
    }
  } catch (e) {
    warnungen.push(`Schulungen: ${(e as Error).message}`)
  }

  // ── 4. Dokumente (akten_dokumente) ─────────────────────────────
  try {
    const { data: dokumente, error } = await supabase
      .from('akten_dokumente')
      .select('id, titel, dokument_typ, ablaufdatum, client_id, caregiver_id, clients(first_name, last_name), caregivers(first_name, last_name)')
      .eq('organization_id', organizationId)
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
        entitaetTyp: 'dokument',
        entitaetId: d.id,
        typ: 'Dokument',
        titel: d.titel || DOKUMENT_TYP_LABELS[d.dokument_typ] || d.dokument_typ,
        beschreibung: `Dokument ${d.titel || d.dokument_typ} läuft ab`,
        bezug: bezugPerson,
        caregiverId: d.caregiver_id ?? null,
        clientId: d.client_id ?? null,
        faelligAm: d.ablaufdatum,
        tageVerbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Dokumente',
      })
    }
  } catch (e) {
    warnungen.push(`Dokumente: ${(e as Error).message}`)
  }

  // ── 5. Abrechnungsfristen ──────────────────────────────────────
  try {
    const { data: bfristen, error } = await supabase
      .from('billing_fristen')
      .select('id, frist_typ, faellig_am, status, notiz')
      .eq('organization_id', organizationId)
      .in('status', ['offen', 'eskaliert'])

    if (error) throw error

    for (const b of bfristen || []) {
      const tage = tageVerbleibend(b.faellig_am)
      fristen.push({
        id: `bfrist-${b.id}`,
        entitaetTyp: 'abrechnungsfrist',
        entitaetId: b.id,
        typ: 'Abrechnungsfrist',
        titel: FRIST_TYP_LABELS[b.frist_typ] || b.frist_typ,
        beschreibung: b.notiz || `Abrechnungsfrist: ${b.frist_typ}`,
        bezug: b.status === 'eskaliert' ? 'Eskaliert' : 'Offen',
        caregiverId: null,
        clientId: null,
        faelligAm: b.faellig_am,
        tageVerbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Abrechnung',
      })
    }
  } catch (e) {
    warnungen.push(`Abrechnungsfristen: ${(e as Error).message}`)
  }

  // ── 6. Probezeit ────────────────────────────────────────────────
  try {
    const { data: probezeiten, error } = await supabase
      .from('caregivers')
      .select('id, first_name, last_name, probezeitende, vertragsstatus')
      .eq('organization_id', organizationId)
      .not('probezeitende', 'is', null)

    if (error) throw error

    for (const c of probezeiten || []) {
      if (c.vertragsstatus && ['gekuendigt', 'ausgeschieden'].includes(c.vertragsstatus)) continue
      const tage = tageVerbleibend(c.probezeitende)
      fristen.push({
        id: `probezeit-${c.id}`,
        entitaetTyp: 'probezeit',
        entitaetId: c.id,
        typ: 'Probezeit',
        titel: 'Probezeitende',
        beschreibung: `Probezeit von ${vollerName(c)} endet`,
        bezug: vollerName(c),
        caregiverId: c.id,
        clientId: null,
        faelligAm: c.probezeitende,
        tageVerbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Personal',
      })
    }
  } catch (e) {
    warnungen.push(`Probezeit: ${(e as Error).message}`)
  }

  // ── 7. Mitarbeitergespräche (nächster geplanter Termin) ────────
  try {
    const { data: gespraeche, error } = await supabase
      .from('mitarbeitergespraeche')
      .select('id, caregiver_id, datum, naechstes_gespraech_geplant_am, caregivers(first_name, last_name)')
      .eq('organization_id', organizationId)
      .not('naechstes_gespraech_geplant_am', 'is', null)
      .order('datum', { ascending: false })

    if (error) throw error

    const gesehen = new Set<string>()
    for (const g of gespraeche || []) {
      if (!g.caregiver_id || gesehen.has(g.caregiver_id)) continue
      gesehen.add(g.caregiver_id)
      const tage = tageVerbleibend(g.naechstes_gespraech_geplant_am)
      const caregiver = Array.isArray(g.caregivers) ? g.caregivers[0] : g.caregivers
      fristen.push({
        id: `mag-${g.id}`,
        entitaetTyp: 'mitarbeitergespraech',
        entitaetId: g.id,
        typ: 'Mitarbeitergespräch',
        titel: 'Nächstes Mitarbeitergespräch',
        beschreibung: `Mitarbeitergespräch mit ${vollerName(caregiver)} fällig`,
        bezug: vollerName(caregiver),
        caregiverId: g.caregiver_id,
        clientId: null,
        faelligAm: g.naechstes_gespraech_geplant_am,
        tageVerbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Personal',
      })
    }
  } catch (e) {
    warnungen.push(`Mitarbeitergespräche: ${(e as Error).message}`)
  }

  // ── 8. Arbeitszeitgesetz-Verstöße (unquittiert) ─────────────────
  try {
    const { data: verstoesse, error } = await supabase
      .from('arbeitszeit_verstoesse')
      .select('id, caregiver_id, verstoss_art, datum, erkannt_am, caregivers(first_name, last_name)')
      .eq('organization_id', organizationId)
      .eq('quittiert', false)

    if (error) throw error

    for (const v of verstoesse || []) {
      const tage = tageVerbleibend(v.erkannt_am)
      const caregiver = Array.isArray(v.caregivers) ? v.caregivers[0] : v.caregivers
      const artLabel = v.verstoss_art === 'max_tagesarbeitszeit' ? 'Tageshöchstarbeitszeit überschritten (§3 ArbZG)' : 'Mindestruhezeit unterschritten (§5 ArbZG)'
      fristen.push({
        id: `azv-${v.id}`,
        entitaetTyp: 'arbeitszeit_verstoss',
        entitaetId: v.id,
        typ: 'ArbZG-Verstoß',
        titel: artLabel,
        beschreibung: `${artLabel} am ${v.datum} bei ${vollerName(caregiver)}`,
        bezug: vollerName(caregiver),
        caregiverId: v.caregiver_id,
        clientId: null,
        faelligAm: v.erkannt_am,
        tageVerbleibend: tage,
        dringlichkeit: 'ueberfaellig',
        quelle: 'Dienstplan',
      })
    }
  } catch (e) {
    warnungen.push(`Arbeitszeitgesetz-Verstöße: ${(e as Error).message}`)
  }

  // ── 9. FEM-Überwachung (nächste Kontrolle fällig) ───────────────
  try {
    const { data: massnahmen, error } = await supabase
      .from('freiheitsentziehende_massnahmen')
      .select('id, client_id, art, beginn_am, ueberwachungsintervall_minuten, clients(first_name, last_name)')
      .eq('organization_id', organizationId)
      .eq('status', 'aktiv')

    if (error) throw error

    const massnahmeIds = (massnahmen || []).map(m => m.id)
    const letzteKontrolle = new Map<string, string>()
    if (massnahmeIds.length > 0) {
      const { data: kontrollen, error: kErr } = await supabase
        .from('fem_ueberwachungen')
        .select('massnahme_id, kontrolliert_am')
        .in('massnahme_id', massnahmeIds)
        .order('kontrolliert_am', { ascending: false })
      if (kErr) throw kErr
      for (const k of kontrollen || []) {
        if (!letzteKontrolle.has(k.massnahme_id)) letzteKontrolle.set(k.massnahme_id, k.kontrolliert_am)
      }
    }

    for (const m of massnahmen || []) {
      const basis = letzteKontrolle.get(m.id) || m.beginn_am
      const naechsteFaellig = new Date(new Date(basis).getTime() + m.ueberwachungsintervall_minuten * 60000).toISOString()
      const tage = tageVerbleibend(naechsteFaellig)
      const client = Array.isArray(m.clients) ? m.clients[0] : m.clients
      fristen.push({
        id: `fem-ueberw-${m.id}`,
        entitaetTyp: 'fem_ueberwachung',
        entitaetId: m.id,
        typ: 'FEM-Überwachung',
        titel: `Überwachung fällig: ${ARTEN_LABEL(m.art)}`,
        beschreibung: `Nächste Kontrolle der freiheitsentziehenden Maßnahme fällig`,
        bezug: vollerName(client),
        caregiverId: null,
        clientId: m.client_id ?? null,
        faelligAm: naechsteFaellig,
        tageVerbleibend: tage,
        dringlichkeit: berechneDringlichkeit(tage),
        quelle: 'Fixierungsprotokoll',
      })
    }
  } catch (e) {
    warnungen.push(`FEM-Überwachung: ${(e as Error).message}`)
  }

  fristen.sort((a, b) => a.tageVerbleibend - b.tageVerbleibend)
  return { fristen, warnungen }
}

function ARTEN_LABEL(art: string): string {
  const labels: Record<string, string> = {
    bettgitter: 'Bettgitter',
    gurtfixierung: 'Gurtfixierung',
    fixierweste: 'Fixierweste',
    sedierende_medikation: 'Sedierende Medikation',
    bewegungseinschraenkender_stuhl: 'Bewegungseinschränkender Stuhl',
    einschliessung: 'Einschließung',
    sonstige: 'Sonstige',
  }
  return labels[art] || art
}
