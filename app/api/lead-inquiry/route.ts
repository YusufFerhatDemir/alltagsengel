import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// LEAD INQUIRY API — Beratungsanfrage speichern
// ═══════════════════════════════════════════════════════════
// Speichert Anfragen vom Lead-Formular in Supabase.
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { name, phone, plz, message, service, source, utm_source } = await request.json()

    if (!name || !phone || !plz) {
      return NextResponse.json(
        { error: 'Pflichtfelder fehlen (Name, Telefon, PLZ)' },
        { status: 400 }
      )
    }

    // PLZ-Format prüfen (5-stellig, nur Ziffern)
    if (!/^[0-9]{5}$/.test(plz)) {
      return NextResponse.json(
        { error: 'Ungültige Postleitzahl' },
        { status: 400 }
      )
    }

    const { error: dbError } = await supabaseAdmin
      .from('lead_inquiries')
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        plz: plz.trim(),
        message: message?.trim() || null,
        service: service?.trim() || null,
        source: source || 'website',
        utm_source: utm_source?.trim() || null,
      })

    if (dbError) {
      console.error('[LeadInquiry] DB Fehler:', dbError)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('[LeadInquiry] Fehler:', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
