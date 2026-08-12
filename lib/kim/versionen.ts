/**
 * KIM / TI-Anbindung — Formatversionsregister (Block 18)
 *
 * Die Übertragung via KIM folgt laut Roadmap der Technischen Anlage 5
 * (Version 1.2.0, ab 02/2027). Wie beim § 302-SGB-V-Gerüst (Block 17) gilt:
 * dieses Modul verwaltet WANN welche Version gilt und ob ihre Spezifikation
 * bestätigt vorliegt — es enthält KEINE Nachrichtenformat-/Segmentdetails der
 * Technischen Anlage 5. Die liegen uns nicht vor und werden nicht aus dem
 * Gedächtnis rekonstruiert. Bis die Spezifikation hinterlegt ist, bleibt der
 * Versand gesperrt (siehe lib/kim/versand.ts).
 *
 * Anders als bei § 302 SGB V (zwei Formate: EDIFACT und HKP-XML) gibt es für
 * KIM laut Roadmap nur EINEN Kanal — deshalb entfällt hier die
 * Formatunterscheidung aus sgb-v/versionen.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface KimFormatVersion {
  id: string
  bezeichnung: string
  ta_version: string
  gueltig_von: string
  gueltig_bis: string | null
  spec_bestaetigt: boolean
  spec_quelle: string | null
  hinweis: string | null
}

export type KimSperrgrund =
  | 'keine_version_hinterlegt'
  | 'keine_version_gueltig'
  | 'spec_nicht_bestaetigt'

export const KIM_SPERRGRUND_TEXT: Record<KimSperrgrund, string> = {
  keine_version_hinterlegt:
    'Für die KIM/TI-Übertragung ist keine Formatversion hinterlegt. Ohne Versionsregister findet keine Auflösung statt.',
  keine_version_gueltig:
    'Für den gewählten Stichtag gilt keine der hinterlegten Formatversionen.',
  spec_nicht_bestaetigt:
    'Die geltende Formatversion (Technische Anlage 5) ist noch nicht spec-bestätigt. Sie muss offiziell vorliegen und im Code hinterlegt sein, bevor irgendetwas über KIM versendet wird — sonst entstünden formal plausible, tatsächlich falsche Nachrichten in einem Gesundheitsnetz.',
}

export interface KimVersionAufloesung {
  ok: boolean
  version: KimFormatVersion | null
  /** Alle am Stichtag gültigen Versionen — auch unbestätigte. */
  kandidaten: KimFormatVersion[]
  sperrgrund: KimSperrgrund | null
  hinweis: string | null
}

/** Erster Tag eines Monats ("2027-02" → "2027-02-01"), gleiche Regel wie bei § 302 SGB V. */
export function monatsStichtag(monat: string): string {
  if (!/^\d{4}-\d{2}$/.test(monat)) {
    throw new Error(`Monat muss das Format JJJJ-MM haben (erhalten: "${monat}").`)
  }
  return `${monat}-01`
}

/** Gilt die Version am Stichtag? gueltig_bis = null heisst „offen". */
export function giltAm(version: KimFormatVersion, stichtag: string): boolean {
  if (version.gueltig_von > stichtag) return false
  if (version.gueltig_bis && version.gueltig_bis < stichtag) return false
  return true
}

export async function ladeFormatVersionen(
  supabase: SupabaseClient,
  organizationId: string
): Promise<KimFormatVersion[]> {
  const { data, error } = await supabase
    .from('kim_formatversionen')
    .select('id, bezeichnung, ta_version, gueltig_von, gueltig_bis, spec_bestaetigt, spec_quelle, hinweis')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('gueltig_von', { ascending: true })

  if (error) throw new Error(`KIM-Formatversionen konnten nicht geladen werden: ${error.message}`)
  return (data || []) as KimFormatVersion[]
}

/**
 * Löst die am Stichtag geltende Version auf. Bei mehreren gültigen
 * Kandidaten gewinnt die mit dem spätesten gueltig_von.
 */
export function loeseVersionAuf(
  versionen: KimFormatVersion[],
  stichtag: string
): KimVersionAufloesung {
  if (versionen.length === 0) {
    return {
      ok: false,
      version: null,
      kandidaten: [],
      sperrgrund: 'keine_version_hinterlegt',
      hinweis: KIM_SPERRGRUND_TEXT.keine_version_hinterlegt,
    }
  }

  const kandidaten = versionen
    .filter(v => giltAm(v, stichtag))
    .sort((a, b) => (a.gueltig_von < b.gueltig_von ? 1 : -1))

  if (kandidaten.length === 0) {
    return {
      ok: false,
      version: null,
      kandidaten: [],
      sperrgrund: 'keine_version_gueltig',
      hinweis: KIM_SPERRGRUND_TEXT.keine_version_gueltig,
    }
  }

  const bestaetigt = kandidaten.find(v => v.spec_bestaetigt)
  if (!bestaetigt) {
    return {
      ok: false,
      version: kandidaten[0],
      kandidaten,
      sperrgrund: 'spec_nicht_bestaetigt',
      hinweis: KIM_SPERRGRUND_TEXT.spec_nicht_bestaetigt,
    }
  }

  return { ok: true, version: bestaetigt, kandidaten, sperrgrund: null, hinweis: null }
}

export async function aktuelleVersion(
  supabase: SupabaseClient,
  organizationId: string,
  stichtag: string
): Promise<KimVersionAufloesung> {
  const versionen = await ladeFormatVersionen(supabase, organizationId)
  return loeseVersionAuf(versionen, stichtag)
}
