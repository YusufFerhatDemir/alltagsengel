import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailNotification } from '@/lib/notifications'
import { validatePasswordAsync } from '@/lib/password-validation'

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

  // Strenge Passwort-Validierung (AUTH-011: zxcvbn + Regex)
  // userInputs: E-Mail-Prefix + Marke, damit typische Treffer wie
  // „Alltagsengel2024!" auf Server-Seite verlässlich blockiert werden.
  const passwordCheck = await validatePasswordAsync(newPassword, [
    email || '',
    (email || '').split('@')[0] || '',
    'Alltagsengel',
    'alltagsengel',
  ])
  if (!passwordCheck.valid) {
    return NextResponse.json({
      error: 'Passwort zu schwach: ' + passwordCheck.errors.join(', ')
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
    // AUTH-002 Fix: Supabase-Error-Message nicht nach außen leaken (kann Enumeration / Credentials enthüllen)
    console.error('updateUserById error:', { code: (error as any)?.code, name: error?.name, status: (error as any)?.status })
    return NextResponse.json({ error: 'Passwort konnte nicht gesetzt werden' }, { status: 500 })
  }

  // AUTH-001 + AUTH-004 Fix: Klartext-Passwort NIE per E-Mail senden.
  // Stattdessen Recovery-Link senden, über den der User sein Passwort selbst HTTPS-verschlüsselt neu setzt.
  // Das temporär gesetzte Passwort dient nur als Platzhalter, bis der User den Link nutzt.
  if (sendNotification) {
    const { data: targetUser } = await adminSupabase
      .from('profiles')
      .select('email, first_name')
      .eq('id', targetUserId)
      .single()

    if (targetUser?.email) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

      // Recovery-Link generieren (1-Time-Use, kurze Lebensdauer via Supabase-Dashboard-Config)
      const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: 'recovery',
        email: targetUser.email,
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
        },
      })

      if (linkError || !linkData?.properties?.action_link) {
        console.error('generateLink error in admin reset:', { code: (linkError as any)?.code, name: linkError?.name })
        // Wir sagen dem Admin Success, weil das PW bereits gesetzt wurde — User kann sich manuell mitteilen lassen
      } else {
        await sendEmailNotification(
          targetUser.email,
          targetUser.first_name || 'Nutzer',
          'Ihr Passwort wurde zurückgesetzt — AlltagsEngel',
          `
            <p>Ihr Passwort wurde auf Ihre Anfrage hin von unserem Team zurückgesetzt.</p>
            <p>Aus Sicherheitsgründen senden wir Ihnen <strong>kein Klartext-Passwort</strong> per E-Mail.
               Klicken Sie stattdessen auf den folgenden Button, um Ihr neues Passwort direkt in der App selbst zu setzen:</p>
            <a href="${linkData.properties.action_link}" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">PASSWORT JETZT FESTLEGEN</a>
            <p style="color:#888;font-size:12px;margin-top:16px;">Dieser Link ist aus Sicherheitsgründen nur begrenzt gültig.
               Wenn Sie keine Passwort-Änderung angefordert haben, wenden Sie sich bitte umgehend an unseren Support.</p>
            <p style="margin-top:20px;color:#888;">Liebe Grüße,<br/><strong style="color:#C9963C;">Ihr Alltagsengel Team</strong></p>
          `
        )
      }
    }
  }

  return NextResponse.json({ success: true })
  } catch (err: any) {
    // AUTH-002 Fix: Rohe Error-Objekte niemals loggen — können API-Keys / Headers enthalten
    console.error('reset-password error:', { code: err?.code, name: err?.name, status: err?.status })
    return NextResponse.json({ error: 'Fehler beim Zurücksetzen des Passworts' }, { status: 500 })
  }
}
