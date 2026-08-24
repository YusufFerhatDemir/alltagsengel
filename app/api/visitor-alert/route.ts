import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { escapeHtml, getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { logger } from '@/lib/logger'
const log = logger.child('api:visitor-alert')

// Einzeiler + Längen-Cap für Felder, die in E-Mail-HTML landen.
// Verhindert HTML-/Link-Injection (der Endpunkt ist bewusst anonym aufrufbar,
// daher MUSS jedes vom Client kommende Feld escaped werden) sowie CR/LF im Subject.
function safeField(v: unknown, max = 120): string {
  return escapeHtml(String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max))
}

// Überwachte Stadtteile & PLZ
const WATCHED_CITIES = [
  'nordend',       // Nordend Ost + West
  'nordend ost',
  'nordend west',
  'stadtallendorf',
  'alsfeld',
  'marburg',
]

// Überwachte Postleitzahlen
const WATCHED_POSTAL_CODES = [
  '60318', '60320', '60322', // Frankfurt Nordend
  '35260',                   // Stadtallendorf
  '36304',                   // Alsfeld
  '35037',                   // Marburg
]

// Eigene IPs ausschließen (aus Env-Variable laden)
const EXCLUDED_IPS = (process.env.EXCLUDED_TRACKING_IPS || '').split(',').filter(Boolean)

const ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || ''

// Cooldown: maximal 1 E-Mail pro Stunde pro gemeldeter IP.
// B-2 (Master-Audit 2026-08-19): frueher eine Map im Modul-Scope, also
// pro Serverless-Instanz. Jetzt instanzuebergreifend in der Datenbank.
const COOLDOWN_MS = 3_600_000

