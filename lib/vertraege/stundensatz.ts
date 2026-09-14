// ═══════════════════════════════════════════════════════════════════
// Der Stundensatz für den Vertrag — gelesen, nie geraten
// ═══════════════════════════════════════════════════════════════════
//
// Ein Vertrag nennt eine Vergütung, und diese Zahl ist bindend. Sie darf
// deshalb nicht aus dem Code kommen: Preishoheit liegt bei den Tabellen,
// die lib/pricing/quelle.ts als Besitzer ausweist. Hier wird nur gelesen.
//
// ── WELCHE ZAHL ZU WELCHEM VERTRAG ────────────────────────────────
// `dienstleistungsvertrag` ist der Privatvertrag → budget_type 'private'.
// `betreuungsvertrag` ist der Kassenweg → budget_type 'entlastung'.
//
// Die beiden Saetze sind live verschieden (40,00 € privat gegen 35,00 €
// Kasse, Stand 14.09.2026) und beide richtig — es sind zwei
// Rechtsgrundlagen, kein Widerspruch. Wer den falschen in den Vertrag
// schreibt, vereinbart einen Preis, den die Abrechnung nicht kennt.
//
// ── FAIL-CLOSED ───────────────────────────────────────────────────
// Kein Treffer, kein aktiver Satz, kein gueltiger Zeitraum → Fehler, kein
// Ersatzwert. Ein Vertrag mit geratener Vergütung waere bindend.
// ═══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import type { VorlagenTyp } from './vorlagen'

/** Budget-Topf je Vertragsart. */
export const TOPF_JE_VERTRAGSART: Record<VorlagenTyp, string> = {
  dienstleistungsvertrag: 'private',
  betreuungsvertrag: 'entlastung',
}

/** Die Leistungsart, auf die sich ein Rahmenvertrag bezieht. */
export const VERTRAGS_LEISTUNGSART = 'alltagsbegleitung'

export interface Stundensatz {
  euro: number
  /** Klartext-Herkunft — landet als Fussnote im Vertrag. */
  quelle: string
}

/**
 * Liest den gültigen Stundensatz für diese Vertragsart.
 *
 * @throws UserFacingError, wenn kein eindeutiger, aktiver Satz vorliegt.
 */
export async function vertragsStundensatz(
  supabase: SupabaseClient,
  params: { vertragstyp: VorlagenTyp; organizationId: string; stichtag?: string },
): Promise<Stundensatz> {
  const topf = TOPF_JE_VERTRAGSART[params.vertragstyp]
  const stichtag = params.stichtag ?? new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('service_pricing')
    .select('hourly_rate, description, valid_from, valid_until, is_active')
    .eq('organization_id', params.organizationId)
    .eq('service_type', VERTRAGS_LEISTUNGSART)
    .eq('budget_type', topf)
    .eq('is_active', true)
    .lte('valid_from', stichtag)

  if (error) {
    throw new UserFacingError(
      'Der Stundensatz konnte nicht gelesen werden; ohne ihn wird kein Vertrag erzeugt.',
      503,
    )
  }

  // valid_until ist offen (NULL) oder muss in der Zukunft liegen. Das
  // laesst sich in PostgREST nicht in einem Filter ausdruecken, ohne .or()
  // zu benutzen — und .or() nimmt hier keine Nutzereingabe entgegen, aber
  // die Auswertung in TypeScript ist ohnehin klarer.
  const gueltig = (data ?? []).filter(
    r => r.valid_until == null || String(r.valid_until) >= stichtag,
  )

  if (gueltig.length === 0) {
    throw new UserFacingError(
      `Für „${params.vertragstyp}" (${VERTRAGS_LEISTUNGSART}, Topf „${topf}") ist zum `
      + `${stichtag} kein aktiver Stundensatz hinterlegt. Es wurde KEIN Vertrag erzeugt — `
      + 'eine geratene Vergütung wäre bindend. Der Satz wird in service_pricing gepflegt.',
      422,
    )
  }

  // Mehrere gleich gültige Sätze sind kein Fall für eine Auswahl per
  // Zufall: welcher gilt, entscheidet der Betrieb, nicht der Generator.
  const saetze = new Set(gueltig.map(r => Number(r.hourly_rate)))
  if (saetze.size > 1) {
    throw new UserFacingError(
      `Für „${params.vertragstyp}" sind zum ${stichtag} mehrere verschiedene Stundensätze `
      + `aktiv (${[...saetze].map(s => s.toFixed(2)).join(', ')} €). Es wurde KEIN Vertrag `
      + 'erzeugt. Bitte in service_pricing genau einen gültigen Satz führen.',
      409,
    )
  }

  const euro = Number(gueltig[0].hourly_rate)
  if (!Number.isFinite(euro) || euro <= 0) {
    throw new UserFacingError(
      `Der hinterlegte Stundensatz ist kein verwendbarer Betrag (${String(gueltig[0].hourly_rate)}). `
      + 'Es wurde KEIN Vertrag erzeugt.',
      422,
    )
  }

  return {
    euro,
    quelle: `service_pricing — ${gueltig[0].description ?? `${VERTRAGS_LEISTUNGSART}/${topf}`}, `
      + `gültig ab ${gueltig[0].valid_from}, gelesen am ${stichtag}`,
  }
}
