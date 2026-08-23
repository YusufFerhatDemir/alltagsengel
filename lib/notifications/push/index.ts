// ═══════════════════════════════════════════════════════════════════════
// Push-Kanal — Einstieg fuer den Rest der Anwendung
// ═══════════════════════════════════════════════════════════════════════
//
// Bindet FCM an denselben Versandweg, den E-Mail und WhatsApp schon
// nehmen: sendeIdempotent() aus lib/notifications/retry.ts. Damit gilt
// fuer nativen Push ab sofort dasselbe wie fuer die anderen Kanaele —
// genau eine Zustellung je Vorgang, Protokollzeile in
// notification_delivery_log, Wiederholung durch den Retry-Worker.
//
// WARUM NATIVER PUSH EINE EIGENE VORGANGS-ID BEKOMMT
// Der Idempotenzschluessel ist (correlation_id, channel). Web-Push
// (lib/push.ts) und nativer Push teilen sich den Kanal 'push' — mit
// derselben correlation_id waeren sie fuer die Sperre EIN Vorgang: waere
// der Web-Push durch, gaebe `bereitsZugestellt()` fuer FCM "schon
// zugestellt" zurueck und auf dem Handy kaeme nie etwas an. Das waere
// still und praktisch nicht auffindbar.
//
// Deshalb leitet dieses Modul aus der uebergebenen Vorgangs-ID eine
// eigene ab (`pushVorgangsId`). Sie ist reproduzierbar — gleicher
// Vorgang ⇒ gleiche ID, ueber Prozessgrenzen hinweg —, aber von der des
// Web-Push verschieden. Beide Wege bleiben dadurch je fuer sich genau
// einmal zustellbar.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { vorgangsId, type ZustellKontext } from '@/lib/notifications/delivery-log'
import { sendeIdempotent, type IdempotentErgebnis, type SendeErgebnis } from '@/lib/notifications/retry'
import { fcmKonfiguriert, sendPush, type SendeOptionen } from './fcm-provider'
import {
  geraeteFuerNutzer,
  markiereGenutzt,
  pushErlaubt,
} from './token-store'
import { PUSH_PROVIDER, type PushErgebnis, type PushNachricht } from './typen'

const log = logger.child('push')

export * from './typen'
export {
  registriereGeraet,
  entferneGeraet,
  entwerteToken,
  geraeteFuerNutzer,
  pushErlaubt,
  setzePushErlaubnis,
  tokenKuerzel,
} from './token-store'
export { fcmKonfiguriert, leseZugang, deuteFcmFehler, sendPush } from './fcm-provider'

/**
 * Vorgangs-ID des nativen Push-Kanals. Begruendung im Kopfkommentar.
 *
 * Der Zusatz ist fest ('fcm'), damit dieselbe Nachricht nach einem
 * Neustart wieder auf dieselbe ID faellt — sonst waere die Sperre
 * wirkungslos.
 */
export function pushVorgangsId(...teile: Array<string | number>): string {
  return vorgangsId(...teile, 'fcm')
}

export interface PushVersandParams {
  userId: string
  organizationId: string
  nachricht: PushNachricht
  /** Eigener Client (Tests, Batchlaeufe). */
  admin?: SupabaseClient
  optionen?: SendeOptionen
}

/**
 * Sendet an ALLE Geraete eines Nutzers.
 *
 * Ein erreichtes Geraet zaehlt als zugestellt — der Nutzer hat die
 * Nachricht gesehen. Erst wenn kein einziges Geraet erreichbar war, ist
 * der Vorgang fehlgeschlagen. Dieselbe Regel gilt beim Web-Push
 * (lib/push.ts); zwei verschiedene Massstaebe fuer denselben Kanal waeren
 * im Protokoll nicht vergleichbar.
 *
 * Geraete, deren Token FCM als tot meldet, zaehlen NICHT als
 * Fehlversuch: sie sind weg, nicht gestoert. Waren alle Geraete tot,
 * ist das Ergebnis "uebersprungen" — es gibt nichts mehr zu wiederholen.
 */
