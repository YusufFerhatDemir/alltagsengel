import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildRecoveryLink } from '@/lib/supabase/recovery-link'
import { sendEmailNotification } from '@/lib/notifications'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { authLogger as log } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * POST /api/auth/send-reset
 * Sends a custom password reset email via Resend.
 * First checks if user exists via profiles table, then generates recovery link.
 */
export const POST = withTracking(async function POST(request: Request) {
  try {
    // NIEDRIG-8 (Security-Audit 2026-08-19): ohne Limit liess sich ueber
    // diesen Endpunkt ein fremdes Postfach mit Reset-Mails fluten.
    // 3 Anfragen/10 min pro IP und zusaetzlich pro Ziel-Adresse.
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`send-reset:ip:${ip}`, 5, 600_000))) {
      return NextResponse.json({ success: true })
    }

    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'E-Mail erforderlich' }, { status: 400 })
    }
    if (!(await rateLimitPersistent(`send-reset:mail:${String(email).toLowerCase()}`, 3, 600_000))) {
      // Stille Annahme — kein Hinweis darauf, ob die Adresse existiert.
      return NextResponse.json({ success: true })
    }

    const supabase = createAdminClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

    // Check if user exists via profiles table (avoid creating phantom users)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name')
      .eq('email', email)
      .single()

    if (!profile) {
      // User doesn't exist — return success anyway (don't reveal)
      return NextResponse.json({ success: true })
    }

    const userName = profile.first_name || 'Nutzer'

    // Generate a recovery link via admin API.
    // AUTH-010: Supabase-Default für Recovery-Links ist 24h — viel zu lang.
    // Ein Angreifer, der nur kurz Postfach-Zugriff bekommt (Leih-Laptop,
    // Phishing-Link, Session-Hijack im Mail-Client), hat sonst einen ganzen
    // Tag Zeit. Wir senken auf 1h. Falls Supabase-Dashboard-Setting das
    // global härtet, ist das hier zusätzliche Defense-in-Depth.
    // FIX (2026-05-28): redirectTo direkt auf /auth/reset-password — die Reset-Page
    // handhabt PKCE-Code, Hash-Flow UND PASSWORD_RECOVERY-Event selbst. Der frühere
    // Umweg über /auth/callback hat dazu geführt, dass die Callback-Route bei
    // Recovery-Links die rollenbasierte Weiterleitung griff und User auf der
    // Startseite / im Kunde-Home landeten statt im Passwort-Setzen-Flow.
    // (Frau Eßer hat genau das gemeldet: "ich komme nur zur Startseite")
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl}/auth/reset-password`,
      },
    })
    // Hinweis: Supabase nimmt `expiresIn` aktuell NICHT an `generateLink`
    // entgegen — das Feld muss auf Dashboard-Ebene gesetzt werden (Auth →
    // URL Configuration → Email Link Expiry). Siehe SENTRY_SETUP.md →
    // Follow-up in SUPABASE_AUTH_HARDENING.md.
    //
    // NIEDRIG-6 (Security-Audit 2026-08-19): Die Mail nannte frueher „nur
    // 1 Stunde gueltig". Diese Zusage konnte der Code nicht einloesen — der
    // Supabase-Default sind 24 h, und ob das Dashboard-Setting gesetzt ist,
    // laesst sich aus der Anwendung heraus nicht auslesen. Der Text nennt
    // deshalb keine konkrete Dauer mehr, sondern die belegbare Eigenschaft:
    // begrenzt gueltig und einmal verwendbar (das Token wird von verifyOtp
    // verbraucht). Sobald das Dashboard-Setting nachweislich auf 1 h steht,
    // kann hier wieder eine konkrete Dauer stehen.

    if (error) {
      log.error('generateLink recovery error', { errorMessage: error.message })
      return NextResponse.json({ success: true })
    }

    // Send branded email via Resend
    // FIX (2026-07-15): NICHT `properties.action_link` verlinken. Der Supabase-
    // /verify-Endpoint leitet mit Implicit-Tokens im URL-Fragment weiter, was
    // unser Browser-Client (flowType 'pkce') ablehnt → "Link abgelaufen" sofort
    // beim Klicken. Wir verlinken direkt auf unsere Seite und lösen das Token
    // dort per verifyOtp ein. Details: lib/supabase/recovery-link.ts
    if (data?.properties?.hashed_token) {
      const resetLink = buildRecoveryLink(siteUrl, data.properties.hashed_token)
      await sendEmailNotification(
        email,
        userName,
        'Passwort zurücksetzen — Alltagsengel',
        `
          <p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
          <p>Klicken Sie auf den folgenden Button, um ein neues Passwort festzulegen:</p>
          <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">PASSWORT ZURÜCKSETZEN</a>
          <p style="color:#888;font-size:12px;margin-top:16px;">Dieser Link ist aus Sicherheitsgründen nur begrenzte Zeit gültig und lässt sich nur einmal verwenden. Fordern Sie einfach einen neuen an, falls er nicht mehr funktioniert. Wenn Sie kein neues Passwort angefordert haben, können Sie diese E-Mail ignorieren.</p>
        `
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    log.errorWithException('send-reset error', err)
    return NextResponse.json({ success: true })
  }
})
