import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { validiereQueueItem, DEFAULT_OFFLINE_CONFIG } from '@/lib/offline/types'
import type { OfflineQueueItem, KonfliktStrategie } from '@/lib/offline/types'
import { SYNC_ENTITY_REGISTRY, resolveSyncRoute, extrahiereEntityId, hatUngueltigeEntityId } from '@/lib/sync/entity-registry'
import { hatKonflikt, entscheideKonflikt } from '@/lib/sync/conflict'
import { schreibeSyncAudit, schreibeSyncKonflikt, warBereitsErfolgreich } from '@/lib/sync/audit'
import { wendeAenderungAn } from '@/lib/sync/apply'
import { benachrichtigeKonflikt, benachrichtigeSyncFehler } from '@/lib/sync/notify'
import type { SyncBatchAntwort, SyncItemErgebnis } from '@/lib/sync/types'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════
// POST /api/sync
// ═══════════════════════════════════════════════════════════════
// Nimmt einen Batch von OfflineQueueItems entgegen (aus
// lib/offline/offline-queue.ts) und verarbeitet sie serverseitig:
//
//   1. Idempotenz  — bereits erfolgreich synchronisierte
//      idempotency_keys werden übersprungen statt erneut ausgeführt
//      (sync_audit_log als Nachweis).
//   2. Konflikt-Erkennung — bei 'update'-Aktionen mit einem
//      `payload.basis_updated_at`-Snapshot wird der aktuelle Server-
//      Stand (updated_at der Ziel-Tabelle) verglichen; weicht er ab,
//      greift die Konfliktstrategie (last_write_wins/server_wins/
//      manuell — Body-Feld `konflikt_strategie`, Default last_write_wins).
//   3. Ausführung — die fachliche Logik wird NICHT dupliziert: der
//      Sync-Server ruft die bestehenden Modul-Endpunkte
//      (app/api/pflege/**, app/api/vitals/**, app/api/medikamente/**,
//      app/api/wounds/**, app/api/admin/signaturen/**) per internem
//      Fetch auf demselben Origin auf, inkl. Weiterleitung des
//      Cookie-Headers — der Ziel-Endpunkt entscheidet über Auth,
//      Validierung und RLS exakt wie bei einem direkten Aufruf.
//
// Body: { items: OfflineQueueItem[]; konflikt_strategie?: KonfliktStrategie }
// ═══════════════════════════════════════════════════════════════

