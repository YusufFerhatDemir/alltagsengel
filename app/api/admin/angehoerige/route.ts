// ═══════════════════════════════════════════════════════════════
// GET/POST /api/admin/angehoerige — Zugänge verwalten
// ═══════════════════════════════════════════════════════════════
//
// BEFUND (27.08.2026): Die Route lässt jede Rolle mit der Berechtigung
// `stammdaten.lesen`/`stammdaten.schreiben` herein — also auch pdl, qm
// und buchhaltung (lib/auth/rollen.ts). Gearbeitet hat sie aber mit dem
// RLS-Client, und auf `angehoerigen_zugaenge` gibt es genau zwei
// nutzbare Policies: `admin_angeh_zugaenge_all` mit `is_admin()` und
// `angeh_eigene_zugaenge_select` mit `user_id = auth.uid()`.
// `is_admin()` ist live auf admin|superadmin beschränkt (aus pg_proc
// gelesen, 27.08.2026). Folge:
//
//   • GET: eine PDL sah eine LEERE Liste — kein Fehler, keine Meldung.
//     „Es gibt keine Angehörigenzugänge" und „ich darf sie nicht sehen"
//     sahen identisch aus. Derselbe Befund wie bei den QM/PDL-
//     Dashboards (Commit d707cda).
//   • POST: der Insert lief gegen RLS und kam als HTTP 500 zurück —
//     mitsamt der rohen Postgres-Meldung im `error`-Feld, weil dieser
//     Handler als einziger `{ error: msg }` statt safeApiError nutzte.
//
// Abhilfe wie dort: die Daten holt der Dienstschlüssel, die Berechtigung
// entscheidet `requireAngehAdmin`, und der Mandanten-Fence steckt in
// jeder Abfrage (die Funktionen in lib/angehoerige/angehoerige.ts
// filtern durchgehend auf `organization_id`).

import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAngehAdmin } from '@/lib/angehoerige/api-auth'
import { listeZugaenge, erstelleZugang, protokolliereZugriff } from '@/lib/angehoerige/angehoerige'
import type { FreigabeStatus, AngehoerigenRolle } from '@/lib/angehoerige/types'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  const auth = await requireAngehAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const client_id = url.searchParams.get('client_id') || undefined
  const status = url.searchParams.get('status') || undefined
  const rolle = url.searchParams.get('rolle') || undefined

  try {
    const supabase = createAdminClient()
    const zugaenge = await listeZugaenge(supabase, auth.ctx.organizationId, {
      client_id,
      status: status as FreigabeStatus | undefined,
      rolle: rolle as AngehoerigenRolle | undefined,
    })

    // Enrich: Benutzer- und Klientennamen zuordnen
    const userIds = [...new Set(zugaenge.map(z => z.user_id))]
    const clientIds = [...new Set(zugaenge.map(z => z.client_id))]

    const [{ data: profiles }, { data: clients }] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds)
        : Promise.resolve({ data: [] as Array<Record<string, string | null>> }),
      clientIds.length > 0
        ? supabase.from('clients').select('id, first_name, last_name')
            .eq('organization_id', auth.ctx.organizationId).in('id', clientIds)
        : Promise.resolve({ data: [] as Array<Record<string, string | null>> }),
    ])

    const profileMap = new Map<string, { name: string; email: string }>()
    for (const p of (profiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
      profileMap.set(p.id, {
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbekannt',
        email: p.email || '',
      })
    }

    const clientMap = new Map<string, string>()
    for (const c of (clients ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      clientMap.set(c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unbekannt')
    }

    const enriched = zugaenge.map(z => ({
      ...z,
      user_name: profileMap.get(z.user_id)?.name ?? undefined,
      user_email: profileMap.get(z.user_id)?.email ?? undefined,
      client_name: clientMap.get(z.client_id) ?? undefined,
    }))

    return NextResponse.json(enriched)
  } catch (err) {
    return safeApiError(err, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireAngehAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const supabase = createAdminClient()

    // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', body.client_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }

    // Der Empfänger muss ein bestehendes, aktives Konto sein. Vorher ging
    // jede beliebige UUID durch — der Fremdschlüssel zeigt auf auth.users,
    // nicht auf profiles, und ein Tippfehler in der Benutzer-ID hätte
    // einen Zugang erzeugt, den niemand jemals nutzen kann.
    const { data: empfaenger } = await supabase
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', body.user_id)
      .maybeSingle()
    if (!empfaenger || (empfaenger as { deleted_at: string | null }).deleted_at) {
      return NextResponse.json({ error: 'Benutzerkonto nicht gefunden oder nicht mehr aktiv.' }, { status: 404 })
    }

    const zugang = await erstelleZugang(supabase, auth.ctx.organizationId, auth.ctx.userId, body)

    await protokolliereZugriff(supabase, auth.ctx.organizationId, {
      zugang_id: zugang.id,
      user_id: auth.ctx.userId,
      client_id: zugang.client_id,
      aktion: 'zugang_erteilt',
      details: { rolle: zugang.rolle, bereiche: zugang.freigegebene_bereiche },
    })

    await logAuditEventOrWarn({
      action: 'create',
      actorId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
      entityType: 'angehoerigen_zugang',
      entityId: zugang.id,
      details: { client_id: zugang.client_id, rolle: zugang.rolle, bereiche: zugang.freigegebene_bereiche },
      request: req,
    })

    return NextResponse.json(zugang, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message ?? ''

    // `unique_user_client` — es gibt bereits einen (womöglich widerrufenen)
    // Zugang für dieses Paar. Kam vorher als rohe Postgres-Meldung mit
    // Status 500 zurück und sah aus wie ein Ausfall.
    if (msg.includes('unique_user_client') || msg.includes('23505')) {
      return NextResponse.json(
        { error: 'Für diesen Angehörigen und diesen Klienten besteht bereits ein Zugang. Bitte den bestehenden Zugang bearbeiten oder reaktivieren.' },
        { status: 409 },
      )
    }

    // Nur die Meldungen der eigenen Eingabeprüfung dürfen nach draußen —
    // alles andere geht über den Sanitizer.
    if (msg.includes('Pflichtfeld') || msg.startsWith('Ungültige') || msg.includes('muss ')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return safeApiError(err, req)
  }
})
