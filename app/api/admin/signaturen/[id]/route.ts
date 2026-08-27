import { NextRequest, NextResponse } from 'next/server'
import { safeApiError, UserFacingError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSigUser } from '@/lib/signaturen/api-auth'
import {
  leisteSignatur,
  lehneSignaturAb,
  verifiziereSignatur,
} from '@/lib/signaturen/signaturen'
import { sichtbareDokumenttypen } from '@/lib/signaturen/berechtigung'
import type { SignaturDokumentTyp } from '@/lib/signaturen/types'
import { logAuditEvent } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════
// PATCH /api/admin/signaturen/[id] — signieren | ablehnen | verifizieren
// ═══════════════════════════════════════════════════════════════
//
// Dienstschluessel: der Nachweis in signatur_audit_log ist live nur fuer
// is_admin() schreibbar, ein Signatar ist das in aller Regel nicht. Mit
// dem RLS-Client scheiterte JEDE Unterschrift eines Nicht-Admins am
// Audit-Insert — nachdem die Unterschrift bereits geschrieben war.
//
// Weil der Dienstschluessel RLS umgeht, prueft die Fachschicht selbst:
// Mandant (organization_id), Signatar-Identitaet (signatar_id) und
// Status per Compare-and-Swap. Siehe lib/signaturen/signaturen.ts.

export const PATCH = withTracking(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSigUser()
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const body = await req.json()
    const dienst = createAdminClient()

    if (body.action === 'signieren') {
      const signatur = await leisteSignatur(dienst, auth.organizationId, id, auth.userId, {
        methode: body.methode,
        signatur_daten: body.signatur_daten,
        ip_adresse: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
        user_agent: req.headers.get('user-agent') || undefined,
      })
      await logAuditEvent({
        action: 'update',
        actorId: auth.userId,
        organizationId: auth.organizationId,
        entityType: 'signatur',
        entityId: id,
        details: { aktion: 'signieren', methode: body.methode },
        request: req,
      })
      return NextResponse.json(signatur)
    }

    if (body.action === 'ablehnen') {
      const signatur = await lehneSignaturAb(
        dienst, auth.organizationId, id, auth.userId, body.grund,
      )
      await logAuditEvent({
        action: 'update',
        actorId: auth.userId,
        organizationId: auth.organizationId,
        entityType: 'signatur',
        entityId: id,
        details: { aktion: 'ablehnen', grund: body.grund },
        request: req,
      })
      return NextResponse.json(signatur)
    }

    if (body.action === 'verifizieren') {
      // Verifizieren ist ein Lesevorgang mit Nachweis. Erlaubt ist er
      // dem Signatar selbst oder einer Rolle, die die Dokumentart lesen
      // darf — NICHT jedem angemeldeten Konto: bis hierher gab es gar
      // keine Pruefung, und die Antwort nennt Signatar, Zeitpunkt und
      // Methode.
      const eigene = await dienst
        .from('signaturen')
        .select('signatar_id, signatur_dokumente!inner(dokument_typ)')
        .eq('id', id)
        .eq('organization_id', auth.organizationId)
        .maybeSingle()

      if (eigene.error) throw new Error(`Signatur laden: ${eigene.error.message}`)
      if (!eigene.data) throw new UserFacingError('Signatur nicht gefunden.', 404)

      const typ = (eigene.data.signatur_dokumente as unknown as { dokument_typ: SignaturDokumentTyp })
        ?.dokument_typ
      const darfLesen =
        eigene.data.signatar_id === auth.userId
        || sichtbareDokumenttypen(auth.appRolle, auth.profilRolle, 'lesen').includes(typ)

      if (!darfLesen) {
        throw new UserFacingError('Für diesen Vorgang fehlt Ihnen die Berechtigung.', 403)
      }

      const ergebnis = await verifiziereSignatur(dienst, auth.organizationId, id, auth.userId)
      await logAuditEvent({
        action: 'update',
        actorId: auth.userId,
        organizationId: auth.organizationId,
        entityType: 'signatur',
        entityId: id,
        details: { aktion: 'verifizieren', gueltig: ergebnis.gueltig },
        request: req,
      })
      return NextResponse.json(ergebnis)
    }

    return NextResponse.json(
      { error: 'Ungültige Aktion. Zulässig: signieren, ablehnen, verifizieren.' },
      { status: 400 },
    )
  } catch (err) {
    return safeApiError(err, req)
  }
})
