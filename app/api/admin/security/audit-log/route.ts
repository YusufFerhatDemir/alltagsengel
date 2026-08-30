// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/security/audit-log
// ═══════════════════════════════════════════════════════════════════════
//
// Die Sicherheitsspur fuer die Verwaltungsoberflaeche. Filter, Seiten,
// Sortierung und — mit `format=csv` — der Export fuer eine Pruefung.
//
// BERECHTIGUNG: 'sicherheit.lesen'. Die haben nur admin und superadmin
// (NUR_ADMINISTRATION in lib/auth/rollen.ts, gespiegelt in
// public.rollen_matrix). Bewusst NICHT 'audit.lesen': das ist die
// fachliche Revisionsspur, die pdl, qm und buchhaltung fuer ihre Arbeit
// brauchen. Hier stehen IP-Adressen, Geraete und Anmeldeverhalten von
// Kolleginnen und Kollegen.
//
// Der Zugriff auf die Spur ist selbst ein Ereignis: der CSV-Export
// schreibt ein `data_export` in dieselbe Tabelle. Wer die
// Sicherheitsspur exportiert, hinterlaesst eine Spur.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireBerechtigung } from '@/lib/auth/guard'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import {
  leseSpur, exportiereSpur, EXPORT_MAX,
  SEITENGROESSE_STANDARD, SORTIERFELDER,
  type SpurFilter, type Sortierfeld,
} from '@/lib/security/abfrage'
import {
  EREIGNISSE, KATEGORIEN, SCHWEREGRADE,
  istKategorie, istSchweregrad,
  BEZEICHNUNG_KATEGORIE, BEZEICHNUNG_SCHWEREGRAD,
} from '@/lib/security/ereignisse'
import { erfasseSicherheitsereignis } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PLATTFORMEN = ['web', 'ios', 'android', 'server', 'unbekannt'] as const

/**
 * Datum aus der Anfrage. Ein unbrauchbarer Wert wird VERWORFEN, nicht
 * geraten: ein stillschweigend auf „heute" gesetzter Zeitraum liefert
 * eine plausible, aber falsche Liste — und in einer Sicherheitsansicht
 * ist das schlimmer als eine Fehlermeldung.
 */
function datum(wert: string | null, endeDesTages: boolean): string | null {
  if (!wert) return null
  const roh = /^\d{4}-\d{2}-\d{2}$/.test(wert)
    ? `${wert}T${endeDesTages ? '23:59:59.999' : '00:00:00.000'}Z`
    : wert
  const d = new Date(roh)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function ganzzahl(wert: string | null, standard: number): number {
  const n = Number(wert)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : standard
}

function filterAus(url: URL, organizationId: string): SpurFilter {
  const p = url.searchParams
  const kategorie = p.get('kategorie')
  const grad = p.get('severity')
  const plattform = p.get('plattform')
  const sortierFeld = p.get('sortierFeld')

  return {
    organizationId,
    ohneOrganisationEinschliessen: p.get('ohneOrganisation') !== '0',
    userId: p.get('userId'),
    suche: p.get('suche')?.trim() || null,
    vonDatum: datum(p.get('von'), false),
    bisDatum: datum(p.get('bis'), true),
    eventType: p.get('eventType') || null,
    eventCategory: istKategorie(kategorie) ? kategorie : null,
    severity: istSchweregrad(grad) ? grad : null,
    plattform: (PLATTFORMEN as readonly string[]).includes(plattform ?? '') ? plattform : null,
    ip: p.get('ip')?.trim() || null,
    seite: ganzzahl(p.get('seite'), 1),
    seitengroesse: ganzzahl(p.get('seitengroesse'), SEITENGROESSE_STANDARD),
    sortierFeld: (SORTIERFELDER as readonly string[]).includes(sortierFeld ?? '')
      ? (sortierFeld as Sortierfeld)
      : 'created_at',
    sortierRichtung: p.get('sortierRichtung') === 'asc' ? 'asc' : 'desc',
  }
}

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireBerechtigung('sicherheit.lesen')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const url = new URL(request.url)
    const filter = filterAus(url, auth.ctx.organizationId)

    if (url.searchParams.get('format') === 'csv') {
      const csv = await exportiereSpur(admin, filter)

      await erfasseSicherheitsereignis({
        eventType: 'data_export',
        userId: auth.ctx.userId,
        organizationId: auth.ctx.organizationId,
        request,
        metadata: {
          gegenstand: 'security_audit_log',
          obergrenze: EXPORT_MAX,
          filter: {
            von: filter.vonDatum, bis: filter.bisDatum,
            eventType: filter.eventType, kategorie: filter.eventCategory,
            severity: filter.severity, plattform: filter.plattform,
          },
        },
      })

      const stempel = new Date().toISOString().slice(0, 10)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sicherheitsspur-${stempel}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const ergebnis = await leseSpur(admin, filter)

    return NextResponse.json({
      ...ergebnis,
      /** Der Katalog wandert mit — die Oberflaeche soll die gueltigen
       *  Werte nicht ein zweites Mal fuehren. */
      katalog: {
        ereignisse: Object.entries(EREIGNISSE).map(([typ, regel]) => ({
          typ, bezeichnung: regel.bezeichnung, kategorie: regel.kategorie,
          schweregrad: regel.schweregrad, meldepflichtig: regel.meldepflichtig,
        })),
        kategorien: KATEGORIEN.map(k => ({ wert: k, bezeichnung: BEZEICHNUNG_KATEGORIE[k] })),
        schweregrade: SCHWEREGRADE.map(s => ({ wert: s, bezeichnung: BEZEICHNUNG_SCHWEREGRAD[s] })),
        plattformen: PLATTFORMEN,
        sortierfelder: SORTIERFELDER,
        exportMax: EXPORT_MAX,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return safeApiError(err, request)
  }
})
