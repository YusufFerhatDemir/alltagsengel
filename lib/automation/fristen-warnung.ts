/**
 * Kette 2 — Frist nähert sich → aktive Warnung.
 *
 * Das Fristen-Dashboard (app/api/admin/fristen) aggregiert Qualifikationen,
 * Verordnungen, Schulungen und Dokumente, war bis 2026-08-15 aber ein reiner
 * "Admin schaut rein"-Endpunkt: kein Cron, keine Benachrichtigung. Diese
 * Datei liefert den fehlenden aktiven Auslöser — täglich per Cron
 * aufgerufen, erzeugt sie bei 30/14/7 Tagen Restlaufzeit eine
 * `ops_benachrichtigungen`-Zeile an PDL/Admin (und, wo bekannt, den
 * betroffenen Mitarbeiter).
 *
 * DUBLETTENSCHUTZ: pro (Entität, Schwelle) höchstens eine Benachrichtigung.
 * `ops_benachrichtigungen` hat kein JSONB-Feld — der Dublettenschlüssel
 * steckt deshalb sichtbar im Titel (z. B. "[F14]"), geprüft über `bezug_id`
 * + `bezug_typ` + Titel-Infix.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sammleFristen, type FristItem, type FristEntitaetTyp } from './fristen-sammler'
import { rollentraegerDerOrg } from './org-empfaenger'
import type { BenachrichtigungBezugTyp, BenachrichtigungKategorie } from '@/lib/ops/types'
import { logger } from '@/lib/logger'
const log = logger.child('fristen-warnung')

/** Tage-Schwellen, an denen gewarnt wird (absteigend, erste passende gewinnt). */
const SCHWELLEN = [30, 14, 7] as const

const BEZUG_TYP: Record<FristEntitaetTyp, BenachrichtigungBezugTyp> = {
  qualifikation: 'qualifikation',
  verordnung: 'verordnung',
  genehmigung: 'verordnung',
  schulung: 'qualifikation',
  dokument: 'dokument',
  abrechnungsfrist: 'abrechnung',
  probezeit: 'mitarbeiter',
  mitarbeitergespraech: 'mitarbeiter',
  arbeitszeit_verstoss: 'mitarbeiter',
  fem_ueberwachung: 'kunde',
}

const KATEGORIE: Record<FristEntitaetTyp, BenachrichtigungKategorie> = {
  qualifikation: 'qualifikation',
  verordnung: 'abrechnung',
  genehmigung: 'abrechnung',
  schulung: 'qualifikation',
  dokument: 'dokument',
  abrechnungsfrist: 'abrechnung',
  probezeit: 'personal',
  mitarbeitergespraech: 'personal',
  arbeitszeit_verstoss: 'personal',
  fem_ueberwachung: 'pflege',
}

function schwelleFuer(tage: number): (typeof SCHWELLEN)[number] | null {
  for (const s of SCHWELLEN) {
    if (tage === s) return s
  }
  return null
}

function markierung(schwelle: number): string {
  return `[F${schwelle}]`
}

export interface FristenWarnungErgebnis {
  geprueft: number
  gewarnt: number
  fehler: string[]
}

async function bereitsGewarnt(
  supabase: SupabaseClient,
  organizationId: string,
  item: FristItem,
  schwelle: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ops_benachrichtigungen')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('bezug_typ', BEZUG_TYP[item.entitaetTyp])
    .eq('bezug_id', item.entitaetId)
    .ilike('titel', `%${markierung(schwelle)}%`)
    .limit(1)
    .maybeSingle()

  if (error) {
    // Fail-closed für Dubletten: bei Unsicherheit lieber keine weitere
    // Benachrichtigung erzeugen als den Nutzer zuzuspammen.
    log.error('Dublettenprüfung fehlgeschlagen', { errorMessage: error.message })
    return true
  }
  return !!data
}

/**
 * Prüft alle Fristen einer Organisation und warnt bei 30/14/7 Tagen
 * Restlaufzeit. Täglicher Cron-Aufruf vorausgesetzt — bei Ausfall eines
 * Laufs wird eine übersprungene Schwelle NICHT nachgeholt (die nächste
 * Schwelle greift ohnehin), Doppelversand ist wichtiger zu vermeiden als
 * lückenlose Abdeckung jeder einzelnen Schwelle.
 */
export async function warneVorFristablauf(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<FristenWarnungErgebnis> {
  const { fristen } = await sammleFristen(supabase, organizationId)
  const fehler: string[] = []
  let gewarnt = 0
  let geprueft = 0

  const pdlIds = await rollentraegerDerOrg(supabase, organizationId, ['admin', 'superadmin'])

  for (const item of fristen) {
    const schwelle = schwelleFuer(item.tageVerbleibend)
    if (schwelle == null) continue
    geprueft++

    try {
      if (await bereitsGewarnt(supabase, organizationId, item, schwelle)) continue

      const titel = `${markierung(schwelle)} ${item.titel} läuft in ${schwelle} Tagen ab`
      const inhalt = `${item.beschreibung} — betroffen: ${item.bezug}. Fällig am ${item.faelligAm}.`

      const empfaengerIds = new Set<string>(pdlIds)
      if (item.caregiverId) {
        const { data: cg } = await supabase
          .from('caregivers')
          .select('user_id')
          .eq('id', item.caregiverId)
          .maybeSingle()
        if (cg?.user_id) empfaengerIds.add(cg.user_id)
      }

      if (empfaengerIds.size === 0) {
        fehler.push(`${item.id}: kein Empfänger ermittelbar`)
        continue
      }

      const rows = Array.from(empfaengerIds).map(empfaengerId => ({
        organization_id: organizationId,
        empfaenger_id: empfaengerId,
        titel,
        inhalt,
        typ: 'erinnerung' as const,
        kategorie: KATEGORIE[item.entitaetTyp],
        bezug_typ: BEZUG_TYP[item.entitaetTyp],
        bezug_id: item.entitaetId,
        email_gesendet: false,
        push_gesendet: false,
      }))

      const { error: insErr } = await supabase.from('ops_benachrichtigungen').insert(rows)
      if (insErr) {
        fehler.push(`${item.id}: ${insErr.message}`)
        continue
      }
      gewarnt++
    } catch (err) {
      fehler.push(`${item.id}: ${(err as Error).message}`)
    }
  }

  return { geprueft, gewarnt, fehler }
}
