import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin, requireAktenUser } from '@/lib/akten/api-auth'
import { getSignedDokumentUrl } from '@/lib/akten/dokumente'
import { bucketForZuordnung, darfAusgeliefertWerden, ausliefernAbgelehntGrund } from '@/lib/akten/types'
import { logAktenZugriff } from '@/lib/akten/zugriff-log'
import { withTracking } from '@/lib/monitoring/tracker'

const AUSWAHL = 'id, organization_id, dateipfad, dateiname, client_id, caregiver_id, status'

// Zugriff läuft in zwei Schichten:
// 1) RLS-scoped SELECT mit dem Server-Client des eingeloggten Users — das
//    schützt automatisch nach admin_akten_dokumente / kunde_.../engel_...
//    Kommt eine Zeile zurück, ist der User berechtigt (egal ob Admin, Kunde
//    oder Engel).
// 2) Erst danach wird mit dem Service-Role-Client die signierte URL erzeugt,
//    weil die Storage-Buckets keine eigenen Client-Policies haben.
//
// ── BEFUND 29.08.2026: DIE AKTE WAR FÜR IHRE EIGENEN ROLLEN VERSCHLOSSEN ──
//
// Die Policy `admin_akten_dokumente` läuft über `is_admin()`, und
// `is_admin()` ist live auf `role IN ('admin','superadmin')` beschränkt
// (aus `pg_get_functiondef` gelesen). Für `pdl`, `qm` und `buchhaltung`
// trifft KEINE der drei Policies zu: sie sind weder Administration noch
// Kunde noch Engel der Zeile. Der RLS-Lauf gab damit nichts zurück und die
// Route antwortete „Dokument nicht gefunden oder kein Zugriff".
//
// Gleichzeitig verlangen `/api/akten/dokumente` und `/api/akten/suche` nur
// `stammdaten.lesen` — dieselben Rollen SEHEN das Dokument also in jeder
// Liste und bekamen es nicht heraus. Für die Pflegedienstleitung, die die
// Akte führt, war das Modul damit nur zur Hälfte da.
//
// Der zweite Weg unten ist deshalb NICHT eine Lockerung der Grenze,
// sondern derselbe Riegel wie in den Listen — nur an der Stelle, an der er
// sitzen muss: in der Route (die Buckets haben ohnehin keine eigenen
// Policies, die Auslieferung läuft immer über den Dienstschlüssel).
// Insbesondere gilt hier die Personalakten-Regel aus 0ba1d61e wörtlich
// weiter: ein Dokument mit `caregiver_id` braucht `personal.lesen`.
export const GET = withTracking(async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenUser()
    if (!auth.ok) return auth.response

    const supabase = await createClient()
    const { data: eigen, error } = await supabase
      .from('akten_dokumente')
      .select(AUSWAHL)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    let dokument = error ? null : eigen

    if (!dokument) {
      // Zweiter Weg: wer die Akte führen darf, darf auch herunterladen.
      // Fail-closed — ohne `stammdaten.lesen` bleibt es bei 404.
      const aktenAuth = await requireAktenAdmin('stammdaten.lesen')
      if (aktenAuth.ok) {
        const dienst = createAdminClient()
        const { data: zeile } = await dienst
          .from('akten_dokumente')
          .select(AUSWAHL)
          // Der Mandanten-Fence muss hier VON HAND stehen: der
          // Dienstschlüssel sieht `org_fence_akten_dokumente` nicht.
          .eq('organization_id', aktenAuth.ctx.organizationId)
          .eq('id', id)
          .is('deleted_at', null)
          .maybeSingle()

        // Personalakte bleibt Personalakte: dieselbe Bedingung wie in
        // `/api/akten/dokumente/[id]`. Bewusst 403 und nicht 404 — dass es
        // das Dokument gibt, verrät die Kennung ohnehin; ein 404 würde
        // behaupten, es existiere nicht.
        if (zeile?.caregiver_id && !aktenAuth.ctx.darf('personal.lesen')) {
          return NextResponse.json(
            { error: 'Dieses Dokument gehört zu einer Personalakte. Dafür fehlt Ihnen die Berechtigung.' },
            { status: 403 },
          )
        }
        dokument = zeile ?? null
      }
    }

    if (!dokument) {
      return NextResponse.json({ error: 'Dokument nicht gefunden oder kein Zugriff.' }, { status: 404 })
    }
    // BEFUND (28.08.2026): geprueft wurde allein auf 'archiviert'. 'gesperrt'
    // ist ein eigener Wert desselben CHECK-Constraints — ein ausdruecklich
    // gesperrtes Dokument liess sich weiterhin herunterladen. Die Liste der
    // nicht auslieferbaren Status liegt jetzt an EINER Stelle
    // (lib/akten/types.ts) und ist fail-closed gegen unbekannte Werte.
    if (!darfAusgeliefertWerden(dokument.status)) {
      return NextResponse.json({ error: ausliefernAbgelehntGrund(dokument.status) }, { status: 403 })
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
    return safeApiError(err, request)
  }
})
