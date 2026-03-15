import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/content-blocks
 *
 * Query params:
 *   ?key=kf_homepage_price           → Single block by exact key
 *   ?prefix=kf_landing_              → All blocks matching prefix
 *   ?keys=key1,key2,key3             → Multiple blocks by keys
 *   (no params)                      → All active public blocks
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    const prefix = searchParams.get('prefix')
    const keys = searchParams.get('keys')

    const supabase = await createClient()

    if (key) {
      // Single block by key
      const { data, error } = await supabase
        .from('content_blocks')
        .select('key, title, content')
        .eq('key', key)
        .eq('status', 'active')
        .eq('context', 'public')
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Block nicht gefunden' }, { status: 404 })
      }
      return NextResponse.json(data)
    }

    if (prefix) {
      // Multiple blocks by prefix
      const { data, error } = await supabase
        .from('content_blocks')
        .select('key, title, content')
        .like('key', `${prefix}%`)
        .eq('status', 'active')
        .eq('context', 'public')
        .order('key')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ blocks: data || [] })
    }

    if (keys) {
      // Multiple blocks by key list
      const keyList = keys.split(',').map(k => k.trim())
      const { data, error } = await supabase
        .from('content_blocks')
        .select('key, title, content')
        .in('key', keyList)
        .eq('status', 'active')
        .eq('context', 'public')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Return as key→content map for easy frontend use
      const map: Record<string, string> = {}
      for (const block of data || []) {
        map[block.key] = block.content
      }
      return NextResponse.json({ blocks: map })
    }

    // All active public blocks
    const { data, error } = await supabase
      .from('content_blocks')
      .select('key, title, content')
      .eq('status', 'active')
      .eq('context', 'public')
      .order('key')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ blocks: data || [] })

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Fehler beim Laden der Inhalte' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/content-blocks (Admin only)
 * Create a new content block
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    const body = await request.json()
    const { key, title, content, context, language, status } = body

    if (!key || !content) {
      return NextResponse.json({ error: 'key und content sind erforderlich' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('content_blocks')
      .insert({
        key,
        title: title || null,
        content,
        context: context || 'public',
        language: language || 'de',
        status: status || 'active',
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * PUT /api/content-blocks (Admin only)
 * Update an existing content block
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    const body = await request.json()
    const { id, key, title, content, context, language, status: blockStatus } = body

    if (!id && !key) {
      return NextResponse.json({ error: 'id oder key ist erforderlich' }, { status: 400 })
    }

    const updateData: any = { updated_by: user.id, updated_at: new Date().toISOString() }
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (context !== undefined) updateData.context = context
    if (language !== undefined) updateData.language = language
    if (blockStatus !== undefined) updateData.status = blockStatus

    let query = supabase.from('content_blocks').update(updateData)
    if (id) query = query.eq('id', id)
    else if (key) query = query.eq('key', key)

    const { data, error } = await query.select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * DELETE /api/content-blocks (Admin only)
 * Soft-delete by setting status to 'archived'
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const key = searchParams.get('key')

    if (!id && !key) {
      return NextResponse.json({ error: 'id oder key Parameter erforderlich' }, { status: 400 })
    }

    // Soft-delete: archive instead of hard delete
    let query = supabase
      .from('content_blocks')
      .update({ status: 'archived', updated_by: user.id, updated_at: new Date().toISOString() })

    if (id) query = query.eq('id', id)
    else if (key) query = query.eq('key', key)

    const { error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
