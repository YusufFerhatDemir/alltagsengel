// ═══════════════════════════════════════════════════════════════
// Bidirektionale Sync-Konfliktlösung — reine Entscheidungslogik
// (Block 20). Getrennt von der DB-Anbindung (app/api/sync/route.ts),
// damit sie ohne Supabase-Mock getestet werden kann.
// ═══════════════════════════════════════════════════════════════

import type { KonfliktStrategie } from '@/lib/offline/types'

export interface KonfliktPruefung {
  serverUpdatedAt: string | null
  basisUpdatedAt: string | null | undefined
  /**
   * Welche Aenderung der Client schickt. Nur fuer 'update' ist ein
   * fehlender Basis-Snapshot ein Konflikt — siehe hatKonflikt().
   * Fehlt das Feld, gilt das alte, mildere Verhalten.
   */
  aktion?: 'create' | 'update' | 'delete'
}

/**
 * Ein Konflikt liegt vor, wenn der Client eine Änderung auf einem
 * Snapshot aufbaut (`basisUpdatedAt`), der Server-Datensatz sich aber
 * inzwischen weiterentwickelt hat.
 *
 * Durchgehend fail-closed — jeder Fall, in dem sich der Ausgangszustand
 * NICHT bestaetigen laesst, gilt als Konflikt:
 *
 *  · `basisUpdatedAt` fehlt und `aktion` ist 'update' — die Offline-
 *    Aenderung nennt keinen Ausgangszustand, ist aber per Definition
 *    alt. Sie darf nicht ungeprueft gewinnen.
 *  · `basisUpdatedAt` liegt vor, der Server-Stand fehlt oder ist nicht
 *    als Datum lesbar.
 *  · beide lesbar, aber verschieden.
 *
 * Andernfalls entschiede ein fehlender Zeitstempel zugunsten der
 * lokalen Aenderung — und genau dann sind Server-Daten still weg.
 */
export function hatKonflikt({ serverUpdatedAt, basisUpdatedAt, aktion }: KonfliktPruefung): boolean {
  // ── Kein Basis-Snapshot ───────────────────────────────────────────
  // Bei einer 'update'-Aenderung ist das KEIN harmloser Fall, sondern
  // der gefaehrlichste: eine Offline-Bearbeitung ist per Definition
  // alt, und ohne Snapshot laesst sich nicht sagen, worauf sie
  // aufsetzt. Bisher gewann sie hier kommentarlos und ueberschrieb
  // eine womoeglich neuere Serverfassung — die Konfliktstrategie
  // ('server_wins', 'manuell') und die Konfliktansicht sahen davon
  // nie etwas.
  //
  // Die Gegenprobe, warum das kein theoretischer Fall war: der einzige
  // Aufrufer (app/api/sync/route.ts) ruft hatKonflikt() ausschliesslich
  // fuer 'update' auf. Der frueher hier genannte „create-Fall" konnte
  // diese Zeile also gar nicht erreichen; was sie erreichte, war
  // ausnahmslos ein Update ohne Snapshot.
  //
  // Ohne 'aktion' bleibt es beim alten, milderen Verhalten — ein
  // Aufrufer, der die Aktion nicht kennt, soll nicht ploetzlich
  // Konflikte melden.
  if (!basisUpdatedAt) return aktion === 'update'

  // Ab hier behauptet der Client, auf einem bestimmten Stand aufzusetzen.
  // Laesst sich das NICHT bestaetigen, ist das ein Konflikt und kein
  // Freifahrtschein: bisher gewann bei fehlendem oder unlesbarem
  // Server-Zeitstempel die lokale Aenderung kommentarlos und ueberschrieb
  // damit potenziell neuere Server-Daten.
  const basis = new Date(basisUpdatedAt).getTime()
  const server = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : NaN
  if (Number.isNaN(basis) || Number.isNaN(server)) return true

  return basis !== server
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