const MAX_BATCH_SIZE = 50

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireOpsUser()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const items: unknown = body?.items
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items (nicht-leeres Array) ist ein Pflichtfeld.' }, { status: 400 })
    }
    if (items.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Batch zu groß (max. ${MAX_BATCH_SIZE} Einträge pro Sync-Aufruf).` }, { status: 400 })
    }

    const konfliktStrategie: KonfliktStrategie =
      body?.konflikt_strategie && ['last_write_wins', 'server_wins', 'manuell'].includes(body.konflikt_strategie)
        ? body.konflikt_strategie
        : DEFAULT_OFFLINE_CONFIG.konflikt_strategie

    const admin = createAdminClient()
    const origin = new URL(request.url).origin
    const cookieHeader = request.headers.get('cookie') ?? ''

    const ergebnisse: SyncItemErgebnis[] = []

    for (const roh of items as unknown[]) {
      const item = roh as Partial<OfflineQueueItem>
      const queueItemId = typeof item.id === 'string' ? item.id : 'unbekannt'
      const idempotencyKey = typeof item.idempotency_key === 'string' ? item.idempotency_key : ''

      try {
        validiereQueueItem(item)
      } catch (err) {
        ergebnisse.push({
          queue_item_id: queueItemId,
          idempotency_key: idempotencyKey,
          entity_typ: (item.entity_typ as OfflineQueueItem['entity_typ']) ?? 'leistungsnachweis',
          status: 'error',
          message: (err as Error).message,
        })
        continue
      }

      const vollstaendig = item as OfflineQueueItem

      // Ein Gerät darf nur seine eigene Queue synchronisieren.
      if (vollstaendig.user_id !== auth.userId || vollstaendig.organization_id !== auth.organizationId) {
        ergebnisse.push({
          queue_item_id: queueItemId,
          idempotency_key: idempotencyKey,
          entity_typ: vollstaendig.entity_typ,
          status: 'error',
          message: 'Queue-Item gehört nicht zum angemeldeten Nutzer/Organisation.',
        })
        continue
      }

      try {
        const bereitsErfolgreich = await warBereitsErfolgreich(admin, auth.organizationId, idempotencyKey)
        if (bereitsErfolgreich) {
          ergebnisse.push({
            queue_item_id: queueItemId,
            idempotency_key: idempotencyKey,
            entity_typ: vollstaendig.entity_typ,
            status: 'skipped_idempotent',
            message: 'Bereits erfolgreich synchronisiert.',
          })
          continue
        }

        await schreibeSyncAudit(admin, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          queueItemId,
          idempotencyKey,
          entityTyp: vollstaendig.entity_typ,
          aktion: 'sync_start',
          details: { endpoint: vollstaendig.endpoint, aktion: vollstaendig.aktion },
        })

        const registryEintrag = SYNC_ENTITY_REGISTRY[vollstaendig.entity_typ]

        // Eine mitgeschickte, aber unbrauchbare id ist ein Fehler und kein
        // "keine id": sonst laeuft das Item als konfliktfrei durch — bei
        // Entity-Typen, deren Update-Endpunkt die id im Body statt im Pfad
        // erwartet (leistungsnachweis), wuerde die Aenderung sogar ohne
        // jede Konfliktpruefung angewendet.
        if (hatUngueltigeEntityId(vollstaendig.payload)) {
          ergebnisse.push({
            queue_item_id: queueItemId,
            idempotency_key: idempotencyKey,
            entity_typ: vollstaendig.entity_typ,
            status: 'error',
            message: 'payload.id ist keine gültige UUID.',
          })
          continue
        }

        const entityId = extrahiereEntityId(vollstaendig.payload)

        // ── Konflikt-Erkennung (nur bei 'update' mit bekannter ID) ──
        if (vollstaendig.aktion === 'update' && entityId) {
          const { data: aktuelleZeile } = await admin
            .from(registryEintrag.tabelle)
            .select(`id, ${registryEintrag.updatedAtSpalte}`)
            .eq('id', entityId)
            .eq('organization_id', auth.organizationId)
            .maybeSingle()

          const serverUpdatedAt = (aktuelleZeile as Record<string, unknown> | null)?.[registryEintrag.updatedAtSpalte] as string | undefined
          const basisUpdatedAt = vollstaendig.payload.basis_updated_at as string | undefined

          if (hatKonflikt({ serverUpdatedAt: serverUpdatedAt ?? null, basisUpdatedAt })) {
            const entscheidung = entscheideKonflikt(konfliktStrategie)

            const konfliktRow = await schreibeSyncKonflikt(admin, {
              organizationId: auth.organizationId,
              userId: auth.userId,
              queueItemId,
              idempotencyKey,
              entityTyp: vollstaendig.entity_typ,
              entityId,
              lokaleDaten: vollstaendig.payload,
              serverDaten: (aktuelleZeile as Record<string, unknown> | null) ?? null,
              strategie: konfliktStrategie,
              status: entscheidung.status,
              aufgeloestMit: entscheidung.aufgeloestMit,
            })

            await schreibeSyncAudit(admin, {
              organizationId: auth.organizationId,
              userId: auth.userId,
              queueItemId,
              idempotencyKey,
              entityTyp: vollstaendig.entity_typ,
              aktion: 'conflict_detected',
              details: { strategie: konfliktStrategie, entity_id: entityId },
            })

            if (entscheidung.status === 'aufgeloest') {
              await schreibeSyncAudit(admin, {
                organizationId: auth.organizationId,
                userId: auth.userId,
                queueItemId,
                idempotencyKey,
                entityTyp: vollstaendig.entity_typ,
                aktion: 'conflict_resolved',
                details: { aufgeloest_mit: entscheidung.aufgeloestMit },
              })
            } else {
              void benachrichtigeKonflikt(auth.userId, vollstaendig.entity_typ)
            }

            // Ohne persistierten Konflikt gibt es keinen Weg zurueck: die
            // lokale Aenderung wuerde verworfen, ohne dass irgendwo steht,
            // was sie enthielt — im Admin-UI taucht nichts auf, und der
            // Client meldet dem Nutzer "wartet auf Klaerung". Deshalb hier
            // als Fehler melden statt die Daten fallen zu lassen; das Item
            // bleibt in der Queue.
            if (!entscheidung.wendeLokaleAenderungAn && !konfliktRow) {
              ergebnisse.push({
                queue_item_id: queueItemId,
                idempotency_key: idempotencyKey,
                entity_typ: vollstaendig.entity_typ,
                status: 'error',
                message: 'Konflikt erkannt, konnte aber nicht gespeichert werden — lokale Änderung bleibt in der Queue.',
              })
              continue
            }

            if (!entscheidung.wendeLokaleAenderungAn) {
              ergebnisse.push({
                queue_item_id: queueItemId,
                idempotency_key: idempotencyKey,
                entity_typ: vollstaendig.entity_typ,
                status: entscheidung.status === 'offen' ? 'conflict_pending' : 'conflict_resolved',
                message:
                  entscheidung.status === 'offen'
                    ? 'Konflikt erkannt — wartet auf manuelle Auflösung im Admin-UI.'
                    : 'Konflikt erkannt — Server-Stand behalten (server_wins), lokale Änderung verworfen.',
                konflikt_id: konfliktRow?.id,
              })
              continue
            }
            // last_write_wins: fällt durch und wendet die lokale Änderung unten an.
          }
        }

        // ── Ausführung: Delegation an den bestehenden Modul-Endpunkt ──
        const route = resolveSyncRoute(registryEintrag, vollstaendig.aktion, entityId)
        if (!route) {
          ergebnisse.push({
            queue_item_id: queueItemId,
            idempotency_key: idempotencyKey,
            entity_typ: vollstaendig.entity_typ,
            status: 'unsupported',
            message: registryEintrag.hinweis
              ?? `Aktion '${vollstaendig.aktion}' wird für '${vollstaendig.entity_typ}' nicht über die Offline-Queue unterstützt.`,
          })
          continue
        }

        const antwort = await wendeAenderungAn({
          origin,
          endpoint: route.endpoint,
          methode: route.methode,
          payload: vollstaendig.payload,
          cookieHeader,
        })

        if (antwort.ok) {
          await schreibeSyncAudit(admin, {
            organizationId: auth.organizationId,
            userId: auth.userId,
            queueItemId,
            idempotencyKey,
            entityTyp: vollstaendig.entity_typ,
            aktion: 'sync_success',
            details: { status_code: antwort.status, endpoint: route.endpoint, methode: route.methode },
          })
          ergebnisse.push({
            queue_item_id: queueItemId,
            idempotency_key: idempotencyKey,
            entity_typ: vollstaendig.entity_typ,
            status: 'synced',
            message: 'Erfolgreich synchronisiert.',
          })
        } else {
          await schreibeSyncAudit(admin, {
            organizationId: auth.organizationId,
            userId: auth.userId,
            queueItemId,
            idempotencyKey,
            entityTyp: vollstaendig.entity_typ,
            aktion: 'sync_error',
            details: { status_code: antwort.status, endpoint: route.endpoint, fehler: antwort.text },
          })
          void benachrichtigeSyncFehler(auth.userId, vollstaendig.entity_typ, `HTTP ${antwort.status}`)
          ergebnisse.push({
            queue_item_id: queueItemId,
            idempotency_key: idempotencyKey,
            entity_typ: vollstaendig.entity_typ,
            status: 'error',
            message: `HTTP ${antwort.status}: ${antwort.text}`.slice(0, 500),
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await schreibeSyncAudit(admin, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          queueItemId,
          idempotencyKey,
          entityTyp: vollstaendig.entity_typ,
          aktion: 'sync_error',
          details: { fehler: msg },
        })
        ergebnisse.push({
          queue_item_id: queueItemId,
          idempotency_key: idempotencyKey,
          entity_typ: vollstaendig.entity_typ,
          status: 'error',
          message: msg,
        })
      }
    }

    const zusammenfassung = {
      erfolg: ergebnisse.filter(e => e.status === 'synced').length,
      fehler: ergebnisse.filter(e => e.status === 'error').length,
      konflikte: ergebnisse.filter(e => e.status === 'conflict_pending' || e.status === 'conflict_resolved').length,
      uebersprungen: ergebnisse.filter(e => e.status === 'skipped_idempotent' || e.status === 'unsupported').length,
    }

    const response: SyncBatchAntwort = { ergebnisse, zusammenfassung }
    return NextResponse.json(response)
  } catch (err) {
    return safeApiError(err, request)
  }
})
