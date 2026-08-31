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
import { provenienzFuerZeile, kennzeichen } from './herkunft'

const log = logger.child('security-nachzuegler')

/**
 * Wie weit zurueck der Lauf schaut. Grosszuegiger als der Fuenf-Minuten-
 * Takt, damit ein ausgefallener Lauf nichts verliert; die drei Riegel
 * gegen Doppelversand machen die Ueberlappung folgenlos.
 */
export const RUECKSCHAU_MINUTEN = 120

/** Obergrenze je Lauf. Ein Massenvorfall soll den Takt nicht sprengen. */
export const STAPEL_GROESSE = 50

/**
 * Zeitfenster, in dem eine Trigger-Zeile und eine Anwendungs-Zeile
 * DIESELBE Anmeldung meinen.
 *
 * BEFUND 31.08.2026, live gemessen: jede Anmeldung erzeugt ZWEI Zeilen.
 * Zuerst schreibt der Trigger auf auth.users (platform 'server',
 * metadata.herkunft 'auth.users.last_sign_in_at'), drei bis fuenf
 * Sekunden spaeter schreibt die Anmelderoute ihre eigene Zeile
 * (platform 'web', mit IP, User-Agent und Geraetekennung).
 *
 *   07:50:26  login_success  server  herkunft=auth.users.last_sign_in_at
 *   07:50:29  login_success  web     geraet_hash=bd89aa76…
 *
 * Die Route meldet ihre Zeile sofort, der Nachzuegler die des Triggers
 * hinterher — zwei Mails zu EINER Anmeldung. Bei einem ueberwachten
 * Konto mit ohne_sperrfrist=true, also genau der Einstellung, fuer die
 * man die Ueberwachung einschaltet, greift auch die 12-Stunden-Bremse
 * nicht. Doppelte Meldungen sind kein Schoenheitsfehler: wer zweimal
 * dasselbe bekommt, liest beim dritten Mal keins von beiden mehr.
 *
 * Fuenf Minuten sind grosszuegig gegenueber den gemessenen Sekunden und
 * decken auch einen langsamen Trigger-Lauf ab.
 */
export const DOPPELFENSTER_SEKUNDEN = 300

export interface NachzueglerErgebnis {
  geprueft: number
  gemeldet: number
  uebersprungen: number
  fehler: number
  /**
   * Davon uebersprungen, weil die Anwendung dieselbe Anmeldung bereits
   * aufgezeichnet hat. Eigens gezaehlt: bleibt die Zahl dauerhaft bei 0,
   * schreibt entweder der Trigger oder die Route nicht mehr — und beides
   * will man wissen, bevor es jemandem auffaellt, weil eine Meldung
   * fehlt.
   */
  doppelt: number
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
  const ergebnis: NachzueglerErgebnis = {
    geprueft: 0, gemeldet: 0, uebersprungen: 0, fehler: 0, doppelt: 0,
  }

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

    // ── Riegel c) dieselbe Anmeldung, zweimal aufgezeichnet ──
    //
    // a) und b) vergleichen KENNUNGEN. Sie erkennen deshalb nicht, dass
    // die Trigger-Zeile und die Zeile der Anmelderoute dasselbe Ereignis
    // in der Welt beschreiben — es sind zwei verschiedene Zeilen mit
    // zwei verschiedenen Kennungen.
    //
    // WARUM DAS KEINE MELDUNG VERSCHLUCKT
    // Uebersprungen wird nur die Trigger-Zeile, und nur dann, wenn die
    // Anwendung fuer dasselbe Konto, denselben Ereignistyp und dasselbe
    // Zeitfenster bereits eine eigene Zeile geschrieben hat. Fuer die
    // hat die Anwendung im selben Aufruf entschieden, ob gemeldet wird:
    // entweder ist die Mail raus, oder sie wurde bewusst unterdrueckt,
    // weil `unknown_device` die Nachricht traegt (eine statt zweier zur
    // selben Anmeldung). In beiden Faellen waere die Trigger-Zeile die
    // ZWEITE Nachricht zur selben Sache.
    //
    // Anmeldungen ohne Anwendungszeile — Magic-Link, native App, OAuth,
    // also genau die Faelle, fuer die dieser Lauf existiert — finden
    // keinen Partner und werden weiterhin gemeldet.
    const kontenImStapel = [...new Set(zeilen.map(z => z.user_id).filter((v): v is string => !!v))]
    const anwendungsZeilen: { user_id: string; event_type: string; created_at: string }[] = []
    if (kontenImStapel.length > 0) {
      const { data: ausDerAnwendung } = await admin
        .from('security_audit_log')
        .select('user_id, event_type, created_at')
        .in('user_id', kontenImStapel)
        .neq('device_info->>quelle', 'db_trigger')
        .gte('created_at', new Date(Date.parse(seit) - DOPPELFENSTER_SEKUNDEN * 1000).toISOString())
      for (const a of ausDerAnwendung ?? []) {
        anwendungsZeilen.push(a as unknown as { user_id: string; event_type: string; created_at: string })
      }
    }

    const hatAnwendungsPartner = (z: Zeile): boolean =>
      anwendungsZeilen.some(a =>
        a.user_id === z.user_id
        && a.event_type === z.event_type
        && Math.abs(Date.parse(a.created_at) - Date.parse(z.created_at))
           <= DOPPELFENSTER_SEKUNDEN * 1000)

    for (const z of zeilen) {
      ergebnis.geprueft++
      if (gemeldet.has(z.id) || inZustellspur.has(z.id)) {
        ergebnis.uebersprungen++
        continue
      }
      if (hatAnwendungsPartner(z)) {
        ergebnis.uebersprungen++
        ergebnis.doppelt++
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
        metadata: {
          ...(z.metadata ?? {}),
          // Die Zeilen des Auth-Triggers tragen KEINE Provenienz: der
          // Trigger laeuft in SQL, die Ableitung sitzt im
          // Anwendungscode, und die Tabelle ist unveraenderlich — sie
          // liesse sich auch nicht nachtragen. Ohne diese Herleitung
          // stuende in der Mail „[HERKUNFT UNBELEGT]", obwohl es sich um
          // die authentischste Anmeldequelle ueberhaupt handelt: der
          // Trigger feuert ausschliesslich bei einer tatsaechlichen
          // Aenderung von auth.users.last_sign_in_at.
          ...(() => {
            const p = provenienzFuerZeile(z.metadata, z.device_info, z.event_type)
            return p ? kennzeichen(p) : {}
          })(),
        },
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
        doppelt: ergebnis.doppelt,
      })
    }
    return ergebnis
  } catch (err) {
    log.errorWithException('Nachzuegler fehlgeschlagen', err)
    ergebnis.fehler++
    return ergebnis
  }
}