export async function POST(req: NextRequest) {
  try {
    // NIEDRIG-8 (Security-Audit 2026-08-19): der Endpunkt ist bewusst anonym
    // aufrufbar und loest Admin-Mails aus. Ohne Limit ist er eine Spam-Schleuder
    // (der Cooldown weiter unten greift erst nach dem DB-Lesezugriff und nur
    // pro gemeldeter — also frei waehlbarer — IP aus dem Body).
    // B-2 (Master-Audit 2026-08-19): instanzuebergreifend statt In-Memory —
    // sonst startet jede neue Serverless-Instanz mit leerem Zaehler.
    const aufruferIp = getClientIp(req)
    if (!(await rateLimitPersistent(`visitor-alert:ip:${aufruferIp}`, 20, 60_000))) {
      return NextResponse.json({ ok: true })
    }

    const { ip, city, region, page, userAgent, postalCode, isp: bodyIsp, district } = await req.json()
    if (!ip) return NextResponse.json({ ok: true })

    // Eigene IPs ignorieren
    if (EXCLUDED_IPS.some(ex => ip.startsWith(ex))) {
      return NextResponse.json({ ok: true })
    }

    // Prüfe ob Stadtteil, PLZ oder District überwacht wird
    const cityLower = (city || '').toLowerCase()
    const districtLower = (district || '').toLowerCase()
    const isWatchedCity = WATCHED_CITIES.some(w => cityLower.includes(w) || districtLower.includes(w))
    const isWatchedPLZ = postalCode && WATCHED_POSTAL_CODES.includes(postalCode)
    const isWatched = isWatchedCity || isWatchedPLZ
    if (!isWatched) return NextResponse.json({ ok: true })

    // Cooldown prüfen (1 Stunde pro gemeldeter IP) — ebenfalls persistent.
    const ipPrefix = ip.substring(0, 20)
    if (!(await rateLimitPersistent(`visitor-alert:cooldown:${ipPrefix}`, 1, COOLDOWN_MS))) {
      return NextResponse.json({ ok: true, cooldown: true })
    }

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

    // ISP: bevorzugt ip-api Daten, Fallback auf IP-Prefix
    let isp = bodyIsp || 'Unbekannt'
    if (isp === 'Unbekannt') {
      if (ip.startsWith('2a02:3037')) isp = 'Vodafone Kabel Deutschland'
      else if (ip.startsWith('2003:')) isp = 'Deutsche Telekom'
      else if (ip.startsWith('2a00:20')) isp = 'Deutsche Telekom (Mobilfunk)'
      else if (ip.startsWith('93.')) isp = 'Deutsche Telekom (DSL)'
    }

    // Letzte Besuche dieser IP laden
    const supabase = createAdminClient()
    // MITTEL-2: Besuchshistorie nur aus der eigenen Organisation.
    const organizationId = await getActiveOrgIdOrDefault()
    const { data: recentVisits } = await supabase
      .from('visitor_locations')
      .select('page_path, created_at')
      .eq('organization_id', organizationId)
      .like('ip_address', `${ipPrefix.replace(/[%_\\]/g, '\\$&')}%`)
      .order('created_at', { ascending: false })
      .limit(10)

    const visitHistory = (recentVisits || [])
      .map(v => `• ${new Date(v.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} → ${safeField(v.page_path, 200)}`)
      .join('\n')

    const totalVisits = recentVisits?.length || 0

    // ═══ Alle client-gelieferten Felder für E-Mail-HTML escapen (Anti-Injection) ═══
    const sCity = safeField(city || 'Unbekannt')
    const sDistrict = district ? ' — ' + safeField(district) : ''
    const sRegion = region ? ', ' + safeField(region) : ''
    const sPage = safeField(page || '/', 200)
    const sPostal = safeField(postalCode || '—', 20)
    const sIsp = safeField(isp)
    const sIp = safeField(ip, 60)
    const sDevice = safeField(device, 40) + (iosVersion ? ' (iOS ' + safeField(iosVersion, 12) + ')' : '')

    // E-Mail senden via Resend
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })

      // Antwort MUSS geprueft werden: fetch wirft nur bei Netzfehlern,
      // eine Ablehnung von Resend (401, 422, 429) kommt als HTTP-Status
      // zurueck und sah bisher wie ein erfolgreicher Versand aus.
      // Zeitlimit, damit ein haengender Aufruf nicht die ganze
      // Serverless-Funktion blockiert.
      const alertAntwort = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Alltagsengel Alert <alert@alltagsengel.care>',
          to: [ALERT_EMAIL],
          subject: `🚨 Visitor Alert: ${sCity} — ${sDevice}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1612;color:#F7F2EA;padding:24px;border-radius:16px;">
              <h2 style="color:#C9963C;margin:0 0 16px;">🚨 Überwachter Besucher ist online!</h2>

              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Zeitpunkt</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${now}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Aktuelle Seite</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${sPage}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Ort / Stadtteil</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${sCity}${sDistrict}${sRegion}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">PLZ</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${sPostal}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Gerät</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${sDevice}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">Internet-Anbieter</td><td style="padding:8px;border-bottom:1px solid #332E24;font-weight:bold;">${sIsp}</td></tr>
                <tr><td style="padding:8px;color:#A89C8C;border-bottom:1px solid #332E24;">IP-Adresse</td><td style="padding:8px;border-bottom:1px solid #332E24;font-size:12px;">${sIp}</td></tr>
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
      }).catch(() => null)

      if (!alertAntwort || !alertAntwort.ok) {
        // Nur der Status, kein Antwortkoerper: der koennte den Schluessel
        // widerspiegeln. Der Besucher-Alarm ist ein internes Signal —
        // ein Fehlschlag darf den Aufruf nicht kippen, muss aber sichtbar
        // sein statt still zu verschwinden.
        log.warn('Visitor-Alert-Mail nicht versendet', {
          status: alertAntwort?.status ?? 'Netzwerkfehler/Zeitlimit',
        })
      }
    }

    // In-App Notification — nur Stamm-Org-Admins (Multi-Mandant-sicher)
    const STAMM_ORG_ID = '00000000-0000-4000-8000-000460629986'
    const { data: admins } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', STAMM_ORG_ID)
      .in('role', ['admin', 'owner'])

    if (admins) {
      const notifs = admins.map(a => ({
        user_id: a.user_id,
        type: 'system',
        title: `🚨 Besucher-Alert: ${city || 'Unbekannt'}`,
        body: `${device} aus ${city || 'Unbekannt'}${postalCode ? ' (PLZ ' + postalCode + ')' : ''} — ${isp} — auf ${page || '/'}`,
        link: '/mis/analytics',
      }))
      await supabase.from('notifications').insert(notifs)
    }

    return NextResponse.json({ ok: true, alerted: true })
  } catch (err: any) {
    log.errorWithException('Visitor alert error', err)
    return NextResponse.json({ ok: true })
  }
}
