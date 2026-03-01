import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function extractStoragePath(fileUrl: string | null): string | null {
  if (!fileUrl) return null

  try {
    const url = new URL(fileUrl)
    const publicPrefix = '/storage/v1/object/public/documents/'
    const signedPrefix = '/storage/v1/object/sign/documents/'

    if (url.pathname.includes(publicPrefix)) {
      return decodeURIComponent(url.pathname.split(publicPrefix)[1] || '')
    }

    if (url.pathname.includes(signedPrefix)) {
      return decodeURIComponent(url.pathname.split(signedPrefix)[1] || '')
    }

    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json()
    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json({ error: 'documentId ist erforderlich.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const [{ data: profile }, { data: document, error: documentError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single(),
      supabase
        .from('documents')
        .select('id, user_id, storage_path, file_url')
        .eq('id', documentId)
        .single(),
    ])

    if (documentError || !document) {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 })
    }

    const isAdmin = profile?.role === 'admin'
    const isOwner = document.user_id === user.id
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Keine Berechtigung für dieses Dokument.' }, { status: 403 })
    }

    const storagePath = document.storage_path || extractStoragePath(document.file_url || null)
    if (!storagePath) {
      return NextResponse.json({ error: 'Dokumentpfad fehlt.' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data: signed, error: signedError } = await adminClient
      .storage
      .from('documents')
      .createSignedUrl(storagePath, 60 * 5)

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: signedError?.message || 'Signierter Link konnte nicht erstellt werden.' }, { status: 500 })
    }

    return NextResponse.json({ url: signed.signedUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unerwarteter Fehler.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
