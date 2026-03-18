import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Überwachte Stadtteile — PLZ 60320 = Nordend Ost + West
const WATCHED_CITIES = [
  'nordend',       // Nordend Ost + West
  'nordend ost',
  'nordend west',
]

// Eigene IPs ausschließen (Yusuf)
const EXCLUDED_IPS = [
  '93.203.33.115',           // Yusuf Nordend Ost
  '217.88.144.184',          // Yusuf Hansaallee/Telekom
]

const ALERT_EMAIL = 'y.r.demir2022@gmail.com'

// Cooldown: maximal 1 E-Mail pro Stunde pro IP
const lastAlerts = new Map<string, number>()

export async function POST(req: NextRequest) {
  try {
    const { ip, city, region, page, userAgent } = await req.json()
    if (!ip) return NextResponse.json({ ok: true })

    // Eigene IPs ignorieren
    if (EXCLUDED_IPS.some(ex => ip.startsWith(ex))) {
      return NextResponse.json({ ok: true })
    }

    // Prüfe ob Stadtteil überwacht wird (Nordend = PLZ 60320)
    const cityLower = (city || '').toLowerCase()
    const isWatched = WATCHED_CITIES.some(w => cityLower.includes(w))
    if (!isWatched) return NextResponse.json({ ok: true })

    // Cooldown prüfen (1 Stunde pro IP)
    const ipPrefix = ip.substring(0, 20)
    const lastAlert = lastAlerts.get(ipPrefix)
    if (lastAlert && Date.now() - lastAlert < 3600000) {
      return NextResponse.json({ ok: true, cooldown: true })
    }
    lastAlerts.set(ipPrefix, Date.now())

    // Gerät-Info aus User-Agent
    let device = 'Unbekannt'
    if (userAgent?.includes('iPhone')) device = 'iPhone'
    else if (userAgent?.includes('Android')) device = 'Android'
    else if (userAgent?.includes('iPad')) device = 'iPad'
    else if (userAgent?.includes('Mac')) device = 'Mac'
    else if (userAgent?.includes('Windows')) device = 'Windows PC'

    // iOS Version
    const iosMatch = userAgent?.match(/iPhone OS (\d+_\d+)/)
    const iosVersion = iosMatch ? iosMatch[1].replace('_', '.') : ''

    // ISP aus IP-Prefix
    let isp = 'Unbekannt'
    if (ip.startsWith('2a02:3037')) isp = 'Vodafone Kabel Deutschland'
    else if (ip.startsWith('2003:')) isp = 'Deutsche Telekom'
    else if (ip.startsWith('2a00:20')) isp = 'Deutsche Telekom (Mobilfunk)'
    else if (ip.startsWith('93.')) isp = 'Deutsche Telekom (DSL)'

    // Letzte Besuche dieser IP laden
    const supabase = createAdminClient()
    const { data: recentVisits } = await supabase
      .from('visitor_locations')
      .select('page_path, created_at')
      .like('ip_address', `${ipPrefix}%`)
      .order('created_at', { ascending: false })
      .limit(10)

    const visitHistory = (recentVisits || [])
      .map(v => `• ${new Date(v.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} → ${v.page_path}`)
      .join('\n')

    const totalVisits = recentVisits?.length || 0

    // E-Mail senden via Resend
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AlltagsEngel Alert <alert@alltagsengel.care>',
          to: [ALERT_EMAIL],
          subject: `🚨 Visitor Alert: ${city || 'Unbekannt'} — ${device}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1612;color:#F7F2EA;padding:24px;border-radius:16px;">
              <h2 style="color:#C9963C;margin:0 0 16px;">🚨 Überwachter Besucher ist online!</h2>

              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Zeitpunkt</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${now}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Aktuelle Seite</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${page || '/'}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Stadtteil</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${city || 'Unbekannt'}${region ? ', ' + region : ''}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Gerät</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${device}${iosVersion ? ' (iOS ' + iosVersion + ')' : ''}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Internet-Anbieter</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${isp}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">IP-Adresse</td><td style="padding:8px;border-bottom:1px solid #332E24;font-size:12px;">${ip}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Bisherige Besuche</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${totalVisits}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Registriert?</td><td style="padding:8px;border-bottom:1px solid #332E24;color:#D04B3B;font-weight:bold;">❌ Nein</td></tr>
              </table>

              <h3 style="color:#C9963C;margin:24px 0 8px;">Letzte Besuche:</h3>
              <pre style="background:#252118;padding:12px;border-radius:8px;font-size:12px;line-height:1.6;overflow-x:auto;">${visitHistory || 'Keine früheren Besuche'}</pre>

              <p style="color:#A89C8C;font-size:12px;margin-top:24px;">
                ⚠️ Genaue Adresse (Straße) kann aus IP-Daten nicht ermittelt werden — nur Stadtteil-Ebene.<br>
                Diese E-Mail wird max. 1x pro Stunde gesendet.
              </p>
            </div>
          `,
        }),
      })
    }

    // Auch In-App Notification
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'superadmin'])

    if (admins) {
      const notifs = admins.map(a => ({
        user_id: a.id,
        type: 'system',
        title: `🚨 Besucher-Alert: ${city || 'Unbekannt'}`,
        body: `${device} aus ${city || 'Unbekannt'} (${isp}) ist gerade auf ${page || '/'}`,
        link: '/mis/analytics',
      }))
      await supabase.from('notifications').insert(notifs)
    }

    return NextResponse.json({ ok: true, alerted: true })
  } catch (err: any) {
    console.error('Visitor alert error:', err)
    return NextResponse.json({ ok: true })
  }
}
