// ═══════════════════════════════════════════════════════════════════════
// lib/fcm.ts — Bestandsschnittstelle fuer nativen Push
// ═══════════════════════════════════════════════════════════════════════
//
// Die eigentliche Umsetzung liegt seit Track 4 in lib/notifications/push/
// (Token-Verwaltung, Provider, Anbindung an die Zustellspur). Diese Datei
// bleibt als schmale Naht bestehen, weil zwei Aufrufer sie benutzen —
// lib/notifications.ts und lib/sync/notify.ts — und ihr Vertrag
// (`sendFCMToUser(userId, payload)` ⇒ `{ sent, failed }`) unveraendert
// gilt.
//
// WAS SICH FUER DIE AUFRUFER AENDERT, OHNE DASS SIE ETWAS TUN MUESSEN
//   • Widerspruch des Nutzers wird beachtet (notification_preferences)
//   • tote Token werden geloescht statt bei jedem Versand erneut versucht
//   • ein FCM-Ausfall (429/5xx) wird kurz wiederholt, statt sofort
//     als Fehlschlag zu enden
//   • INVALID_ARGUMENT loescht den Token nur noch dann, wenn FCM
//     ausdruecklich DAS TOKEN beanstandet — vorher haette ein Fehler in
//     der Nutzlast den gesamten Geraetebestand geleert
//
// NEU UND OPTIONAL ist der dritte Parameter: mit Zustellkontext laeuft
// der Versand ueber sendeIdempotent() — genau eine Zustellung je Vorgang,
// Protokollzeile in notification_delivery_log, wiederholbar durch den
// Retry-Worker. Ohne ihn verhaelt sich alles wie bisher (kein Protokoll),
// damit kein bestehender Aufrufer bricht.
// ═══════════════════════════════════════════════════════════════════════

import type { ZustellKontext } from '@/lib/notifications/delivery-log'
import {
  sendePushAnNutzer,
  sendePushIdempotent,
  type PushNachricht,
} from '@/lib/notifications/push'
import { logger } from '@/lib/logger'

const log = logger.child('fcm')

export interface FCMPayload {
  title: string
  body: string
  icon?: string
  tag?: string
  url?: string
  data?: Record<string, string>
}

function alsNachricht(p: FCMPayload): PushNachricht {
  return {
    title: p.title,
    body: p.body,
    icon: p.icon,
    tag: p.tag,
    url: p.url,
    data: p.data,
  }
}

/**
 * Sendet an alle Geraete eines Nutzers.
 *
 * @param zustellung Mit `organizationId` UND `correlationId` laeuft der
 *   Versand idempotent und protokolliert. Fehlt eines von beiden, wird
 *   direkt gesendet — ohne Protokoll, aber mit allen Schutzmechanismen
 *   des neuen Wegs.
 */
export async function sendFCMToUser(
  userId: string,
  payload: FCMPayload,
  zustellung?: ZustellKontext & { correlationId?: string | null }
): Promise<{ sent: number; failed: number }> {
  const nachricht = alsNachricht(payload)

  if (zustellung?.organizationId && zustellung.correlationId) {
    const { correlationId, organizationId, ...rest } = zustellung
    const ergebnis = await sendePushIdempotent({
      userId,
      organizationId,
      correlationId,
      kontext: rest,
      nachricht,
    })
    // Der Aufrufer erwartet Stueckzahlen. 'versendet' heisst: mindestens
    // ein Geraet erreicht — mehr weiss der idempotente Weg nach aussen
    // bewusst nicht, weil die Zahl der Geraete niemanden ausserhalb
    // dieses Moduls etwas angeht.
    if (ergebnis.status === 'versendet') return { sent: 1, failed: 0 }
    if (ergebnis.status === 'fehlgeschlagen') return { sent: 0, failed: 1 }
    log.info('FCM nicht gesendet', { status: ergebnis.status, grund: ergebnis.grund })
    return { sent: 0, failed: 0 }
  }

  const organizationId = zustellung?.organizationId
  const ergebnis = await sendePushAnNutzer({
    userId,
    // Ohne Mandantenangabe bleibt die Grenze die user_id — die gab es in
    // fcm_tokens schon immer, und ein Geraet gehoert dem Nutzer.
    organizationId: organizationId ?? '',
    nachricht,
  })

  return { sent: ergebnis.zugestellt, failed: ergebnis.fehlgeschlagen }
}
