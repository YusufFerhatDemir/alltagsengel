import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { sendEmailNotification } from '@/lib/notifications'

/**
 * POST /api/auth/send-reset
 * Sends a custom password reset email via Resend.
 * Uses Supabase admin API to generate recovery link, then sends branded email.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'E-Mail erforderlich' }, { status: 400 })
    }

    const supabase = createClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

    // Generate a recovery link via admin API
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
      },
    })

    if (error) {
      console.error('generateLink recovery error:', error)
      // Fallback: use Supabase built-in reset (may fail for non-team emails)
      const { error: resetError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
        },
      })
      if (resetError) {
        // Don't reveal whether the email exists
        return NextResponse.json({ success: true })
      }
    }

    // Send via Resend
    if (data?.properties?.action_link) {
      const resetLink = data.properties.action_link
      const sent = await sendEmailNotification(
        email,
        'Nutzer',
        'Passwort zurücksetzen — AlltagsEngel',
        `
          <p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
          <p>Klicken Sie auf den folgenden Button, um ein neues Passwort festzulegen:</p>
          <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">PASSWORT ZURÜCKSETZEN</a>
          <p style="color:#888;font-size:12px;margin-top:16px;">Dieser Link ist 24 Stunden gültig. Wenn Sie kein neues Passwort angefordert haben, können Sie diese E-Mail ignorieren.</p>
        `
      )

      if (sent) {
        return NextResponse.json({ success: true, method: 'custom' })
      }
    }

    // Always return success (don't reveal if email exists)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-reset error:', err)
    // Always return success for security
    return NextResponse.json({ success: true })
  }
}
