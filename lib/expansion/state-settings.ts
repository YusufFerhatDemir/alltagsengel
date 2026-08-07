// ═══════════════════════════════════════════════════════════════
// EXPANSION DEUTSCHLAND — Serverseitige Statusabfrage
// ═══════════════════════════════════════════════════════════════
// EINZIGE Quelle für die Frage „Was ist in Bundesland X erlaubt?".
// Kein Modul darf diese Entscheidung noch einmal selbst treffen und
// kein Modul darf ein Bundesland hart kodieren.
//
// Nutzung in API-Routen / Server Components:
//
//   const lage = await bundeslandLage(plz)
//   if (lage.kassenabrechnung) { … }
//
// Fail-safe: Jeder Fehler (Migration fehlt, Netzwerk, unbekannte PLZ)
// führt zu „Kasse aus, Rest an" — nie umgekehrt.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import {
  bundeslandFuerPlz,
  normalizeBundesland,
  normalizePlz,
  type BundeslandTreffer,
} from './plz-bundesland'
import {
  BUNDESLAND_NAMEN,
  FALLBACK_STATE,
  kassenHinweisText,
  TEXT_PLZ_UNBEKANNT,
  type BundeslandCode,
  type ExpansionStatus,
  type StateSettings,
  type StateSettingsPublic,
} from './types'

const PUBLIC_COLUMNS =
  'organization_id, bundesland, bundesland_label, status, marketing_enabled, '
  + 'registration_enabled, waitinglist_enabled, private_enabled, insurance_enabled, '
  + 'effective_date, ansprechpartner_name, ansprechpartner_email, ansprechpartner_telefon'

// ── Prozess-Cache (60 s) ────────────────────────────────────────
// Die Matrix ändert sich selten (Freischaltung eines Bundeslands ist ein
// Ereignis pro Quartal), wird aber in jeder Buchungsstrecke gelesen.
const CACHE_TTL_MS = 60 * 1000
let cache: { orgId: string; rows: StateSettingsPublic[]; ts: number } | null = null

/** Cache verwerfen — nach jeder Änderung über die Admin-API aufrufen. */
export function invalidateStateCache(): void {
  cache = null
}

/**
 * Alle 16 Bundesländer einer Organisation in der öffentlichen Sicht.
 * Leeres Array, wenn die Migration noch nicht angewendet ist.
 */
export async function alleBundeslaender(
  orgId: string = DEFAULT_ORG_ID
): Promise<StateSettingsPublic[]> {
  if (cache && cache.orgId === orgId && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.rows
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('state_settings_public')
      .select(PUBLIC_COLUMNS)
      .eq('organization_id', orgId)

    if (error || !data) return cache?.orgId === orgId ? cache.rows : []

    const rows = data as unknown as StateSettingsPublic[]
    cache = { orgId, rows, ts: Date.now() }
    return rows
  } catch {
    return cache?.orgId === orgId ? cache.rows : []
  }
}

/**
 * Einstellungen eines einzelnen Bundeslands (öffentliche Sicht).
 * Nicht gefunden / Fehler → Fallback (Kasse aus, Rest an).
 */
export async function bundeslandEinstellungen(
  bundesland: BundeslandCode,
  orgId: string = DEFAULT_ORG_ID
): Promise<StateSettingsPublic> {
  const alle = await alleBundeslaender(orgId)
  const treffer = alle.find(r => r.bundesland === bundesland)
  if (treffer) return treffer

  return {
    organization_id: orgId,
    bundesland,
    bundesland_label: BUNDESLAND_NAMEN[bundesland],
    ...FALLBACK_STATE,
  }
}

// ── Aufbereitetes Ergebnis für UI und API ───────────────────────

export interface BundeslandLage {
  /** Aufgelöstes Bundesland — null, wenn die PLZ nicht zuordenbar ist. */
  bundesland: BundeslandCode | null
  bundeslandName: string | null
  /** true, wenn die PLZ eindeutig einem Bundesland zugeordnet werden konnte. */
  eindeutig: boolean
  plz: string | null
  status: ExpansionStatus

  // Was der Nutzer tun darf
  werbung: boolean
  registrierung: boolean
  warteliste: boolean
  privatleistungen: boolean
  kassenabrechnung: boolean

  /** Anzeigetext für den ausgegrauten Kassen-Button. */
  hinweis: string
  /** Geplantes bzw. erfolgtes GO-Live-Datum (ISO-Datum) oder null. */
  goLive: string | null
  ansprechpartner: {
    name: string | null
    email: string | null
    telefon: string | null
  }
}

