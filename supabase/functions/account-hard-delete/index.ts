// ════════════════════════════════════════════════════════════════════
// Edge Function: account-hard-delete
// ════════════════════════════════════════════════════════════════════
//
// Wird via pg_cron taeglich aufgerufen (z.B. 03:00 UTC). Findet alle
// Accounts mit profiles.deleted_at < now() - 60 Tage und loescht sie
// endgueltig aus allen Kind-Tabellen + Supabase-Auth.
//
// Cron-Setup (einmalig in Supabase SQL Editor):
//
//   SELECT cron.schedule(
//     'account-hard-delete-daily',
//     '0 3 * * *',
//     $$
//     SELECT net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/account-hard-delete',
//       headers := jsonb_build_object(
//         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
//         'Content-Type', 'application/json'
//       ),
//       body := '{}'::jsonb
//     );
//     $$
//   );
//
// Sicherheit:
//   - Nur die Service-Role kann die Function aufrufen (Supabase faengt das
//     Authorization-Header automatisch ab, wenn man sie als "verify_jwt:true"
//     deployed; wir machen das zusaetzlich mit einem Secret-Check, falls
//     jemand die Function public macht).
//   - Cascade-Loeschung: notifications → messages → bookings → angels
//     → profiles → auth.admin.deleteUser
//     (care_eligibility entfernt — Tabelle existiert nicht, Pflegebox-Feature
//      deaktiviert per Phase 5 Architektur-Empfehlung)
//   - Batch-Size: 50 User pro Lauf, damit ein Cron-Job-Timeout nicht die
//     ganze Queue killt.
//
// Analogie:
//   Wie der "Papierkorb automatisch leeren" Task bei iOS — laeuft
//   im Hintergrund, einmal pro Tag, raeumt nur das Alte auf.
// ════════════════════════════════════════════════════════════════════

// @ts-expect-error — Deno-Runtime, kein npm-Import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-expect-error — Deno-Runtime
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts'

const GRACE_DAYS = 60
const BATCH_SIZE = 50

/**
 * Konstantzeit-Vergleich. Deno bringt kein node:crypto.timingSafeEqual
 * mit, deshalb von Hand: gleiche Laenge pruefen, dann jedes Zeichen
 * verodern statt beim ersten Unterschied abzubrechen.
 */
function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let abweichung = 0
  for (let i = 0; i < a.length; i++) abweichung |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return abweichung === 0
}

interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  deleted_at: string
}

interface AuthUserEmail {
  id: string
  email: string | null
}

// ════════════════════════════════════════════════════════════════════
// TRACK 11 — DIESE FUNCTION IST STILLGELEGT.
// ════════════════════════════════════════════════════════════════════
//
// Die endgueltige Loeschung laeuft seit Track 11 im Anwendungscode:
//   lib/dsgvo/loeschkatalog.ts  — was geloescht wird und was bleibt
//   lib/dsgvo/loeschung.ts      — der Ablauf
//   app/api/cron/konto-loeschung — der Takt (vercel.json, 03:00)
//
// DREI GRUENDE, warum diese Function nicht einfach weiterlaufen darf:
//
//  1. SIE LOESCHT ZU VIEL. Der Block unten entfernt `bookings` — obwohl
//     die Migration 20260804400000 fuer genau diese Tabelle das Gegenteil
//     entschieden hat („Buchungsdaten — erhalten bleiben", ON DELETE SET
//     NULL). Buchungen sind abrechnungsrelevante Belege (§ 147 AO).
//  2. SIE LOESCHT ZU WENIG UND BEHAUPTET DAS GEGENTEIL. Die Kundenakte
//     (`clients`), die Mitarbeiterakte (`caregivers`), Geraetetokens und
//     die Zugaenge zum Angehoerigenportal standen in keiner Liste; die
//     Bestaetigungsmail sagte trotzdem „alle damit verknuepften Daten".
//  3. IHR TUERSTEHER WAR FAIL-OPEN. `if (cronSecret && …)` liess bei
//     NICHT gesetztem CRON_SECRET jeden Aufruf durch. Und war es gesetzt,
//     konnte der eingeplante pg_cron-Aufruf es nie treffen: der schickt
//     den service_role_key als Bearer, verglichen wurde gegen CRON_SECRET.
//     Offen oder tot — dazwischen lag nichts.
//
// Sie bleibt im Repo, weil eine moeglicherweise bereits ausgerollte
// Function nicht dadurch verschwindet, dass man die Datei loescht. Sie
// antwortet ab sofort mit 410, solange nicht ausdruecklich
// HARD_DELETE_EDGE_AKTIV=1 gesetzt ist — und ihr Geheimnis-Check ist
// fail-closed.
// ════════════════════════════════════════════════════════════════════

