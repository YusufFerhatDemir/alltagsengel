import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const adminClient = createAdminClient()
    const userId = user.id

    // 1. Delete user data from all tables (order matters for FK constraints)
    await adminClient.from('notifications').delete().eq('user_id', userId)
    await adminClient.from('messages').delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    await adminClient.from('care_eligibility').delete().eq('user_id', userId)

    // 2. Delete bookings where user is customer
    await adminClient.from('bookings').delete().eq('customer_id', userId)

    // 3. Delete angel profile if exists
    await adminClient.from('angels').delete().eq('id', userId)

    // 4. Delete profile
    await adminClient.from('profiles').delete().eq('id', userId)

    // 5. Delete auth user (this also invalidates all sessions)
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
    if (authError) {
      console.error('Auth delete error:', authError)
      return NextResponse.json({ error: 'Konto konnte nicht gelöscht werden' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Konto und alle Daten wurden gelöscht' })
  } catch (err: any) {
    console.error('User delete error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
