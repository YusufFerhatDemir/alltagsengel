import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE } from '../constants/config'
import { supabase } from './supabase'

// ═══════════════════════════════════════════════════════════
// OFFLINE-QUEUE — einfache lokale Warteschlange für die drei
// Einsatz-Flows (Leistungsnachweis-Foto, Unterschrift, Geo-Check-in/out).
// Kein generisches Sync-Framework: fixe Liste bekannter Routen,
// AsyncStorage als Speicher, Replay bei App-Vordergrund/Fokus.
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = '@alltagsengel/offline-queue'
const MAX_ATTEMPTS = 3

export type QueueEntityType = 'leistungsnachweis_upload' | 'service_signature' | 'geo_event'

export interface QueuedAction {
  id: string
  entity_type: QueueEntityType
  operation: 'insert'
  payload: Record<string, unknown>
  client_created_at: string
  status: 'pending' | 'failed'
  attempts: number
  last_error?: string
}

// Route je entity_type — muss mit den dedizierten API-Routen übereinstimmen.
const ROUTE_BY_ENTITY: Record<QueueEntityType, string> = {
  leistungsnachweis_upload: '/api/native/leistungsnachweis-upload',
  service_signature: '/api/native/signatures',
  geo_event: '/api/native/geo-events',
}

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as QueuedAction[]) : []
  } catch {
    return []
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

/** Fügt eine Aktion zur lokalen Warteschlange hinzu (wird bei fehlgeschlagenem fetch aufgerufen). */
export async function enqueueAction(
  entityType: QueueEntityType,
  payload: Record<string, unknown>
): Promise<QueuedAction> {
  const queue = await readQueue()
  const action: QueuedAction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    entity_type: entityType,
    operation: 'insert',
    payload,
    client_created_at: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  }
  queue.push(action)
  await writeQueue(queue)
  return action
}

export async function getQueue(): Promise<QueuedAction[]> {
  return readQueue()
}

export async function getPendingCount(): Promise<number> {
  const queue = await readQueue()
  return queue.filter(a => a.status === 'pending').length
}

export async function getFailedCount(): Promise<number> {
  const queue = await readQueue()
  return queue.filter(a => a.status === 'failed').length
}

async function replayOne(action: QueuedAction): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return false

  const route = ROUTE_BY_ENTITY[action.entity_type]
  try {
    const res = await fetch(`${API_BASE}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(action.payload),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Spielt alle offenen Warteschlangen-Einträge gegen die jeweiligen API-Routen
 * ab. Erfolgreiche Einträge werden entfernt, nach MAX_ATTEMPTS Fehlversuchen
 * wird der Eintrag als 'failed' markiert (bleibt sichtbar, kein Retry mehr).
 */
export async function syncPendingActions(): Promise<{ synced: number; failed: number; remaining: number }> {
  let queue = await readQueue()
  const pending = queue.filter(a => a.status === 'pending')
  if (pending.length === 0) {
    return { synced: 0, failed: queue.filter(a => a.status === 'failed').length, remaining: 0 }
  }

  let synced = 0

  for (const action of pending) {
    const ok = await replayOne(action)
    if (ok) {
      synced += 1
      queue = queue.filter(a => a.id !== action.id)
    } else {
      queue = queue.map(a =>
        a.id === action.id
          ? {
              ...a,
              attempts: a.attempts + 1,
              status: a.attempts + 1 >= MAX_ATTEMPTS ? ('failed' as const) : ('pending' as const),
              last_error: 'Sync fehlgeschlagen',
            }
          : a
      )
    }
  }

  await writeQueue(queue)
  return {
    synced,
    failed: queue.filter(a => a.status === 'failed').length,
    remaining: queue.filter(a => a.status === 'pending').length,
  }
}

/** Entfernt einen einzelnen (z. B. dauerhaft fehlgeschlagenen) Eintrag manuell. */
export async function removeAction(id: string): Promise<void> {
  const queue = await readQueue()
  await writeQueue(queue.filter(a => a.id !== id))
}
