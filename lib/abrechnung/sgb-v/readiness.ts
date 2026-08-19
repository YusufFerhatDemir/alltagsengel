/**
 * § 302 SGB V — Readiness (Block 17)
 *
 * Beantwortet eine Frage: Könnte diese Organisation heute häusliche
 * Krankenpflege nach § 302 SGB V abrechnen — und wenn nein, woran genau?
 *
 * Übernimmt die Trennung aus lib/abrechnung/readiness.ts (§ 105):
 *   INTERN — im Code/in der Datenbank lösbar (Routing, Verordnungen, Register)
 *   EXTERN — nur von aussen beschaffbar (Zulassung als sonstiger
 *            Leistungserbringer, Technische Anlage, Kassenverträge)
 *
 * Die Trennung ist hier besonders wichtig: der grösste Blocker (die Technische
 * Anlage) ist EXTERN und lässt sich nicht wegprogrammieren.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeFormatVersionen, loeseVersionAuf, type SgbVFormat } from './versionen'
import { ladeRouting } from './routing'
import { exportImplementiert } from './generator'
import { HKP_VERORDNUNG_TYPE } from './positionen'

export type Ampel = 'gruen' | 'gelb' | 'rot'
export type BlockerArt = 'intern' | 'extern' | null

export interface SgbVReadinessPunkt {
  id: string
  label: string
  ampel: Ampel
  wert: string | null
  hinweis: string | null
  blocker: BlockerArt
}

export interface SgbVReadinessErgebnis {
  organizationId: string
  abrechnungsmonat: string
  gesamt: Ampel
  /** true nur, wenn ausnahmslos alles grün ist. */
  abrechnungsbereit: boolean
  punkte: SgbVReadinessPunkt[]
  zusammenfassung: { gruen: number; gelb: number; rot: number; gesamt: number }
  offeneBlocker: { intern: string[]; extern: string[] }
}

function punkt(
  id: string,
  label: string,
  ampel: Ampel,
  wert: string | null,
  hinweis: string | null,
  blocker: BlockerArt
): SgbVReadinessPunkt {
  return { id, label, ampel, wert, hinweis, blocker }
}

