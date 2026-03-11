import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { invalidatePricingCache } from '@/lib/pricing-engine'

// Admin auth check helper
async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: 'Nicht authentifiziert' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { supabase, user: null, error: 'Keine Berechtigung' }
  }

  return { supabase, user, error: null }
}

// Audit log helper
async function logAudit(
  supabase: any,
  entityType: string,
  entityId: string | null,
  action: 'create' | 'update' | 'delete',
  oldValues: any,
  newValues: any,
  actorId: string
) {
  await supabase.from('kf_pricing_audit').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_values: oldValues,
    new_values: newValues,
    actor_id: actorId,
  })
}

/** GET — Read all pricing data (tiers, surcharges, regions, config, audit) */
export async function GET(request: Request) {
  const { supabase, user, error } = await checkAdmin()
  if (error) return NextResponse.json({ error }, { status: 401 })

  const url = new URL(request.url)
  const entity = url.searchParams.get('entity') || 'all'

  try {
    if (entity === 'all' || entity === 'overview') {
      const [tiers, surcharges, regions, config, audit] = await Promise.all([
        supabase.from('kf_pricing_tiers').select('*').order('sort_order'),
        supabase.from('kf_pricing_surcharges').select('*').order('sort_order'),
        supabase.from('kf_pricing_regions').select('*').order('region_code'),
        supabase.from('kf_pricing_config').select('*').order('key'),
        supabase.from('kf_pricing_audit').select('*').order('created_at', { ascending: false }).limit(50),
      ])
      return NextResponse.json({
        tiers: tiers.data || [],
        surcharges: surcharges.data || [],
        regions: regions.data || [],
        config: config.data || [],
        audit: audit.data || [],
      })
    }

    // Single entity type
    const tableMap: Record<string, string> = {
      tiers: 'kf_pricing_tiers',
      surcharges: 'kf_pricing_surcharges',
      regions: 'kf_pricing_regions',
      config: 'kf_pricing_config',
      audit: 'kf_pricing_audit',
    }
    const table = tableMap[entity]
    if (!table) return NextResponse.json({ error: 'Ungültige Entität' }, { status: 400 })

    const { data, error: dbErr } = await supabase.from(table).select('*').order(
      entity === 'audit' ? 'created_at' : entity === 'config' ? 'key' : 'sort_order',
      { ascending: entity !== 'audit' }
    )
    if (dbErr) throw dbErr
    return NextResponse.json({ [entity]: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/** POST — Create new tier/surcharge/region/config */
export async function POST(request: Request) {
  const { supabase, user, error } = await checkAdmin()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const body = await request.json()
    const { entity, ...values } = body

    const tableMap: Record<string, string> = {
      tiers: 'kf_pricing_tiers',
      surcharges: 'kf_pricing_surcharges',
      regions: 'kf_pricing_regions',
      config: 'kf_pricing_config',
    }
    const table = tableMap[entity]
    if (!table) return NextResponse.json({ error: 'Ungültige Entität' }, { status: 400 })

    const { data, error: dbErr } = await supabase.from(table).insert(values).select().single()
    if (dbErr) throw dbErr

    await logAudit(supabase, entity, data.id, 'create', null, values, user!.id)
    invalidatePricingCache()

    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/** PUT — Update existing tier/surcharge/region/config */
export async function PUT(request: Request) {
  const { supabase, user, error } = await checkAdmin()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const body = await request.json()
    const { entity, id, ...values } = body

    const tableMap: Record<string, string> = {
      tiers: 'kf_pricing_tiers',
      surcharges: 'kf_pricing_surcharges',
      regions: 'kf_pricing_regions',
      config: 'kf_pricing_config',
    }
    const table = tableMap[entity]
    if (!table) return NextResponse.json({ error: 'Ungültige Entität' }, { status: 400 })

    // Get old values for audit
    const { data: oldData } = await supabase.from(table).select('*').eq('id', id).single()

    const updateValues = { ...values, updated_at: new Date().toISOString() }
    const { data, error: dbErr } = await supabase.from(table).update(updateValues).eq('id', id).select().single()
    if (dbErr) throw dbErr

    await logAudit(supabase, entity, id, 'update', oldData, values, user!.id)
    invalidatePricingCache()

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/** DELETE — Remove tier/surcharge/region */
export async function DELETE(request: Request) {
  const { supabase, user, error } = await checkAdmin()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const url = new URL(request.url)
    const entity = url.searchParams.get('entity')
    const id = url.searchParams.get('id')

    if (!entity || !id) return NextResponse.json({ error: 'entity und id erforderlich' }, { status: 400 })

    const tableMap: Record<string, string> = {
      tiers: 'kf_pricing_tiers',
      surcharges: 'kf_pricing_surcharges',
      regions: 'kf_pricing_regions',
    }
    const table = tableMap[entity]
    if (!table) return NextResponse.json({ error: 'Ungültige Entität' }, { status: 400 })

    // Get old values for audit
    const { data: oldData } = await supabase.from(table).select('*').eq('id', id).single()

    const { error: dbErr } = await supabase.from(table).delete().eq('id', id)
    if (dbErr) throw dbErr

    await logAudit(supabase, entity, id, 'delete', oldData, null, user!.id)
    invalidatePricingCache()

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
