/**
 * § 302 SGB V — Versionsengine (Block 17)
 *
 * Die Abrechnung nach § 302 Abs. 2 SGB V wechselt zu festen Terminen die
 * Formatversion. Anders als bei § 105 SGB XI gibt es dabei ZWEI Kanäle:
 *
 *   edifact_slga_slla  Technische Anlage 1 (SLGA/SLLA) — Version 21 aktuell,
 *                      Version 22 ab 02/2027
 *   xml_hkp            HKP-XML-Anlage Version 1.3.0 ab 02/2027
 *
 * Dieses Modul löst zu einem Abrechnungsmonat die geltende Version auf — und
 * verweigert die Auskunft, wenn keine gültige, spec-bestätigte Version
 * vorliegt. Es enthält KEINE Segment- oder Feldbeschreibungen: die stehen in
 * der offiziellen Technischen Anlage und werden erst hinterlegt, wenn sie
 * vorliegt. Bis dahin ist der Kanal geschlossen (fail-closed).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type SgbVFormat = 'edifact_slga_slla' | 'xml_hkp'

export const SGB_V_FORMAT_LABELS: Record<SgbVFormat, string> = {
  edifact_slga_slla: 'EDIFACT (SLGA/SLLA)',
  xml_hkp: 'HKP-XML',
}

export interface SgbVFormatVersion {
  id: string
  bezeichnung: string
  format: SgbVFormat
  ta_version: string
  gueltig_von: string
  gueltig_bis: string | null
  spec_bestaetigt: boolean
  spec_quelle: string | null
  hinweis: string | null
}

/**
 * Grund, warum kein Export möglich ist. Bewusst als Code + Klartext, damit die
 * Oberfläche unterscheiden kann zwischen „noch nichts konfiguriert" und
 * „konfiguriert, aber Spezifikation fehlt".
 */
export type SgbVSperrgrund =
  | 'keine_version_hinterlegt'
  | 'keine_version_gueltig'
  | 'spec_nicht_bestaetigt'

export const SGB_V_SPERRGRUND_TEXT: Record<SgbVSperrgrund, string> = {
  keine_version_hinterlegt:
    'Für § 302 SGB V ist keine Formatversion hinterlegt. Ohne Versionsregister kann kein Datensatz erzeugt werden.',
  keine_version_gueltig:
    'Für den gewählten Abrechnungsmonat gilt keine der hinterlegten Formatversionen.',
  spec_nicht_bestaetigt:
    'Die geltende Formatversion ist noch nicht spec-bestätigt. Die offizielle Technische Anlage zur § 302-Vereinbarung muss vorliegen und im Code hinterlegt sein, bevor Datensätze erzeugt werden dürfen — sonst entstehen formal plausible, fachlich falsche Abrechnungen.',
}

export interface VersionAufloesung {
  ok: boolean
  version: SgbVFormatVersion | null
  /** Alle für den Monat gültigen Versionen — auch die unbestätigten. */
  kandidaten: SgbVFormatVersion[]
  sperrgrund: SgbVSperrgrund | null
  hinweis: string | null
}

/** Erster Tag des Abrechnungsmonats ("2026-08" → "2026-08-01"). */
export function monatsStichtag(abrechnungsmonat: string): string {
  if (!/^\d{4}-\d{2}$/.test(abrechnungsmonat)) {
    throw new Error(`Abrechnungsmonat muss das Format JJJJ-MM haben (erhalten: "${abrechnungsmonat}").`)
  }
  return `${abrechnungsmonat}-01`
}

/** Gilt die Version am Stichtag? gueltig_bis = null heisst „offen". */
export function giltAm(version: SgbVFormatVersion, stichtag: string): boolean {
  if (version.gueltig_von > stichtag) return false
  if (version.gueltig_bis && version.gueltig_bis < stichtag) return false
  return true
}

export async function ladeFormatVersionen(
  supabase: SupabaseClient,
  organizationId: string
): Promise<SgbVFormatVersion[]> {
  const { data, error } = await supabase
    .from('sgb_v_formatversionen')
    .select('id, bezeichnung, format, ta_version, gueltig_von, gueltig_bis, spec_bestaetigt, spec_quelle, hinweis')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('gueltig_von', { ascending: true })

  if (error) {
    throw new Error(`Formatversionen konnten nicht geladen werden: ${error.message}`)
  }
  return (data || []) as SgbVFormatVersion[]
}

/**
 * Löst die für einen Abrechnungsmonat geltende Version auf.
 *
 * Bei mehreren gültigen Kandidaten desselben Formats gewinnt die mit dem
 * spätesten gueltig_von — so greift beim Versionswechsel automatisch die neue
 * Anlage, ohne dass die alte gelöscht werden muss.
 */
export function loeseVersionAuf(
  versionen: SgbVFormatVersion[],
  abrechnungsmonat: string,
  format: SgbVFormat
): VersionAufloesung {
  const stichtag = monatsStichtag(abrechnungsmonat)
  const desFormats = versionen.filter(v => v.format === format)

  if (desFormats.length === 0) {
    return {
      ok: false,
      version: null,
      kandidaten: [],
      sperrgrund: 'keine_version_hinterlegt',
      hinweis: SGB_V_SPERRGRUND_TEXT.keine_version_hinterlegt,
    }
  }

  const kandidaten = desFormats
    .filter(v => giltAm(v, stichtag))
    .sort((a, b) => (a.gueltig_von < b.gueltig_von ? 1 : -1))

  if (kandidaten.length === 0) {
    return {
      ok: false,
      version: null,
      kandidaten: [],
      sperrgrund: 'keine_version_gueltig',
      hinweis: SGB_V_SPERRGRUND_TEXT.keine_version_gueltig,
    }
  }

  const bestaetigt = kandidaten.find(v => v.spec_bestaetigt)
  if (!bestaetigt) {
    return {
      ok: false,
      version: kandidaten[0],
      kandidaten,
      sperrgrund: 'spec_nicht_bestaetigt',
      hinweis: SGB_V_SPERRGRUND_TEXT.spec_nicht_bestaetigt,
    }
  }

  return { ok: true, version: bestaetigt, kandidaten, sperrgrund: null, hinweis: null }
}

export async function aktuelleVersion(
  supabase: SupabaseClient,
  organizationId: string,
  abrechnungsmonat: string,
  format: SgbVFormat
): Promise<VersionAufloesung> {
  const versionen = await ladeFormatVersionen(supabase, organizationId)
  return loeseVersionAuf(versionen, abrechnungsmonat, format)
}
