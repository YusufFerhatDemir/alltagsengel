import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailNotification } from '@/lib/notifications'

/**
 * POST /api/auth/send-reset
 * Sends a custom password reset email via Resend.
 * First checks if user exists via profiles table, then generates recovery link.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'E-Mail erforderlich' }, { status: 400 })
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
      return NextResponse.json({ success: true })
    }

    // Send branded email via Resend
    if (data?.properties?.action_link) {
      const resetLink = data.properties.action_link
      await sendEmailNotification(
        email,
        userName,
        'Passwort zurücksetzen — AlltagsEngel',
        `
          <p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
          <p>Klicken Sie auf den folgenden Button, um ein neues Passwort festzulegen:</p>
          <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">PASSWORT ZURÜCKSETZEN</a>
          <p style="color:#888;font-size:12px;margin-top:16px;">Dieser Link ist 24 Stunden gültig. Wenn Sie kein neues Passwort angefordert haben, können Sie diese E-Mail ignorieren.</p>
        `
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-reset error:', err)
    return NextResponse.json({ success: true })
  }
}
