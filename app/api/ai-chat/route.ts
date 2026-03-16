import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Rate limiter: max 10 requests per minute per user
const rateLimit = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimit.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + 60000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

// Live-Daten aus Supabase holen
async function fetchLiveContext(): Promise<string> {
  try {
    const supabase = await createClient()

    // Parallel queries
    const [usersRes, bookingsRes, visitorsRes, loginsRes, engelsRes, kundenRes, fahrerRes] = await Promise.all([
      supabase.from('profiles').select('id, role, full_name, city, created_at').limit(100),
      supabase.from('bookings').select('id, status, created_at, total_price, service_type').limit(100),
      supabase.from('visitor_locations').select('city, country, page_path, created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('mis_auth_log').select('user_email, action, device, created_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('profiles').select('id').eq('role', 'engel'),
      supabase.from('profiles').select('id').eq('role', 'kunde'),
      supabase.from('profiles').select('id').eq('role', 'fahrer'),
    ])

    const users = usersRes.data || []
    const bookings = bookingsRes.data || []
    const visitors = visitorsRes.data || []
    const logins = loginsRes.data || []

    const totalUsers = users.length
    const totalEngels = engelsRes.data?.length || 0
    const totalKunden = kundenRes.data?.length || 0
    const totalFahrer = fahrerRes.data?.length || 0
    const totalBookings = bookings.length
    const completedBookings = bookings.filter(b => b.status === 'completed').length
    const pendingBookings = bookings.filter(b => b.status === 'pending').length
    const totalRevenue = bookings.reduce((sum, b) => sum + (Number(b.total_price) || 0), 0)

    // Visitor Städte
    const cityCounts: Record<string, number> = {}
    visitors.forEach(v => {
      if (v.city) cityCounts[v.city] = (cityCounts[v.city] || 0) + 1
    })
    const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)

    // Visitor Länder
    const countryCounts: Record<string, number> = {}
    visitors.forEach(v => {
      if (v.country) countryCounts[v.country] = (countryCounts[v.country] || 0) + 1
    })

    // Letzte Logins
    const recentLogins = logins.slice(0, 10).map(l =>
      `${l.user_email} (${l.device}, ${new Date(l.created_at).toLocaleString('de-DE')})`
    ).join('\n')

    return `
=== LIVE DATEN AUS DER DATENBANK (Stand: ${new Date().toLocaleString('de-DE')}) ===

BENUTZER:
- Gesamt: ${totalUsers}
- Engel (Alltagsbegleiter): ${totalEngels}
- Kunden: ${totalKunden}
- Fahrer: ${totalFahrer}
- Admins: ${totalUsers - totalEngels - totalKunden - totalFahrer}

BUCHUNGEN:
- Gesamt: ${totalBookings}
- Abgeschlossen: ${completedBookings}
- Ausstehend: ${pendingBookings}
- Gesamtumsatz: €${totalRevenue.toFixed(2)}

BESUCHER (letzte 50):
- Top-Städte: ${topCities.map(([c, n]) => `${c} (${n})`).join(', ')}
- Länder: ${Object.entries(countryCounts).map(([c, n]) => `${c} (${n})`).join(', ')}

LETZTE LOGINS:
${recentLogins}

REGISTRIERTE BENUTZER:
${users.map(u => `- ${u.full_name || 'Unbekannt'} (${u.role}, ${u.city || 'Ort unbekannt'}, seit ${new Date(u.created_at).toLocaleDateString('de-DE')})`).join('\n')}
`
  } catch (error) {
    console.error('Error fetching live context:', error)
    return '(Live-Daten konnten nicht geladen werden)'
  }
}

const SYSTEM_PROMPT = `Du bist der KI-Assistent von AlltagsEngel — einer digitalen Plattform für Premium-Alltagsbegleitung für Senioren und Pflegebedürftige in Deutschland.

ÜBER ALLTAGSENGEL:
- Digitale Plattform, die zertifizierte Alltagsbegleiter (genannt "Engel") mit pflegebedürftigen Senioren (Kunden) verbindet
- Abrechnung über §45b SGB XI Entlastungsbetrag (€131/Monat pro Person, seit 2026)
- Sitz: Frankfurt am Main
- Gründer: Yusuf Ferhat Demir
- Status: Seed-Phase / Early Stage Startup

GESCHÄFTSMODELL:
- Abrechnungssatz an Pflegekasse: €32-35/Std
- Feste Vergütung an Engel: €20/Std
- Plattform-Marge: ~€15/Std (~43% Bruttomarge)
- Ø 3 Stunden pro Kunde/Monat → €45 Marge pro Kunde/Monat
- CAC: €35 | LTV: €1.080 | LTV/CAC: 30,9x
- Payback: 0,8 Monate

MARKT:
- TAM: €50 Mrd. (gesamter Pflegemarkt Deutschland)
- SAM: €7,80 Mrd. (§45b Entlastungsbetrag, 4,96M Berechtigte × €131 × 12)
- ~60% des Budgets bleibt ungenutzt (€4,68 Mrd.)
- Zusätzlich: Krankenfahrten-Vermittlung (€3 Mrd. Markt)

5-JAHRES-PROGNOSE:
- 2026: €390K Umsatz, 500 Nutzer
- 2027: €1,96M, 2.500 Nutzer (Break-Even Q3)
- 2028: €7,89M, 10.000 Nutzer
- 2029: €28,1M, 36.000 Nutzer
- 2030: €58,5M, 75.000 Nutzer

SEED-RUNDE:
- Ziel: €500K bei €2,5M Pre-Money
- Burn Rate: ~€12K/Monat
- Runway: ~42 Monate

ISO 9001 QMS:
- 10 definierte Prozesse (4 Kern, 2 Support, 4 Management)
- Aufbauphase, Zertifizierungsziel Q4 2026

WETTBEWERBER:
- Careship: Plattform, aber keine §45b-Integration
- Pflege.de: Nur Vermittlung, nicht digital
- Home Instead: Premium, wenig digital

DEINE ROLLE:
- Du hast Zugriff auf LIVE-Daten aus der Supabase-Datenbank (Benutzer, Buchungen, Besucher, Logins)
- Antworte auf Deutsch, professionell aber freundlich
- Nutze die Live-Daten um konkrete, aktuelle Antworten zu geben
- Wenn nach Zahlen gefragt wird, nutze die echten Daten
- Gib konkrete Empfehlungen und Analysen
- Du kannst Berichte erstellen, Daten analysieren, Trends erkennen
- Formatiere Antworten übersichtlich mit Aufzählungen und Emojis`

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    // Rate limiting
    if (!checkRateLimit(user.id)) {
      return NextResponse.json({ error: 'Zu viele Anfragen. Bitte warten Sie eine Minute.' }, { status: 429 })
    }

    const { messages } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API-Key nicht konfiguriert.' },
        { status: 500 }
      )
    }

    // Live-Daten laden
    const liveContext = await fetchLiveContext()

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + '\n\n' + liveContext },
          ...messages.slice(-10), // Letzte 10 Nachrichten für Kontext
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI API Error:', err)
      return NextResponse.json(
        { error: 'KI-Service vorübergehend nicht verfügbar.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.'

    return NextResponse.json({ content })
  } catch (error) {
    console.error('AI Chat error:', error)
    return NextResponse.json(
      { error: 'Ein Fehler ist aufgetreten.' },
      { status: 500 }
    )
  }
}
