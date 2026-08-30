// ═══════════════════════════════════════════════════════════════════════
// Nachzuegler — Meldungen zu Ereignissen, die die Datenbank geschrieben hat
// ═══════════════════════════════════════════════════════════════════════
//
// DAS PROBLEM, DAS DIESER LAUF LOEST
// Zwei Ereignisquellen schreiben in security_audit_log, ohne eine Mail
// senden zu koennen:
//
//   1. Der Trigger auf auth.users (Anmeldung ueber Magic-Link, native
//      App, OAuth — alles, was nicht durch das Anmeldeformular laeuft).
//   2. Der Trigger auf profiles (Adresse, Rufnummer, Name, Rolle — die
//      Profilseiten schreiben mit dem Browser-Client direkt, es gibt
//      dort keine Serverroute).
//
// Ein Trigger kann keine Mail verschicken. Ohne diesen Lauf staende die
// Aenderung im Protokoll, und niemand erfuehre davon — bei einem
// ueberwachten Konto genau der Fall, um den es geht.
//
// WARUM ES KEINE DOPPELTEN MAILS GIBT — drei Riegel:
//   a) Ereignisse mit vorhandenem Versandnachweis
//      (security_notification_sent mit bezug_ereignis) fallen raus.
//   b) Ereignisse, die bereits in der Zustellspur stehen, fallen raus —
//      um die kuemmert sich der Wiederholungslauf.
//   c) Der Idempotenzschluessel `sec-<ereignis>-<adresse>` faengt einen
//      Rest ab, den a) und b) nicht sehen (Resend, 24-Stunden-Fenster).
//
// Der Lauf haengt am Wiederholungslauf (/api/cron/zustellung-retry, alle
// fuenf Minuten ueber .github/workflows/zustellung-retry.yml) — kein
// eigener Takt, kein zusaetzlicher Vercel-Cron.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { meldeSicherheitsereignis, MELDE_NACHWEIS, SICHERHEITSMELDUNG_ART } from './benachrichtigung'
import { istSchweregrad, type Schweregrad } from './ereignisse'

const log = logger.child('security-nachzuegler')

/**
 * Wie weit zurueck der Lauf schaut. Grosszuegiger als der Fuenf-Minuten-
 * Takt, damit ein ausgefallener Lauf nichts verliert; die drei Riegel
 * gegen Doppelversand machen die Ueberlappung folgenlos.
 */
export const RUECKSCHAU_MINUTEN = 120

/** Obergrenze je Lauf. Ein Massenvorfall soll den Takt nicht sprengen. */
export const STAPEL_GROESSE = 50

export interface NachzueglerErgebnis {
  geprueft: number
  gemeldet: number
  uebersprungen: number
  fehler: number
}

interface Zeile {
  id: string
  user_id: string | null
  user_email: string | null
  organization_id: string | null
  event_type: string
  severity: string
  created_at: string
  ip_address: string | null
  user_agent: string | null
  platform: string | null
  device_info: Record<string, unknown> | null
  app_version: string | null
  session_reference: string | null
  metadata: Record<string, unknown> | null
}

function textFeld(quelle: Record<string, unknown> | null, feld: string): string | null {
  const wert = quelle?.[feld]
  return typeof wert === 'string' && wert !== 'unbekannt' ? wert : null
}

/**
 * Verschickt die Meldungen zu Ereignissen, die noch keine haben.
 *
 * Die Entscheidung, OB gemeldet wird, faellt weiterhin allein in
 * meldeSicherheitsereignis() — dieser Lauf sucht nur die Kandidaten. So
 * gibt es keine zweite Meldekonfiguration, die von der ersten abweichen
 * koennte.
 */
