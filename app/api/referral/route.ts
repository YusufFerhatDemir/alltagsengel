import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ═══ GET: Referral-Info für den eingeloggten User ═══
export async function GET(request: NextRequest) {
  try {
    // Auth prüfen via Header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    // Profil mit Referral-Code laden
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('referral_code, referral_credit, first_name')
      .eq('id', user.id)
      .single()

    // Referral-Statistiken
    const { data: referrals } = await supabaseAdmin
      .from('referrals')
      .select('id, status, created_at, completed_at')
      .eq('referrer_id', user.id)

    const stats = {
      total: referrals?.length || 0,
      pending: referrals?.filter(r => r.status === 'pending').length || 0,
      completed: referrals?.filter(r => r.status === 'completed').length || 0,
    }

    // Referral-Link generieren
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.alltagsengel.care'
    const referralLink = `${baseUrl}/?ref=${profile?.referral_code}`

    return NextResponse.json({
      referral_code: profile?.referral_code,
      referral_credit: profile?.referral_credit || 0,
      referral_link: referralLink,
      stats,
      first_name: profile?.first_name,
    })
  } catch (err) {
    console.error('Referral GET error:', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}

// ═══ POST: Referral-Code bei Registrierung einlösen ═══
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { referral_code, referred_user_id } = body

    if (!referral_code || !referred_user_id) {
      return NextResponse.json({ error: 'Code und User-ID erforderlich' }, { status: 400 })
    }

    // Referrer finden
    const { data: referrer } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name')
      .eq('referral_code', referral_code.toUpperCase())
      .single()

    if (!referrer) {
      return NextResponse.json({ error: 'Ungültiger Empfehlungscode' }, { status: 404 })
    }

    // Sich selbst empfehlen verhindern
    if (referrer.id === referred_user_id) {
      return NextResponse.json({ error: 'Du kannst dich nicht selbst empfehlen' }, { status: 400 })
    }

    // Prüfen ob schon ein Referral existiert
    const { data: existing } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referred_id', referred_user_id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Bereits eine Empfehlung eingelöst' }, { status: 409 })
    }

    // Referral erstellen
    const { error: insertError } = await supabaseAdmin
      .from('referrals')
      .insert({
        referrer_id: referrer.id,
        referred_id: referred_user_id,
        status: 'pending',
        bonus_amount: 20,
      })

    if (insertError) {
      console.error('Referral insert error:', insertError)
      return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
    }

    // referred_by im Profil setzen
    await supabaseAdmin
      .from('profiles')
      .update({ referred_by: referrer.id })
      .eq('id', referred_user_id)

    return NextResponse.json({
      success: true,
      message: `Empfehlung von ${referrer.first_name} angenommen! Nach deiner ersten Buchung bekommt ihr beide 20 € Bonus.`,
    })
  } catch (err) {
    console.error('Referral POST error:', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
