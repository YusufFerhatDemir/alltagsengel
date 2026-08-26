import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { erzeugeSendeToken, entwerteSendeToken, erstversandFreigabe } from '@/lib/pilot/send-gate'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// Einmal-Freigabe für den ersten echten Rechnungsversand
//
// GET     zeigt, ob überhaupt freigegeben werden kann (liest nur).
// POST    stellt eine Freigabe für genau diese Rechnung aus.
// DELETE  entwertet eine ausgestellte Freigabe wieder.
//
// ── DIESE ROUTE VERSENDET NICHTS ────────────────────────────────
// Sie legt eine Zeile in `pilot_send_gate` an bzw. entwertet sie. Der
// Versand selbst ist ein eigener, getrennter Aufruf, der das Token
// mitbringen muss.
//
// ── WAS DER AUFRUFER NICHT BESTIMMEN KANN ───────────────────────
// Den Preflight-Stand. `erzeugeSendeToken()` führt den Piloten selbst
// aus; Empfänger und Betrag kommen aus der Datenbank, nicht aus dem
// Body. Was der Body OPTIONAL enthalten darf, ist die BESTÄTIGUNG
// dessen, was auf dem Bildschirm stand (`empfaenger`, `betragCent`) —
// weicht sie ab, wird abgelehnt. Ein bestätigter Bildschirm, der einen
// anderen Stand zeigte als die Datenbank, ist keine Freigabe.
//
// ── FAIL-CLOSED ─────────────────────────────────────────────────
// Ohne PILOT_ERSTVERSAND_FREIGEGEBEN=1 (bzw. FIRST_REAL_INVOICE_APPROVED
// im Quelltext) antwortet POST mit 409 und legt nichts an.
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    return NextResponse.json(erstversandFreigabe(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return safeApiError(e, req)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Eine Freigabe ist eine Abrechnungshandlung, kein Lesevorgang.
    const auth = await requireOpsAdmin('abrechnung.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx
    const { id } = await params

    const body = await req.json().catch(() => ({})) as {
      empfaenger?: unknown
      betragCent?: unknown
      gueltigkeitMinuten?: unknown
    }

    const ergebnis = await erzeugeSendeToken(createAdminClient(), {
      invoiceId: id,
      organizationId,
      actorId: userId,
      erwarteterEmpfaenger: typeof body.empfaenger === 'string' ? body.empfaenger : undefined,
      erwarteterBetragCent: typeof body.betragCent === 'number' ? body.betragCent : undefined,
      gueltigkeitMinuten: typeof body.gueltigkeitMinuten === 'number' ? body.gueltigkeitMinuten : undefined,
    })

    if (!ergebnis.ok) {
      // 409 statt 400: die Anfrage ist nicht falsch gestellt, der Zustand
      // lässt sie nur nicht zu. Der Bericht geht mit, damit der Grund nicht
      // erst in einem zweiten Aufruf sichtbar wird.
      return NextResponse.json(
        { error: ergebnis.grund, code: ergebnis.code, bericht: ergebnis.bericht ?? null },
        { status: 409 },
      )
    }

    return NextResponse.json({
      token: ergebnis.token,
      gueltigBis: ergebnis.gueltigBis,
      urteil: ergebnis.bericht.urteil,
      hinweis:
        'Diese Freigabe gilt für genau diese Rechnung und genau einmal. Sie wird VOR dem Versand '
        + 'verbraucht — bricht der Lauf danach ab, ist sie verbraucht und muss neu ausgestellt werden.',
    })
  } catch (e) {
    return safeApiError(e, req)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx

    const token = new URL(req.url).searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Es wurde keine Freigabe-Kennung mitgegeben.' }, { status: 400 })
    }

    const ergebnis = await entwerteSendeToken(createAdminClient(), {
      token,
      organizationId,
      actorId: userId,
      grund: 'Von Hand entwertet.',
    })

    return NextResponse.json(ergebnis, { status: ergebnis.ok ? 200 : 409 })
  } catch (e) {
    return safeApiError(e, req)
  }
}