export async function sendePushAnNutzer(params: PushVersandParams): Promise<PushErgebnis> {
  const { userId, organizationId, nachricht, admin, optionen } = params

  if (!fcmKonfiguriert(optionen?.env ?? process.env)) {
    return {
      zugestellt: 0,
      fehlgeschlagen: 0,
      entfernt: 0,
      uebersprungen: true,
      grund: 'FCM-Zugangsdaten fehlen',
    }
  }

  const erlaubnis = await pushErlaubt(userId, organizationId, admin)
  if (!erlaubnis.erlaubt) {
    log.info('Push nicht gesendet — kein Einverstaendnis', { grund: erlaubnis.grund })
    return {
      zugestellt: 0,
      fehlgeschlagen: 0,
      entfernt: 0,
      uebersprungen: true,
      grund: erlaubnis.grund ?? 'Push abgewaehlt',
    }
  }

  const geraete = await geraeteFuerNutzer(userId, organizationId, admin)
  if (geraete.length === 0) {
    return {
      zugestellt: 0,
      fehlgeschlagen: 0,
      entfernt: 0,
      uebersprungen: true,
      grund: 'Kein Geraet registriert',
    }
  }

  const ergebnisse = await Promise.all(
    geraete.map(g =>
      sendPush(g.token, nachricht.title, nachricht.body, nachricht.data, {
        ...optionen,
        url: nachricht.url,
        tag: nachricht.tag,
        icon: nachricht.icon,
      }).then(v => ({ token: g.token, ...v }))
    )
  )

  const erfolge = ergebnisse.filter(e => e.ok)
  const entfernt = ergebnisse.filter(e => e.tokenUngueltig).length
  const uebersprungen = ergebnisse.filter(e => e.uebersprungen).length
  const fehlgeschlagen = ergebnisse.length - erfolge.length - entfernt - uebersprungen

  if (erfolge.length > 0) {
    await markiereGenutzt(erfolge.map(e => e.token), admin)
  }

  log.info('Push versendet', {
    userId,
    zugestellt: erfolge.length,
    fehlgeschlagen,
    entfernt,
  })

  if (erfolge.length > 0) {
    return {
      zugestellt: erfolge.length,
      fehlgeschlagen,
      entfernt,
      messageId: erfolge[0].messageId ?? null,
    }
  }

  // Nichts zugestellt. Bleibt der Vorgang wiederholbar?
  if (fehlgeschlagen > 0) {
    return {
      zugestellt: 0,
      fehlgeschlagen,
      entfernt,
      fehler: ergebnisse.find(e => !e.ok && !e.tokenUngueltig && !e.uebersprungen)?.fehler,
    }
  }

  return {
    zugestellt: 0,
    fehlgeschlagen: 0,
    entfernt,
    uebersprungen: true,
    grund:
      entfernt > 0
        ? 'Alle Geraete-Token waren ungueltig und wurden entfernt'
        : 'FCM-Zugangsdaten fehlen',
  }
}

export interface PushIdempotentParams extends PushVersandParams {
  /**
   * Vorgangs-ID des fachlichen Ereignisses — dieselbe, die die anderen
   * Kanaele bekommen. Der Push-Zusatz wird hier abgeleitet.
   */
  correlationId: string
  kontext?: Omit<ZustellKontext, 'organizationId' | 'correlationId'>
  /** Wartezeiten ignorieren (manueller Nachversand). */
  sofort?: boolean
}

/**
 * Der Weg, den Aufrufer nehmen sollen: genau einmal je Vorgang, mit
 * Protokollzeile und Wiederholbarkeit.
 */
export async function sendePushIdempotent(
  params: PushIdempotentParams
): Promise<IdempotentErgebnis> {
  const { userId, organizationId, correlationId, kontext, admin, sofort } = params

  return sendeIdempotent({
    kontext: {
      ...kontext,
      organizationId,
      correlationId: pushVorgangsId(correlationId),
    },
    channel: 'push',
    provider: PUSH_PROVIDER,
    // Empfaenger ist die Nutzer-ID, nicht der Token: der Token ist eine
    // Geraeteadresse und wechselt; die Protokollzeile soll den Menschen
    // benennen, nicht sein aktuelles Handy.
    recipient: userId,
    sofort,
    admin,
    senden: async (): Promise<SendeErgebnis> => {
      const e = await sendePushAnNutzer(params)
      if (e.uebersprungen) {
        return { ok: false, uebersprungen: true, fehler: e.grund }
      }
      return {
        ok: e.zugestellt > 0,
        providerMessageId: e.messageId ?? null,
        fehler: e.zugestellt > 0 ? undefined : (e.fehler ?? 'Kein Geraet erreichbar'),
      }
    },
  })
}
