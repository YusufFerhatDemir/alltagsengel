import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ═══ POST: Referral abschließen nach erster Buchung ═══
// Wird aufgerufen wenn ein referred User seine erste Buchung abschließt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id } = body

    if (!user_id) {
      return NextResponse.json({ error: 'user_id erforderlich' }, { status: 400 })
    }

    // Pending Referral für diesen User finden
    const { data: referral } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('referred_id', user_id)
      .eq('status', 'pending')
      .single()

    if (!referral) {
      return NextResponse.json({ message: 'Kein offenes Referral' })
    }

    const bonus = referral.bonus_amount || 20

    // 1. Referral als completed markieren
    await supabaseAdmin
      .from('referrals')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        referrer_credited: true,
        referred_credited: true,
      })
      .eq('id', referral.id)

    // 2. Bonus für Referrer gutschreiben
    await supabaseAdmin.rpc('increment_referral_credit', {
      user_id: referral.referrer_id,
      amount: bonus,
    }).catch(async () => {
      // Fallback wenn RPC nicht existiert
      const { data: referrerProfile } = await supabaseAdmin
        .from('profiles')
        .select('referral_credit')
        .eq('id', referral.referrer_id)
        .single()

      await supabaseAdmin
        .from('profiles')
        .update({ referral_credit: (referrerProfile?.referral_credit || 0) + bonus })
        .eq('id', referral.referrer_id)
    })

    // 3. Bonus für Referred gutschreiben
    await supabaseAdmin.rpc('increment_referral_credit', {
      user_id: referral.referred_id,
      amount: bonus,
    }).catch(async () => {
      const { data: referredProfile } = await supabaseAdmin
        .from('profiles')
        .select('referral_credit')
        .eq('id', referral.referred_id)
        .single()

      await supabaseAdmin
        .from('profiles')
        .update({ referral_credit: (referredProfile?.referral_credit || 0) + bonus })
        .eq('id', referral.referred_id)
    })

    // 4. Notification an Referrer senden
    await supabaseAdmin.from('notifications').insert({
      user_id: referral.referrer_id,
      title: 'Empfehlungsbonus erhalten!',
      message: `Deine Empfehlung hat die erste Buchung abgeschlossen. Du hast ${bonus} € Guthaben erhalten!`,
      type: 'referral',
    })

    return NextResponse.json({
      success: true,
      message: `${bonus} € Bonus für beide Seiten gutgeschrieben`,
    })
  } catch (err) {
    console.error('Referral complete error:', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