function baueLage(
  treffer: BundeslandTreffer,
  plz: string | null,
  einstellungen: StateSettingsPublic | null
): BundeslandLage {
  // PLZ nicht zuordenbar → alles außer Kasse offen, klarer Hinweis.
  if (!treffer.code || !einstellungen) {
    return {
      bundesland: treffer.code,
      bundeslandName: treffer.name,
      eindeutig: false,
      plz,
      status: 'VORBEREITUNG',
      werbung: true,
      registrierung: true,
      warteliste: true,
      privatleistungen: false,
      kassenabrechnung: false,
      hinweis: TEXT_PLZ_UNBEKANNT,
      goLive: null,
      ansprechpartner: { name: null, email: null, telefon: null },
    }
  }

  // Kassenabrechnung verlangt BEIDES: freigeschaltetes Land UND eindeutige PLZ.
  // Eine Grenz-PLZ ohne gepflegte Ausnahme darf nie „Kasse" auslösen.
  const kasse = einstellungen.insurance_enabled && treffer.sicher

  return {
    bundesland: treffer.code,
    bundeslandName: einstellungen.bundesland_label || treffer.name,
    eindeutig: treffer.sicher,
    plz,
    status: einstellungen.status,
    werbung: einstellungen.marketing_enabled,
    registrierung: einstellungen.registration_enabled,
    warteliste: einstellungen.waitinglist_enabled,
    privatleistungen: einstellungen.private_enabled,
    kassenabrechnung: kasse,
    hinweis: kasse
      ? kassenHinweisText('ANERKANNT')
      : (!treffer.sicher && einstellungen.insurance_enabled)
        ? TEXT_PLZ_UNBEKANNT
        : kassenHinweisText(einstellungen.status),
    goLive: einstellungen.effective_date,
    ansprechpartner: {
      name: einstellungen.ansprechpartner_name,
      email: einstellungen.ansprechpartner_email,
      telefon: einstellungen.ansprechpartner_telefon,
    },
  }
}

/**
 * Zentrale Abfrage: Was ist für diese PLZ erlaubt?
 * Ersetzt jedes `isHessenPlz(...)` in Buchungs- und Registrierungsstrecken.
 */
export async function bundeslandLage(
  plzInput: string | null | undefined,
  orgId: string = DEFAULT_ORG_ID
): Promise<BundeslandLage> {
  const treffer = bundeslandFuerPlz(plzInput)
  const plz = normalizePlz(plzInput)

  if (!treffer.code) return baueLage(treffer, plz, null)

  const einstellungen = await bundeslandEinstellungen(treffer.code, orgId)
  return baueLage(treffer, plz, einstellungen)
}

/**
 * Wie bundeslandLage, aber ausgehend von einem bereits bekannten Bundesland
 * (z. B. aus organizations.bundesland oder einem Formularfeld).
 */
export async function bundeslandLageFuerLand(
  bundeslandInput: string | null | undefined,
  orgId: string = DEFAULT_ORG_ID
): Promise<BundeslandLage> {
  const code = normalizeBundesland(bundeslandInput)
  if (!code) {
    return baueLage({ code: null, sicher: false, name: null, quelle: 'unbekannt' }, null, null)
  }
  const einstellungen = await bundeslandEinstellungen(code, orgId)
  return baueLage(
    { code, sicher: true, name: BUNDESLAND_NAMEN[code], quelle: 'ausnahme' },
    null,
    einstellungen
  )
}

/**
 * Harte Ja/Nein-Prüfung für Server-Actions und API-Routen.
 * Nutzt denselben Pfad wie die UI — keine zweite Wahrheit.
 */
export async function kassenabrechnungMoeglich(
  plzInput: string | null | undefined,
  orgId: string = DEFAULT_ORG_ID
): Promise<boolean> {
  return (await bundeslandLage(plzInput, orgId)).kassenabrechnung
}

/**
 * Ableitung der Zahlungsart aus der Lage.
 * Gibt niemals 'kasse' zurück, solange die Kassenabrechnung nicht
 * freigeschaltet und die PLZ nicht eindeutig ist.
 */
export async function zahlungsartFuerPlz(
  plzInput: string | null | undefined,
  orgId: string = DEFAULT_ORG_ID
): Promise<'kasse' | 'privat'> {
  return (await kassenabrechnungMoeglich(plzInput, orgId)) ? 'kasse' : 'privat'
}

// ── Admin-Sicht (volle Zeilen, inkl. Bescheid-Feldern) ──────────

/**
 * Volle Matrix für die Admin-Oberfläche. Nutzt den Service-Role-Key und
 * MUSS deshalb in einer Route laufen, die die Adminrolle bereits geprüft hat.
 */
export async function adminMatrix(orgId: string): Promise<StateSettings[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('state_settings')
    .select('*')
    .eq('organization_id', orgId)

  if (error || !data) return []

  const reihenfolge = Object.keys(BUNDESLAND_NAMEN)
  return (data as StateSettings[]).sort(
    (a, b) => reihenfolge.indexOf(a.bundesland) - reihenfolge.indexOf(b.bundesland)
  )
}
