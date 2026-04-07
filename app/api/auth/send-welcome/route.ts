import { NextResponse } from 'next/server'
import { sendEmailNotification } from '@/lib/notifications'

/**
 * POST /api/auth/send-welcome
 * Sends a branded welcome/confirmation email to newly registered users via Resend.
 */
export async function POST(request: Request) {
  try {
    const { email, firstName, role } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'E-Mail erforderlich' }, { status: 400 })
    }

    const name = firstName || 'Nutzer'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

    const roleText = role === 'engel'
      ? 'als Alltagsengel'
      : role === 'fahrer'
        ? 'als Fahrer'
        : 'als Kunde'

    const nextSteps = role === 'engel'
      ? `
        <p>Ihre nächsten Schritte:</p>
        <ol style="color:#B8AC9C;padding-left:20px;">
          <li style="margin-bottom:8px;">Vervollständigen Sie Ihr Profil</li>
          <li style="margin-bottom:8px;">Laden Sie Ihre Qualifikationen hoch</li>
          <li style="margin-bottom:8px;">Warten Sie auf die Freischaltung durch unser Team</li>
        </ol>
      `
      : `
        <p>Ihre nächsten Schritte:</p>
        <ol style="color:#B8AC9C;padding-left:20px;">
          <li style="margin-bottom:8px;">Entdecken Sie unsere Alltagsbegleiter in Ihrer Nähe</li>
          <li style="margin-bottom:8px;">Buchen Sie Ihren ersten Termin</li>
          <li style="margin-bottom:8px;">Nutzen Sie Ihren Entlastungsbetrag (§45b SGB XI)</li>
        </ol>
      `

    await sendEmailNotification(
      email,
      name,
      'Willkommen bei AlltagsEngel!',
      `
        <p>Herzlich willkommen ${roleText} bei AlltagsEngel!</p>
        <p>Ihr Konto wurde erfolgreich erstellt. Sie können sich jetzt jederzeit anmelden.</p>
        ${nextSteps}
        <a href="${siteUrl}/auth/login" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">ZUR APP</a>
        <div style="background:#F0EBE0;border-radius:10px;padding:14px 18px;margin:16px 0;">
          <strong>Versicherungsschutz inklusive</strong><br/>
          Haftpflicht bis 5 Mio. € · Unfallversicherung · Sachschäden bis 50.000€
        </div>
        <p style="color:#888;font-size:12px;">Bei Fragen erreichen Sie uns unter info@alltagsengel.care</p>
      `
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-welcome error:', err)
    return NextResponse.json({ success: true })
  }
}
