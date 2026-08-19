// ═══════════════════════════════════════════════════════════════════════
// GET /api/user/export — Selbstbedienungs-Auskunft nach Art. 15 DSGVO
//
// Security-Audit 2026-08-19, NIEDRIG-5: fuer den regulaeren Kunden-, Engel-
// und Fahrer-Bereich gab es keinen Selbstbedienungs-Export; Auskuenfte
// mussten von Hand erstellt werden. Das ist zulaessig, aber bei wachsender
// Nutzerzahl nicht tragfaehig — Art. 12 Abs. 3 DSGVO setzt einen Monat.
//
// Konstruktionsprinzip: gelesen wird ausschliesslich mit dem NUTZER-Client,
// nie mit dem Service-Role-Key. RLS entscheidet also, welche Zeilen zur
// Person gehoeren — ein Fehler in der Quellenliste kann keine fremden Daten
// ausliefern. Details in lib/dsgvo/auskunft.ts.
//
// Ratenbegrenzt (Art. 12 Abs. 5 DSGVO erlaubt das bei exzessiven Antraegen)
// und protokolliert als Audit-Event 'data_export'.
// ═══════════════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { rateLimit } from '@/lib/rate-limit'
import { sammleAuskunft, type AuskunftClient } from '@/lib/dsgvo/auskunft'
import { heuteBerlin } from '@/lib/utils/timezone'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Bitte melden Sie sich an.' }, { status: 401 })
  }

  // 5 Exporte pro Stunde je Konto. Deckt jede echte Auskunft ab und
  // verhindert, dass der Endpunkt als Last-Generator dient.
  if (!rateLimit(`user-export:${user.id}`, 5, 3_600_000)) {
    return NextResponse.json(
      { error: 'Sie haben zuletzt mehrere Auskuenfte angefordert. Bitte versuchen Sie es in einer Stunde erneut.' },
      { status: 429 },
    )
  }

  const auskunft = await sammleAuskunft(
    supabase as unknown as AuskunftClient,
    { id: user.id, email: user.email ?? null },
    new Date().toISOString(),
  )

  logAuditEvent({
    action: 'data_export',
    actorId: user.id,
    targetId: user.id,
    targetEmail: user.email ?? null,
    organizationId: (await resolveUserOrgId()) ?? undefined,
    entityType: 'user',
    entityId: user.id,
    details: {
      abschnitte: auskunft.abschnitte.length,
      zeilen: auskunft.abschnitte.reduce((s, a) => s + a.anzahl, 0),
    },
    request,
  }).catch(() => {})

  return new NextResponse(JSON.stringify(auskunft, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="alltagsengel-auskunft-${heuteBerlin()}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