export async function ermittleSgbVReadiness(
  supabase: SupabaseClient,
  organizationId: string,
  abrechnungsmonat: string,
  format: SgbVFormat = 'edifact_slga_slla'
): Promise<SgbVReadinessErgebnis> {
  const punkte: SgbVReadinessPunkt[] = []

  // ── 1. Formatversion + Spezifikation ──
  const versionen = await ladeFormatVersionen(supabase, organizationId)
  const aufloesung = loeseVersionAuf(versionen, abrechnungsmonat, format)

  punkte.push(punkt(
    'formatversion',
    'Geltende Formatversion',
    aufloesung.kandidaten.length > 0 ? 'gruen' : 'rot',
    aufloesung.kandidaten[0]
      ? `${aufloesung.kandidaten[0].bezeichnung} (TA ${aufloesung.kandidaten[0].ta_version})`
      : null,
    aufloesung.kandidaten.length > 0 ? null : aufloesung.hinweis,
    aufloesung.kandidaten.length > 0 ? null : 'intern',
  ))

  const specOk = !!aufloesung.version?.spec_bestaetigt
  punkte.push(punkt(
    'spezifikation',
    'Technische Anlage hinterlegt',
    specOk ? 'gruen' : 'rot',
    aufloesung.version?.spec_quelle ?? null,
    specOk
      ? null
      : 'Die Technische Anlage 1 zur § 302-Vereinbarung (inkl. Schlüsselverzeichnisse) liegt nicht vor. Ohne sie werden keine Datensätze erzeugt — Segmentstrukturen werden nicht geraten.',
    specOk ? null : 'extern',
  ))

  punkte.push(punkt(
    'generator',
    'Datensatz-Erzeugung implementiert',
    exportImplementiert(format) ? 'gruen' : 'rot',
    null,
    exportImplementiert(format)
      ? null
      : 'Der SLGA/SLLA-Generator ist bewusst gesperrt, solange die Spezifikation fehlt (s. lib/abrechnung/sgb-v/generator.ts).',
    exportImplementiert(format) ? null : 'intern',
  ))

  // ── 2. Krankenkassen-Routing ──
  const routing = await ladeRouting(supabase, organizationId)
  const vollstaendig = routing.filter(r => r.datenannahmestelle_ik && r.annahme_format)

  punkte.push(punkt(
    'routing',
    'Krankenkassen-Routing',
    routing.length === 0 ? 'rot' : vollstaendig.length === routing.length ? 'gruen' : 'gelb',
    `${vollstaendig.length}/${routing.length} vollständig`,
    routing.length === 0
      ? 'Keine § 302-Routing-Einträge hinterlegt. Datenannahmestellen der Krankenkassen müssen aus den Kassenverzeichnissen übernommen werden — sie werden nicht geraten.'
      : vollstaendig.length < routing.length
        ? 'Einzelne Einträge haben keine Datenannahmestelle oder kein Annahmeformat.'
        : null,
    routing.length === 0 ? 'extern' : vollstaendig.length < routing.length ? 'intern' : null,
  ))

  // ── 3. Organisation: IK vorhanden? ──
  const { data: org } = await supabase
    .from('organizations')
    .select('name, ik_nummer')
    .eq('id', organizationId)
    .maybeSingle()

  const ikOk = !!org?.ik_nummer && /^\d{9}$/.test(String(org.ik_nummer))
  punkte.push(punkt(
    'absender_ik',
    'Absender-IK der Organisation',
    ikOk ? 'gruen' : 'rot',
    ikOk ? String(org!.ik_nummer) : null,
    ikOk ? null : 'Ohne neunstellige IK kann kein Datensatz adressiert werden.',
    ikOk ? null : 'extern',
  ))

  // ── 4. Abrechenbare HKP-Verordnungen ──
  // organization_id MUSS mitgefiltert werden: die Readiness läuft mit einem
  // service_role-Client (RLS greift dort nicht), sonst zählt der Punkt die
  // Verordnungen aller Mandanten und meldet "grün", obwohl diese Organisation
  // keine einzige HKP-Verordnung hat.
  const { count: hkpCount } = await supabase
    .from('verordnungen')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('verordnung_type', HKP_VERORDNUNG_TYPE)
    .eq('genehmigung_status', 'genehmigt')
    .is('deleted_at', null)

  const hkp = hkpCount ?? 0
  punkte.push(punkt(
    'hkp_verordnungen',
    'Genehmigte HKP-Verordnungen (§ 37 SGB V)',
    hkp > 0 ? 'gruen' : 'gelb',
    String(hkp),
    hkp > 0
      ? null
      : 'Keine genehmigten HKP-Verordnungen. Ohne Verordnung (Muster 12) ist keine Leistung nach § 302 abrechenbar.',
    hkp > 0 ? null : 'intern',
  ))

  const zusammenfassung = {
    gruen: punkte.filter(p => p.ampel === 'gruen').length,
    gelb: punkte.filter(p => p.ampel === 'gelb').length,
    rot: punkte.filter(p => p.ampel === 'rot').length,
    gesamt: punkte.length,
  }

  const gesamt: Ampel = zusammenfassung.rot > 0 ? 'rot' : zusammenfassung.gelb > 0 ? 'gelb' : 'gruen'

  return {
    organizationId,
    abrechnungsmonat,
    gesamt,
    abrechnungsbereit: gesamt === 'gruen',
    punkte,
    zusammenfassung,
    offeneBlocker: {
      intern: punkte.filter(p => p.blocker === 'intern').map(p => p.label),
      extern: punkte.filter(p => p.blocker === 'extern').map(p => p.label),
    },
  }
}
