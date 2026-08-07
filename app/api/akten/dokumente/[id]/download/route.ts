import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenUser } from '@/lib/akten/api-auth'
import { getSignedDokumentUrl } from '@/lib/akten/dokumente'
import { bucketForZuordnung } from '@/lib/akten/types'
import { logAktenZugriff } from '@/lib/akten/zugriff-log'

// Zugriff läuft in zwei Schichten:
// 1) RLS-scoped SELECT mit dem Server-Client des eingeloggten Users — das
//    schützt automatisch nach admin_akten_dokumente / kunde_.../engel_...
//    Kommt eine Zeile zurück, ist der User berechtigt (egal ob Admin, Kunde
//    oder Engel).
// 2) Erst danach wird mit dem Service-Role-Client die signierte URL erzeugt,
//    weil die Storage-Buckets keine eigenen Client-Policies haben.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenUser()
    if (!auth.ok) return auth.response

    const supabase = await createClient()
    const { data: dokument, error } = await supabase
      .from('akten_dokumente')
      .select('id, organization_id, dateipfad, dateiname, client_id, caregiver_id, status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !dokument) {
      return NextResponse.json({ error: 'Dokument nicht gefunden oder kein Zugriff.' }, { status: 404 })
    }
    if (dokument.status === 'archiviert') {
      return NextResponse.json({ error: 'Dokument ist archiviert.' }, { status: 403 })
    }

    const bucket = bucketForZuordnung(dokument.client_id, dokument.caregiver_id)
    const admin = createAdminClient()
    const url = await getSignedDokumentUrl(admin, bucket, dokument.dateipfad, 300)

    await logAktenZugriff(admin, {
      organizationId: dokument.organization_id,
      entitaetTyp: 'dokument',
      entitaetId: dokument.id,
      aktion: 'heruntergeladen',
      benutzerId: auth.userId,
      dokumentId: dokument.id,
    })

    return NextResponse.json({ url, dateiname: dokument.dateiname })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
