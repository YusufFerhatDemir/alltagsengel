import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { withTracking } from '@/lib/monitoring/tracker'
import {
  ABRECHNUNGSSPALTEN, type VerordnungFuerAbrechnung,
} from '@/lib/billing/verordnung-projektion'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/billing/verordnungen — Verordnungen OHNE Gesundheitsdaten
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DIESE ROUTE GIBT
//
// `/admin/abrechnung` braucht von jeder Verordnung acht Angaben:
// Genehmigungsstand, Aktenzeichen, Kostentraeger samt IK und die
// Gueltigkeit. Ohne sie laesst sich kein Abrechnungsfall bilden.
//
// In derselben Zeile steht `diagnose`. Die Tabelle ist deshalb seit dem
// 31.08.2026 unter `pflege.lesen` gestellt — und `lib/auth/rollen.ts`
// haelt woertlich fest, dass die Buchhaltung „KEINE Gesundheitsdaten"
// bekommt.
//
// RLS KANN KEINE SPALTEN AUSBLENDEN. Row Level Security entscheidet ueber
// ZEILEN: entweder die ganze Zeile oder keine. Eine Lesepolicy, die der
// Buchhaltung die Genehmigungsdaten gaebe, gaebe ihr die Diagnose mit.
// Die Seite blieb deshalb an dieser Stelle leer.
//
// Diese Route ist die Aufloesung: sie liest mit dem Dienstschluessel und
// gibt eine AUSDRUECKLICHE Spaltenliste heraus. Was nicht in
// ABRECHNUNGSSPALTEN steht, verlaesst den Server nicht.
//
// ── DER RIEGEL IST HIER DIE ROUTE ─────────────────────────────────────
//
// Mit dem Dienstschluessel sieht RLS diesen Zugriff nie. Drei Dinge
// muessen deshalb HIER stimmen, und sie stehen bewusst untereinander:
//
//   1. `requireOpsAdmin('abrechnung.lesen')` — die Berechtigung. Nicht
//      `pflege.lesen`: wer die Diagnose sehen darf, nimmt die
//      Pflegedoku-Seiten, nicht diese Route.
//   2. `organization_id` kommt aus `auth.ctx`, NIE aus der Anfrage. Eine
//      organization_id aus dem Aufruf waere ein Mandantenwechsel per
//      Parameter.
//   3. Die Spaltenliste ist eine Erlaubnisliste, keine Sperrliste. Eine
//      neue Spalte auf `verordnungen` — etwa ein Freitextfeld mit
//      Befunden — ist damit automatisch DRAUSSEN und nicht versehentlich
//      drin. Ein `select('*')` mit anschliessendem Loeschen einzelner
//      Felder waere die Sperrlisten-Variante und damit die falsche.
//
// ── WAS SIE NICHT TUT ─────────────────────────────────────────────────
//
// Sie ersetzt keine Policy und lockert keine. `verordnungen` bleibt fuer
// die Buchhaltung unter RLS zu; ueber den Browser-Client sieht sie dort
// weiterhin nichts. Diese Route ist der eine, benannte Weg mit der
// engeren Antwort.
// ═══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response

    const supabase = createAdminClient()

    let query = supabase
      .from('verordnungen')
      // Ausdrueckliche Erlaubnisliste — niemals '*'. `diagnose`,
      // `leistung_beschreibung`, `arzt_name`, `arzt_praxis` und `notes`
      // stehen bewusst NICHT darin.
      .select(ABRECHNUNGSSPALTEN.join(', '))
      .eq('organization_id', auth.ctx.organizationId)
      .is('deleted_at', null)

    // Optionaler Zuschnitt auf einzelne Klienten. Der Wert wird nur als
    // Filter benutzt, nie als Mandantenangabe — die steht schon fest.
    const klienten = req.nextUrl.searchParams.get('client_ids')
    if (klienten) {
      const ids = klienten.split(',').map(s => s.trim()).filter(Boolean)
      // Eine leere Liste waere `in.()` und damit ein Syntaxfehler bei
      // PostgREST; ohne diese Schranke antwortete die Route auf
      // `?client_ids=` mit 400 statt mit allen Verordnungen.
      if (ids.length > 0) query = query.in('client_id', ids)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return NextResponse.json((data ?? []) as unknown as VerordnungFuerAbrechnung[])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
})
