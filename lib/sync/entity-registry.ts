// ═══════════════════════════════════════════════════════════════
// Sync-Entity-Registry — Block 20 (Offline-First & Native App)
// ═══════════════════════════════════════════════════════════════
// Kanonische Zuordnung: Offline-Entity-Typ → DB-Tabelle (für den
// Konflikt-Check per updated_at) + REST-Endpunkte (für die serverseitige
// Delegation in app/api/sync/route.ts). Der Sync-Server dupliziert KEINE
// Fachlogik — er ruft die bestehenden Modul-Endpunkte per internem Fetch
// auf (gleicher Origin, Cookie-Weiterleitung) und nutzt exakt deren
// Auth-Guards, Validierung und lib-Funktionen (lib/pflege/, lib/vitals/,
// lib/medikamente/, lib/wunden/, lib/signaturen/).
//
// WICHTIG: Update-Endpunkte in diesem Repo nutzen durchgängig PATCH,
// nicht PUT (verifiziert per grep über alle app/api/**/[id]/route.ts der
// betroffenen Module am 12.08.2026). Die Methode steht daher explizit
// in der Registry statt pauschal aus `aktion` abgeleitet zu werden.
// ═══════════════════════════════════════════════════════════════

import type { OfflineEntityTyp } from '@/lib/offline/types'

export type SyncHttpMethode = 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface SyncEntityRegistryEintrag {
  /** DB-Tabelle für den Konflikt-Check (updated_at-Vergleich). */
  tabelle: string
  /** Spalte mit dem Änderungszeitstempel. */
  updatedAtSpalte: string
  /** Endpunkt für 'create' (POST) — null, wenn über die Offline-Queue nicht unterstützt. */
  createEndpoint: string | null
  /** Endpunkt-Vorlage für 'update' mit `{id}`-Platzhalter — null, wenn nicht unterstützt. */
  updateEndpointVorlage: string | null
  updateMethode: SyncHttpMethode
  /** Endpunkt-Vorlage für 'delete' mit `{id}`-Platzhalter — null, wenn nicht unterstützt. */
  deleteEndpointVorlage: string | null
  deleteMethode: SyncHttpMethode
  /** Kurzbeschreibung für Diagnose/Report-Zwecke. */
  hinweis?: string
}

export const SYNC_ENTITY_REGISTRY: Record<OfflineEntityTyp, SyncEntityRegistryEintrag> = {
  leistungsnachweis: {
    tabelle: 'service_records',
    updatedAtSpalte: 'updated_at',
    createEndpoint: null,
    updateEndpointVorlage: '/api/leistungsnachweis/crud',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
    hinweis: 'Leistungsnachweise entstehen aus Einsätzen; Engel-Schreibzugriff nur für Statuswechsel (crud-Endpunkt, ID im Body statt im Pfad).',
  },
  pflegebericht: {
    tabelle: 'pflege_verlauf',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/pflege/verlauf',
    updateEndpointVorlage: '/api/pflege/verlauf/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
  },
  signatur: {
    tabelle: 'signaturen',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/admin/signaturen',
    updateEndpointVorlage: '/api/admin/signaturen/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
  },
  medikament_eingabe: {
    tabelle: 'medikament_eingaben',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/medikamente/eingaben',
    updateEndpointVorlage: null,
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
    hinweis: 'Eingaben sind append-only (kein [id]-Update-Endpunkt vorhanden).',
  },
  vitalwerte: {
    tabelle: 'vital_signs',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/vitals',
    updateEndpointVorlage: '/api/vitals/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: '/api/vitals/{id}',
    deleteMethode: 'DELETE',
  },
  wunddoku: {
    tabelle: 'wounds',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/wounds',
    updateEndpointVorlage: '/api/wounds/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
    hinweis: 'POST/PATCH aktuell requireWundenAdmin (admin-only) — Engel-Offline-Erfassung syncet erst nach Freischaltung des Engel-Schreibzugriffs erfolgreich; Sync-Server erzwingt hier bewusst nichts zusätzlich (Auth entscheidet der Ziel-Endpunkt selbst).',
  },
  pflege_anamnese: {
    tabelle: 'pflege_anamnesen',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/pflege/anamnesen',
    updateEndpointVorlage: '/api/pflege/anamnesen/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
  },
  pflege_aufnahme: {
    tabelle: 'pflege_aufnahmen',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/pflege/aufnahmen',
    updateEndpointVorlage: '/api/pflege/aufnahmen/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
  },
  pflege_diagnose: {
    tabelle: 'pflege_diagnosen',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/pflege/diagnosen',
    updateEndpointVorlage: '/api/pflege/diagnosen/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: '/api/pflege/diagnosen/{id}',
    deleteMethode: 'DELETE',
  },
  pflege_massnahme: {
    tabelle: 'pflege_massnahmen',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/pflege/massnahmen',
    updateEndpointVorlage: '/api/pflege/massnahmen/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
  },
  pflege_massnahmenplan: {
    tabelle: 'pflege_massnahmenplaene',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/pflege/massnahmenplaene',
    updateEndpointVorlage: '/api/pflege/massnahmenplaene/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: null,
    deleteMethode: 'DELETE',
  },
  pflege_risiko: {
    tabelle: 'pflege_risiken',
    updatedAtSpalte: 'updated_at',
    createEndpoint: '/api/pflege/risiken',
    updateEndpointVorlage: '/api/pflege/risiken/{id}',
    updateMethode: 'PATCH',
    deleteEndpointVorlage: '/api/pflege/risiken/{id}',
    deleteMethode: 'DELETE',
  },
}

/** Löst Endpunkt + HTTP-Methode für eine Queue-Aktion auf. `null`, wenn nicht unterstützt. */
export function resolveSyncRoute(
  eintrag: SyncEntityRegistryEintrag,
  aktion: 'create' | 'update' | 'delete',
  id?: string | null,
): { endpoint: string; methode: SyncHttpMethode } | null {
  if (aktion === 'create') {
    if (!eintrag.createEndpoint) return null
    return { endpoint: eintrag.createEndpoint, methode: 'POST' }
  }
  if (aktion === 'update') {
    if (!eintrag.updateEndpointVorlage) return null
    if (eintrag.updateEndpointVorlage.includes('{id}')) {
      if (!id) return null
      return { endpoint: eintrag.updateEndpointVorlage.replace('{id}', id), methode: eintrag.updateMethode }
    }
    return { endpoint: eintrag.updateEndpointVorlage, methode: eintrag.updateMethode }
  }
  if (aktion === 'delete') {
    if (!eintrag.deleteEndpointVorlage) return null
    if (eintrag.deleteEndpointVorlage.includes('{id}')) {
      if (!id) return null
      return { endpoint: eintrag.deleteEndpointVorlage.replace('{id}', id), methode: eintrag.deleteMethode }
    }
    return { endpoint: eintrag.deleteEndpointVorlage, methode: eintrag.deleteMethode }
  }
  return null
}

/** Extrahiert die Entity-ID aus dem Queue-Item-Payload (für Update/Delete/Konflikt-Check). */
export function extrahiereEntityId(payload: Record<string, unknown>): string | null {
  const id = payload.id
  return typeof id === 'string' && id.length > 0 ? id : null
}
