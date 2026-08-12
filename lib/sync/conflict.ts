// ═══════════════════════════════════════════════════════════════
// Bidirektionale Sync-Konfliktlösung — reine Entscheidungslogik
// (Block 20). Getrennt von der DB-Anbindung (app/api/sync/route.ts),
// damit sie ohne Supabase-Mock getestet werden kann.
// ═══════════════════════════════════════════════════════════════

import type { KonfliktStrategie } from '@/lib/offline/types'

export interface KonfliktPruefung {
  serverUpdatedAt: string | null
  basisUpdatedAt: string | null | undefined
}

/**
 * Ein Konflikt liegt vor, wenn der Client eine Änderung auf einem
 * Snapshot aufbaut (`basisUpdatedAt`), der Server-Datensatz sich aber
 * inzwischen weiterentwickelt hat. Ohne `basisUpdatedAt` (Client kennt
 * seinen Ausgangszustand nicht — z. B. reine 'create'-Aktion) kann kein
 * Konflikt erkannt werden; das Update wird dann unkonditioniert
 * angewendet (bestehendes Verhalten vor Block 20).
 */
export function hatKonflikt({ serverUpdatedAt, basisUpdatedAt }: KonfliktPruefung): boolean {
  if (!basisUpdatedAt || !serverUpdatedAt) return false
  return new Date(basisUpdatedAt).getTime() !== new Date(serverUpdatedAt).getTime()
}

export interface KonfliktEntscheidung {
  /** Soll die lokale (Client-)Änderung jetzt an den Ziel-Endpunkt weitergereicht werden? */
  wendeLokaleAenderungAn: boolean
  status: 'aufgeloest' | 'offen'
  aufgeloestMit: 'lokal' | 'server' | null
}

/**
 * Setzt die konfigurierte Konfliktstrategie in eine Entscheidung um:
 * - last_write_wins: lokale Änderung gewinnt (Client hat zuletzt geschrieben)
 * - server_wins: Server-Stand bleibt unangetastet, lokale Änderung verworfen
 * - manuell: keine automatische Entscheidung — offener Konflikt für Admin-UI
 */
export function entscheideKonflikt(strategie: KonfliktStrategie): KonfliktEntscheidung {
  if (strategie === 'last_write_wins') {
    return { wendeLokaleAenderungAn: true, status: 'aufgeloest', aufgeloestMit: 'lokal' }
  }
  if (strategie === 'server_wins') {
    return { wendeLokaleAenderungAn: false, status: 'aufgeloest', aufgeloestMit: 'server' }
  }
  return { wendeLokaleAenderungAn: false, status: 'offen', aufgeloestMit: null }
}

/** Für die manuelle Auflösung im Admin-UI: 'lokal' wendet die Änderung jetzt nachträglich an. */
export function entscheideManuelleAufloesung(resolution: 'lokal' | 'server'): KonfliktEntscheidung {
  return {
    wendeLokaleAenderungAn: resolution === 'lokal',
    status: 'aufgeloest',
    aufgeloestMit: resolution,
  }
}
