import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailNotification } from '@/lib/notifications'
import { validatePassword, isCommonPassword } from '@/lib/password-validation'

export async function POST(request: NextRequest) {
  try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile?.role || !['admin', 'superadmin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Keine Admin-Berechtigung' }, { status: 403 })
  }

  const { userId, newPassword, email, sendNotification } = await request.json()

  if ((!userId && !email) || !newPassword) {
    return NextResponse.json({ error: 'userId/email und newPassword erforderlich' }, { status: 400 })
  }

  // Strenge Passwort-Validierung (gleiche Regeln wie bei Registrierung)
  const passwordCheck = validatePassword(newPassword)
  if (!passwordCheck.valid) {
    return NextResponse.json({
      error: 'Passwort zu schwach: ' + passwordCheck.errors.join(', ')
    }, { status: 400 })
  }
  if (isCommonPassword(newPassword)) {
    return NextResponse.json({
      error: 'Dieses Passwort ist zu häufig und unsicher'
    }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Wenn email statt userId übergeben wurde → userId per E-Mail finden
  let targetUserId = userId
  if (!targetUserId && email) {
    const { data: users } = await adminSupabase.auth.admin.listUsers()
    const found = users?.users?.find((u: any) => u.email === email)
    if (!found) {
      return NextResponse.json({ error: 'Benutzer nicht gefunden: ' + email }, { status: 404 })
    }
    targetUserId = found.id
  }

  // Prevent admins from resetting other admins' passwords (only superadmin can)
  const { data: targetProfile } = await adminSupabase.from('profiles').select('role').eq('id', targetUserId).single()
  if (targetProfile?.role && ['admin', 'superadmin'].includes(targetProfile.role) && profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Nur Superadmins können Admin-Passwörter zurücksetzen' }, { status: 403 })
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(targetUserId, {
    password: newPassword,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Optionale E-Mail-Benachrichtigung an den Benutzer senden
  if (sendNotification) {
    const { data: targetUser } = await adminSupabase
      .from('profiles')
      .select('email, first_name')
      .eq('id', targetUserId)
      .single()

    if (targetUser?.email) {
      await sendEmailNotification(
        targetUser.email,
        targetUser.first_name || 'Nutzer',
        'Ihr Passwort wurde zurückgesetzt — AlltagsEngel',
        `
          <p>Ihr Passwort wurde von unserem Team zurückgesetzt.</p>
          <div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:18px 20px;margin:20px 0;">
            <p style="font-weight:600;color:#C9963C;margin:0 0 8px;">Ihre neuen Zugangsdaten:</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">E-Mail</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${targetUser.email}</td></tr>
              <tr><td style="padding:8px 12px;color:#888;">Passwort</td><td style="padding:8px 12px;font-weight:600;font-family:monospace;font-size:16px;">${newPassword}</td></tr>
            </table>
          </div>
          <p>Bitte ändern Sie Ihr Passwort nach dem ersten Login in Ihrem Profil.</p>
          <a href="https://alltagsengel.care/auth/login" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">JETZT EINLOGGEN</a>
          <p style="margin-top:20px;color:#888;">Liebe Grüße,<br/><strong style="color:#C9963C;">Ihr Alltagsengel Team</strong></p>
        `
      )
    }
  }

  return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: err.message || 'Fehler beim Zurücksetzen des Passworts' }, { status: 500 })
  }
}
