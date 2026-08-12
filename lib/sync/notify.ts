// ═══════════════════════════════════════════════════════════════
// Push-Benachrichtigungen für Sync-Ereignisse — Block 20.
// Nutzt die bestehende FCM-Anbindung (lib/fcm.ts, sendFCMToUser) —
// KEIN neues FCM-Setup. Best-effort: ein Fehlschlag beim Versand darf
// den eigentlichen Sync-Vorgang niemals blockieren, deshalb schlucken
// die Wrapper hier Fehler und loggen nur.
// ═══════════════════════════════════════════════════════════════

import { sendFCMToUser } from '@/lib/fcm'

export async function benachrichtigeSyncFehler(
  userId: string,
  entityTyp: string,
  fehlermeldung: string,
): Promise<void> {
  try {
    await sendFCMToUser(userId, {
      title: 'Synchronisierung fehlgeschlagen',
      body: `Ein Eintrag (${entityTyp}) konnte nicht synchronisiert werden: ${fehlermeldung}`,
      tag: 'sync_error',
      url: '/engel/pflegedoku',
    })
  } catch (err) {
    console.error('[sync/notify] Push für Sync-Fehler fehlgeschlagen:', err)
  }
}

export async function benachrichtigeKonflikt(
  userId: string,
  entityTyp: string,
): Promise<void> {
  try {
    await sendFCMToUser(userId, {
      title: 'Sync-Konflikt zu klären',
      body: `Ein Eintrag (${entityTyp}) wurde sowohl lokal als auch auf dem Server geändert und muss geklärt werden.`,
      tag: 'sync_conflict',
      url: '/admin/sync-konflikte',
    })
  } catch (err) {
    console.error('[sync/notify] Push für Sync-Konflikt fehlgeschlagen:', err)
  }
}
