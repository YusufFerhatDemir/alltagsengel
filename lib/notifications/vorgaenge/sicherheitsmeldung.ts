// ═══════════════════════════════════════════════════════════════════════
// Wiederherstellung der Sicherheitsmeldung
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM DAS NOETIG IST
// Eine Sicherheitsmeldung, die an einem Provider-Ausfall scheitert, ist
// genau die Meldung, die jemand haette lesen muessen. Ohne Eintrag im
// Vorgangsregister liesse der Wiederholungslauf die Zeile 24 Stunden
// liegen und schoebe sie dann als „nicht wiederherstellbar" ins Dead
// Letter — die Anmeldung auf dem fremden Geraet waere protokolliert,
// aber niemand haette davon erfahren.
//
// WIE DIE NACHRICHT WIEDER ENTSTEHT
// Das Zustellprotokoll enthaelt bewusst KEINEN Nachrichteninhalt. Der
// Wiederhersteller baut die Mail deshalb neu — aus der Ereigniszeile in
// security_audit_log, deren id als `vorgangRef` mitgegeben wurde. Die
// Zeile ist unveraenderlich, die Wiederholung sagt also garantiert
// dasselbe wie der Erstversuch.
//
// NUR E-MAIL. Eine Sicherheitsmeldung geht ueber genau einen Kanal.
//
// KEIN ZWEITER NACHWEIS
// Der Wiederhersteller schreibt bewusst KEINE zweite
// `security_notification_sent`-Zeile: den Nachweis hat der Erstversuch
// geschrieben oder eben nicht. Zwei Nachweise fuer eine Meldung wuerden
// die Sperrfrist verfaelschen.
// ═══════════════════════════════════════════════════════════════════════

import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import type { SendeErgebnis } from '@/lib/notifications/retry'
import {
  registriereVorgang,
  type WiederherstellungKontext,
} from '@/lib/notifications/wiederherstellung'
import {
  SICHERHEITSMELDUNG_ART,
  baueMeldung,
  type MeldeKontext,
} from '@/lib/security/benachrichtigung'
import { istSchweregrad, type Schweregrad } from '@/lib/security/ereignisse'

interface EreignisZeile {
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

async function stelleWiederHer(kontext: WiederherstellungKontext): Promise<SendeErgebnis> {
  try {
    const admin = createAdminClient()

    // Mandantengrenze im Code — der Lauf liest mit dem Dienstschluessel,
    // RLS greift dort nicht.
    const { data, error } = await admin
      .from('security_audit_log')
      .select(
        'id, user_id, user_email, organization_id, event_type, severity, created_at, '
        + 'ip_address, user_agent, platform, device_info, app_version, session_reference, metadata',
      )
      .eq('id', kontext.vorgangRef)
      .eq('organization_id', kontext.organizationId)
      .maybeSingle()

    if (error) return { ok: false, fehler: { message: error.message, statusCode: null } }

    if (!data) {
      // Die Zeile ist weg (Aufbewahrungsfrist) oder gehoert einem
      // anderen Mandanten. Ein weiterer Versuch findet sie auch nicht.
      return {
        ok: false,
        fehler: { message: 'Ereigniszeile nicht gefunden', statusCode: 404 },
      }
    }

    const z = data as unknown as EreignisZeile

    let name: string | null = null
    let rolle: string | null = null
    if (z.user_id) {
      const { data: profil } = await admin
        .from('profiles')
        .select('first_name, last_name, role')
        .eq('id', z.user_id)
        .maybeSingle()
      if (profil) {
        const voll = [profil.first_name, profil.last_name].filter(Boolean).join(' ').trim()
        name = voll || null
        rolle = (profil.role as string) ?? null
      }
    }

    let orgName: string | null = null
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', kontext.organizationId)
      .maybeSingle()
    orgName = (org?.name as string | null) ?? null

    const browser = textFeld(z.device_info, 'browser')
    const os = textFeld(z.device_info, 'betriebssystem')

    const k: MeldeKontext = {
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
      benutzerName: name,
      rolle,
      appVersion: z.app_version,
      browser,
      betriebssystem: os,
      sessionReference: z.session_reference,
    }

    const { betreff, html, text } = baueMeldung(k, orgName)

    const ergebnis = await sendRawEmail({
      to: kontext.recipient,
      subject: betreff,
      html,
      text,
      // Derselbe Schluessel wie beim Erstversuch: hat Resend den Auftrag
      // damals doch angenommen, entsteht keine zweite Mail.
      idempotenzSchluessel: `sec-${z.id}-${kontext.recipient}`,
      // KEIN eigener Zustellkontext — die Protokollzeile schreibt der
      // Wiederholungslauf drumherum. Sonst zwei Zeilen je Versuch und
      // die Versuchsobergrenze waere nach der Haelfte erreicht.
    })

    if (ergebnis.ok) return { ok: true }
    if (ergebnis.uebersprungen) {
      // Kein Schluessel konfiguriert: kein Fehlversuch, zaehlt nicht
      // gegen die Obergrenze.
      return { ok: false, uebersprungen: true, fehler: ergebnis.grund }
    }
    return { ok: false, fehler: ergebnis.fehler ?? ergebnis.grund }
  } catch (err) {
    return { ok: false, fehler: err }
  }
}

registriereVorgang(SICHERHEITSMELDUNG_ART, ['email'], stelleWiederHer)
