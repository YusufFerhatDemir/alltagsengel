// ═══════════════════════════════════════════════════════════════════════
// Push-Kanal — gemeinsame Typen
// ═══════════════════════════════════════════════════════════════════════

import type { ZustellProvider } from '@/lib/notifications/delivery-log'

/**
 * Provider-Kennung des nativen Push-Kanals in notification_delivery_log.
 *
 * WARUM HIER UND NICHT IN ZUSTELL_PROVIDER
 * Der Wert kommt mit Migration 20260928000000 in den CHECK der Spalte.
 * Die TypeScript-Union in lib/notifications/delivery-log.ts wird davon
 * unabhaengig gepflegt; sobald sie 'fcm' enthaelt, faellt die Zusicherung
 * hier ersatzlos weg. Bis dahin haelt genau diese eine Stelle den Wert —
 * nicht verstreut an jedem Aufrufer.
 */
export const PUSH_PROVIDER = 'fcm' as ZustellProvider

/** Plattformen, die die Datenbank kennt (CHECK auf fcm_tokens.platform). */
export const PUSH_PLATTFORMEN = ['android', 'ios', 'web'] as const
export type PushPlattform = (typeof PUSH_PLATTFORMEN)[number]

export function istPushPlattform(wert: unknown): wert is PushPlattform {
  return typeof wert === 'string' && (PUSH_PLATTFORMEN as readonly string[]).includes(wert)
}

/** Ein registriertes Geraet. Entspricht einer Zeile in public.fcm_tokens. */
export interface Geraet {
  id: string
  userId: string
  organizationId: string | null
  token: string
  platform: PushPlattform
  lastUsedAt: string | null
}

/** Nachricht, wie sie an FCM geht. */
export interface PushNachricht {
  title: string
  body: string
  /** Ziel-URL in der App. Wird als Datenfeld UND als webpush-Link gesetzt. */
  url?: string
  /** Zusammenfassungs-Schluessel; gleiche tag ersetzt die alte Meldung. */
  tag?: string
  icon?: string
  /**
   * Zusatzdaten. FCM erlaubt im data-Block ausschliesslich Strings —
   * andere Typen quittiert die API mit INVALID_ARGUMENT.
   */
  data?: Record<string, string>
}

/** Ergebnis eines einzelnen Sendeversuchs an EIN Geraet. */
export interface PushVersuch {
  ok: boolean
  /** FCM-Nachrichten-ID (`projects/…/messages/…`). */
  messageId?: string | null
  /**
   * true, wenn gar nicht gesendet wurde, weil eine Voraussetzung fehlt
   * (keine Zugangsdaten). Kein Fehlversuch — der Vorgang bleibt offen.
   */
  uebersprungen?: boolean
  /**
   * true, wenn FCM das Geraet als endgueltig unerreichbar meldet. Der
   * Token wird dann geloescht (Rotation), nicht erneut versucht.
   */
  tokenUngueltig?: boolean
  fehler?: unknown
}

/** Ergebnis ueber ALLE Geraete eines Nutzers. */
export interface PushErgebnis {
  zugestellt: number
  fehlgeschlagen: number
  /** Wie viele Token wegen Ungueltigkeit entfernt wurden. */
  entfernt: number
  uebersprungen?: boolean
  grund?: string
  /** Erste Provider-Nachrichten-ID — fuer die Zustellspur. */
  messageId?: string | null
  fehler?: unknown
}
