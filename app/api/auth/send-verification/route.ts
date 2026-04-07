import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { sendEmailNotification } from '@/lib/notifications'

/**
 * POST /api/auth/send-verification
 * Sends a custom verification email via Resend when Supabase's built-in email fails.
 * This generates a magic link that confirms the user's email when clicked.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'E-Mail erforderlich' }, { status: 400 })
    }

    const supabase = createClient()

    // Generate a magic link for email verification
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'}/auth/callback`,
      },
    })

    if (error) {
      console.error('generateLink error:', error)
      // Try resend approach as fallback
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'}/auth/callback`,
        },
      })
      if (resendError) {
        return NextResponse.json({ error: 'Konnte keine Bestätigungs-E-Mail senden' }, { status: 500 })
      }
      return NextResponse.json({ success: true, method: 'resend' })
    }

    // Send via Resend (our own email service)
    if (data?.properties?.action_link) {
      const verifyLink = data.properties.action_link
      const sent = await sendEmailNotification(
        email,
        'Nutzer',
        'Bitte bestätigen Sie Ihre E-Mail-Adresse',
        `
          <p>Vielen Dank für Ihre Registrierung bei AlltagsEngel!</p>
          <p>Bitte klicken Sie auf den folgenden Link, um Ihre E-Mail-Adresse zu bestätigen:</p>
          <a href="${verifyLink}" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">E-MAIL BESTÄTIGEN</a>
          <p style="color:#888;font-size:12px;margin-top:16px;">Wenn Sie sich nicht registriert haben, können Sie diese E-Mail ignorieren.</p>
        `
      )

      if (sent) {
        return NextResponse.json({ success: true, method: 'custom' })
      }
    }

    return NextResponse.json({ error: 'E-Mail-Versand fehlgeschlagen' }, { status: 500 })
  } catch (err) {
    console.error('send-verification error:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