export async function sendeOffeneSicherheitsmeldungen(
  vorhandenerClient?: SupabaseClient,
): Promise<NachzueglerErgebnis> {
  const ergebnis: NachzueglerErgebnis = { geprueft: 0, gemeldet: 0, uebersprungen: 0, fehler: 0 }

  try {
    const admin = (vorhandenerClient ?? createAdminClient()) as ReturnType<typeof createAdminClient>
    const seit = new Date(Date.now() - RUECKSCHAU_MINUTEN * 60_000).toISOString()

    // Nur Ereignisse aus der Datenbank. Alles, was der Anwendungscode
    // geschrieben hat, hat seine Meldung im selben Aufruf bekommen —
    // hier noch einmal zu suchen, waere doppelte Arbeit mit dem Risiko
    // doppelter Mails.
    const { data, error } = await admin
      .from('security_audit_log')
      .select(
        'id, user_id, user_email, organization_id, event_type, severity, created_at, '
        + 'ip_address, user_agent, platform, device_info, app_version, session_reference, metadata',
      )
      .eq('device_info->>quelle', 'db_trigger')
      .not('user_id', 'is', null)
      .gte('created_at', seit)
      .order('created_at', { ascending: true })
      .limit(STAPEL_GROESSE)

    if (error) {
      if (error.code !== '42P01' && error.code !== 'PGRST205') {
        log.error('Nachzuegler konnte nicht lesen', { errorCode: error.code })
        ergebnis.fehler++
      }
      return ergebnis
    }

    const zeilen = (data ?? []) as unknown as Zeile[]
    if (zeilen.length === 0) return ergebnis

    // ── Riegel a) bereits gemeldet ──
    const { data: nachweise } = await admin
      .from('security_audit_log')
      .select('metadata')
      .eq('event_type', MELDE_NACHWEIS)
      .gte('created_at', seit)
    const gemeldet = new Set(
      (nachweise ?? [])
        .map(n => (n.metadata as Record<string, unknown> | null)?.bezug_ereignis)
        .filter((v): v is string => typeof v === 'string'),
    )

    // ── Riegel b) schon in der Zustellspur (Wiederholungslauf zustaendig) ──
    const { data: zustellungen } = await admin
      .from('notification_delivery_log')
      .select('vorgang_ref')
      .eq('vorgang_art', SICHERHEITSMELDUNG_ART)
      .gte('created_at', seit)
    const inZustellspur = new Set(
      (zustellungen ?? [])
        .map(z => z.vorgang_ref as string | null)
        .filter((v): v is string => !!v),
    )

    for (const z of zeilen) {
      ergebnis.geprueft++
      if (gemeldet.has(z.id) || inZustellspur.has(z.id)) {
        ergebnis.uebersprungen++
        continue
      }

      const browser = textFeld(z.device_info, 'browser')
      const os = textFeld(z.device_info, 'betriebssystem')

      const antwort = await meldeSicherheitsereignis({
        ereignisId: z.id,
        eventType: z.event_type,
        severity: (istSchweregrad(z.severity) ? z.severity : 'warning') as Schweregrad,
        userId: z.user_id,
        userEmail: z.user_email,
        organizationId: z.organization_id,
        ip: z.ip_address,
        userAgent: z.user_agent,
        plattform: z.platform,
        geraet: [browser, os].filter(Boolean).join(' auf ') || null,
        zeitpunkt: new Date(z.created_at),
        metadata: z.metadata ?? {},
        appVersion: z.app_version,
        browser,
        betriebssystem: os,
        sessionReference: z.session_reference,
      })

      if (antwort.gesendet) ergebnis.gemeldet++
      else ergebnis.uebersprungen++
    }

    if (ergebnis.gemeldet > 0) {
      log.info('Nachzuegler hat Sicherheitsmeldungen versendet', {
        gemeldet: ergebnis.gemeldet, geprueft: ergebnis.geprueft,
      })
    }
    return ergebnis
  } catch (err) {
    log.errorWithException('Nachzuegler fehlgeschlagen', err)
    ergebnis.fehler++
    return ergebnis
  }
}
