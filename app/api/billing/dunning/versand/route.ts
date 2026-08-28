import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import {
  verarbeiteMahnQueue,
  reaktiviereAufgegebene,
} from '@/lib/billing/dunning/mahn-versand'
import { logBillingAction } from '@/lib/billing/core/audit'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

/**
 * POST /api/billing/dunning/versand
 *
 * Arbeitet die wartenden Eintraege aus dunning_email_queue der eigenen
 * Organisation ab: PDF erzeugen, Mahnung per E-Mail schicken, Status
 * setzen. Vor jedem Versand wird geprueft, ob die Rechnung inzwischen
 * bezahlt oder blockiert ist — dann wird storniert statt gemahnt.
 *
 * Body (optional):
 *   { limit?: number, wiederholen?: boolean,
 *     deadLetterReaktivieren?: boolean, queueIds?: string[] }
 *   `wiederholen` nimmt auch Eintraege mit status='fehlgeschlagen' mit.
 *   `deadLetterReaktivieren` holt aufgegebene Eintraege (Dead Letter)
 *   zurueck in die Warteschlange — siehe unten.
 *
 * GET liefert nur die Zaehler der Queue, ohne etwas zu versenden.
 */
export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await pruefeAdmin('abrechnung.schreiben')
    if (!auth.ok) return auth.response
    const { admin, organizationId, userId } = auth

    let limit = 100
    let wiederholen = false
    let deadLetterReaktivieren = false
    let queueIds: string[] | undefined
    try {
      const body = await request.json()
      if (Number.isFinite(Number(body?.limit))) {
        limit = Math.min(Math.max(1, Math.round(Number(body.limit))), 500)
      }
      wiederholen = body?.wiederholen === true
      deadLetterReaktivieren = body?.deadLetterReaktivieren === true
      if (Array.isArray(body?.queueIds)) {
        queueIds = body.queueIds.filter((v: unknown) => typeof v === 'string')
      }
    } catch {
      // Kein Body ist erlaubt.
    }

    // ── Manuelle Wiederaufnahme aus dem Dead Letter ──
    //
    // `reaktiviereAufgegebene()` gab es schon, aber KEINEN Aufrufer:
    // eine Mahnung im Endzustand 'aufgegeben' liess sich ausserhalb der
    // Datenbank durch nichts mehr zurueckholen. Genau dafuer ist der
    // Endzustand aber gedacht — er endet durch eine ausdrueckliche
    // Entscheidung der Verwaltung (korrigierte Adresse, nachgetragener
    // Schluessel), nicht durch Ablauf.
    //
    // Bewusst KEIN automatischer Aufrufer und bewusst dasselbe Recht wie
    // der Versand: die Reaktivierung fuehrt unmittelbar dazu, dass beim
    // naechsten Lauf ein Mahnschreiben an einen echten Kunden geht.
    // Eigener Name: `MahnVersandErgebnis` fuehrt bereits ein Feld
    // `reaktiviert` fuer die faelligen FEHLGESCHLAGENEN Zeilen. Beide in
    // eine Antwort zu legen wuerde das eine mit dem anderen ueberschreiben.
    let deadLetterReaktiviert = 0
    if (deadLetterReaktivieren) {
      deadLetterReaktiviert = await reaktiviereAufgegebene(admin, organizationId, queueIds)
      if (deadLetterReaktiviert > 0) {
        await logBillingAction(admin, {
          entityType: 'dunning',
          entityId: organizationId,
          organizationId,
          action: 'dead_letter_reaktiviert',
          newState: { anzahl: deadLetterReaktiviert, queueIds: queueIds ?? null },
          actorId: userId,
        })
      }
    }

    const ergebnis = await verarbeiteMahnQueue(admin, {
      organizationId,
      limit,
      wiederholen,
      actorId: userId,
    })

    return NextResponse.json({ ...ergebnis, deadLetterReaktiviert })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await pruefeAdmin()
    if (!auth.ok) return auth.response
    const { admin, organizationId } = auth

    const { data, error } = await admin
      .from('dunning_email_queue')
      .select('status')
      .eq('organization_id', organizationId)

    if (error) return safeApiError(error, request)

    const zaehler: Record<string, number> = {
      wartend: 0, versendet: 0, fehlgeschlagen: 0, storniert: 0, aufgegeben: 0,
    }
    for (const z of data || []) zaehler[z.status] = (zaehler[z.status] || 0) + 1

    return NextResponse.json({ queue: zaehler, gesamt: data?.length ?? 0 })
  } catch (err) {
    return safeApiError(err, request)
  }
})

type AdminPruefung =
  | { ok: false; response: NextResponse }
  | { ok: true; admin: ReturnType<typeof createAdminClient>; organizationId: string; userId: string }

/**
 * Zugangspruefung.
 *
 * `recht` ist bewusst ein Parameter: GET zaehlt nur die Warteschlange
 * (`abrechnung.lesen`), POST verschickt Mahnschreiben an echte Kunden und
 * verlangt deshalb `abrechnung.schreiben` — wie der Rechnungsversand
 * (app/api/billing/invoices/[id]/versenden). Vorher stand hier fuer
 * beides `abrechnung.lesen`; damit haette die PDL-Rolle, die Rechnungen
 * ausdruecklich nur LESEN darf (lib/auth/rollen.ts), Mahnungen ausloesen
 * koennen.
 */
async function pruefeAdmin(
  recht: 'abrechnung.lesen' | 'abrechnung.schreiben' = 'abrechnung.lesen'
): Promise<AdminPruefung> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const quellen = await holeRollenQuellenFuer(supabase, user)
  if (!quellenDuerfen(quellen, recht)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return { ok: true, admin: createAdminClient(), organizationId, userId: user.id }
}