// @ts-expect-error — Deno global
serve(async (req: Request) => {
  if (Deno.env.get('HARD_DELETE_EDGE_AKTIV') !== '1') {
    return new Response(
      JSON.stringify({
        error: 'stillgelegt',
        hinweis: 'Die endgueltige Kontoloeschung laeuft ueber /api/cron/konto-loeschung (lib/dsgvo/loeschung.ts).',
      }),
      { status: 410, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // FAIL-CLOSED: ohne gesetztes Geheimnis wird nicht geloescht. Vorher
  // stand hier `if (cronSecret && …)` — ohne Geheimnis kam jeder durch.
  // `verify_jwt` ist kein Ersatz: es akzeptiert JEDES gueltige Projekt-JWT,
  // also auch den oeffentlichen anon-Key.
  const cronSecret = Deno.env.get('CRON_SECRET')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = req.headers.get('authorization') || ''
  const providedSecret = authHeader.replace(/^Bearer\s+/i, '')

  if (!cronSecret) {
    return new Response('Forbidden', { status: 403 })
  }
  // Der eingeplante Aufruf schickt den Dienstschluessel, ein manueller
  // Aufruf das CRON_SECRET. Beide sind zulaessig; nichts sonst.
  const zulaessig = gleich(providedSecret, cronSecret)
    || (typeof serviceKey === 'string' && serviceKey.length > 0 && gleich(providedSecret, serviceKey))
  if (!zulaessig) {
    return new Response('Forbidden', { status: 403 })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // 1) Kandidaten finden
  const { data: candidates, error: candErr } = await admin
    .from('profiles')
    .select('id, first_name, last_name, deleted_at')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .limit(BATCH_SIZE)

  if (candErr) {
    console.error('[hard-delete] Fehler beim Laden der Kandidaten', candErr)
    return new Response(JSON.stringify({ error: candErr.message }), { status: 500 })
  }

  const profiles = (candidates || []) as Profile[]
  if (profiles.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: 'Keine Kandidaten' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const results: Array<{ userId: string; ok: boolean; error?: string }> = []

  for (const profile of profiles) {
    const userId = profile.id
    try {
      // E-Mail aus auth.users holen (noetig fuer Bestaetigungs-Mail)
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      const email = authUser?.user?.email ?? null

      // Cascade-Loeschung — FK-Reihenfolge
      await admin.from('notifications').delete().eq('user_id', userId)
      await admin
        .from('messages')
        .delete()
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      await admin
        .from('chat_messages')
        .delete()
        .eq('sender_id', userId)
      // care_eligibility-Delete entfernt: Tabelle existiert nicht (Phase 5).
      // documents-Tabelle EXISTIERT in Produktion (Migration
      // 20260804200000_create_documents_table.sql). Der Fehler darf hier
      // NICHT verschluckt werden: bleiben Dokumente stehen, waere die
      // Art.-17-DSGVO-Loeschung unvollstaendig — und der frueher gemeldete
      // Erfolg damit falsch. Bei Fehler brechen wir fuer diesen Nutzer ab,
      // bevor auth.users geloescht wird (sonst waeren die Dokumente
      // dauerhaft verwaist und nicht mehr zuordenbar).
      const { error: docErr } = await admin.from('documents').delete().eq('user_id', userId)
      if (docErr) {
        console.error('[hard-delete] documents-Delete fehlgeschlagen', userId, docErr.message)
        results.push({ userId, ok: false, error: `documents: ${docErr.message}` })
        continue
      }
      await admin.from('bookings').delete().eq('customer_id', userId)
      await admin.from('bookings').delete().eq('angel_id', userId)
      await admin.from('angels').delete().eq('id', userId)
      await admin.from('account_deletion_tokens').delete().eq('user_id', userId)
      await admin.from('profiles').delete().eq('id', userId)

      const { error: authErr } = await admin.auth.admin.deleteUser(userId)
      if (authErr) {
        console.error('[hard-delete] auth.deleteUser fail', userId, authErr)
        results.push({ userId, ok: false, error: authErr.message })
        continue
      }

      // Audit-Log-Eintrag (Tabelle: mis_audit_log, siehe lib/audit-log.ts)
      await admin.from('mis_audit_log').insert({
        action: 'user_hard_delete_cron',
        actor_id: null,
        actor_role: 'system',
        target_id: userId,
        target_email: email,
        entity_type: 'profile',
        entity_id: userId,
        details: {
          reason: 'grace_period_expired',
          grace_days: GRACE_DAYS,
          soft_deleted_at: profile.deleted_at,
          target_name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
        },
        ip_address: null,
        user_agent: 'supabase-edge/account-hard-delete',
      })

      // Bestaetigungs-Mail (fail-soft)
      if (email) {
        try {
          await sendHardDeletedEmail(
            email,
            profile.first_name ?? 'Sie'
          )
        } catch (mailErr) {
          console.error('[hard-delete] mail fail', userId, mailErr)
        }
      }

      results.push({ userId, ok: true })
    } catch (err: any) {
      console.error('[hard-delete] Exception fuer user', userId, err)
      results.push({ userId, ok: false, error: err?.message || 'unknown' })
    }
  }

  const ok = results.filter(r => r.ok).length
  const failed = results.length - ok

  return new Response(
    JSON.stringify({
      processed: results.length,
      ok,
      failed,
      results,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
})

// ── Mini-Mail-Versand via Resend REST API ──────────────────────────
// Wir koennen lib/emails/account-deletion.ts NICHT importieren (Edge =
// Deno, nicht Next). Also direkter fetch auf Resend.
async function sendHardDeletedEmail(email: string, firstName: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.log('[hard-delete] RESEND_API_KEY fehlt, skip mail')
    return
  }
  const subject = 'Dein AlltagsEngel-Konto wurde endgueltig geloescht'
  const html = `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F2EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:22px;font-weight:700;color:#1A1612;">Alltags<span style="color:#C9963C;">Engel</span></span>
  </div>
  <div style="background:#fff;border-radius:16px;padding:32px 28px;">
    <p style="color:#888;font-size:13px;margin:0 0 4px;">Hallo ${firstName},</p>
    <h2 style="color:#1A1612;font-size:20px;margin:8px 0 12px;">Konto endgueltig geloescht</h2>
    <p style="color:#444;font-size:14px;line-height:1.6;">
      Die 60-taegige Widerrufsfrist ist abgelaufen. Dein Konto und alle
      damit verknuepften Daten wurden gemaess DSGVO Art. 17 unwiderruflich
      geloescht.
    </p>
    <p style="color:#888;font-size:12px;margin-top:24px;">
      Audit-Log-Eintraege bleiben aus rechtlichen Gruenden (HGB §257, AO §147)
      erhalten, enthalten aber keine personenbezogenen Daten ausser einer
      pseudonymisierten User-ID.
    </p>
  </div>
  <div style="text-align:center;margin-top:24px;font-size:11px;color:#aaa;">
    <p>Alltagsengel UG (haftungsbeschraenkt) · Frankfurt am Main</p>
  </div>
</div></body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AlltagsEngel <info@alltagsengel.care>',
      to: email,
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API Fehler ${res.status}: ${body}`)
  }
}
