import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { userId, role, firstName, lastName, email, phone } = await req.json()
    if (!userId || !role) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

    const supabase = createAdminClient()

    // Find all admin users
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, email, first_name')
      .in('role', ['admin', 'superadmin'])

    if (!admins || admins.length === 0) return NextResponse.json({ success: true, sent: 0 })

    const roleLabels: Record<string, string> = { engel: 'Engel', kunde: 'Kunde', fahrer: 'Fahrer' }
    const roleLabel = roleLabels[role] || role
    const name = `${firstName || ''} ${lastName || ''}`.trim() || 'Unbekannt'
    const title = `Neue Registrierung: ${name} (${roleLabel})`
    const body = `${name} hat sich als ${roleLabel} registriert.\nE-Mail: ${email || '—'}\nTelefon: ${phone || '—'}`

    // Send notification to each admin
    const inserts = admins.map(admin => ({
      user_id: admin.id,
      type: 'system' as const,
      title,
      body,
      data: { registration_user_id: userId, role, email, firstName, lastName },
      link: '/mis/team',
    }))

    const { error } = await supabase.from('notifications').insert(inserts)
    if (error) console.error('Notification insert error:', error)

    return NextResponse.json({ success: true, sent: admins.length })
  } catch (err: any) {
    console.error('Admin registration notify error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
