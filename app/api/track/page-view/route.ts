// ═══════════════════════════════════════════════════════════════════════
// POST /api/track/page-view — Seitenaufruf protokollieren
//
// Security-Audit 2026-08-19, NIEDRIG-3 + MITTEL-2:
// Vorher schrieb components/PageTracker.tsx direkt aus dem Browser nach
// `page_views`. Die dafuer noetige Policy war `WITH CHECK (true)` fuer
// `public` — jeder Unbeteiligte konnte die Tabelle unbegrenzt befuellen,
// und die Zeilen bekamen keinen Mandantenbezug.
//
// Diese Route ersetzt den Direktschreibpfad:
//   * Rate-Limit pro IP (Bot-Floods, Doppel-Submits)
//   * Feste, validierte Feldliste — kein durchgereichtes Objekt
//   * IP + User-Agent aus den Request-Headern, nicht aus dem Body
//   * organization_id serverseitig gesetzt
//   * Service-Role-Client → die offene INSERT-Policy entfaellt (20260922010000)
// ═══════════════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { withTracking } from '@/lib/monitoring/tracker'

const MAX_PFAD = 500
const MAX_TEXT = 1000

function kuerze(wert: unknown, max: number): string | null {
  if (typeof wert !== 'string') return null
  const s = wert.trim()
  if (!s) return null
  return s.slice(0, max)
}

export const POST = withTracking(async function POST(request: Request) {
  // Tracking darf die App nie stoeren: jeder Fehlerpfad endet in { ok: true }.
  try {
    const ip = getClientIp(request)

    // 60 Aufrufe/Minute pro IP — deckt normales Navigieren ab und stoppt Floods.
    //
    // Track 13 B2: instanzuebergreifend gezaehlt. `rateLimit` haelt seine
    // Map im Modul-Scope, also je Serverless-Instanz — auf Vercel startet
    // jede neue mit leerem Zaehler. Der Kopf dieser Datei nennt das Limit
    // als eine der drei Schranken, die den frueheren Direktschreibpfad aus
    // dem Browser ersetzen; als instanzlokale Zaehlung war es das nicht.
    // Diese Route schreibt mit dem Dienstschluessel und legt dabei die
    // IP-Adresse ab (live 6632 Zeilen mit IP, 2033 verschiedene).
    if (!(await rateLimitPersistent(`page-view:${ip}`, 60, 60_000))) {
      return NextResponse.json({ ok: true })
    }

    const body = await request.json().catch(() => ({}))
    const path = kuerze(body?.path, MAX_PFAD)
    if (!path) return NextResponse.json({ ok: true })

    // user_id kommt aus der Session, NICHT aus dem Body — sonst liesse sich
    // ein fremder Nutzer als Urheber eintragen.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Tracking laeuft auch ohne Login (Marketing-Seiten). Ohne Org-Bindung
    // ist die Stamm-Org die richtige Zuordnung — dokumentierte Ausnahme
    // zu MITTEL-1.
    const organizationId = await getActiveOrgIdOrDefault()

    const breite = Number(body?.screen_width)

    await createAdminClient().from('page_views').insert({
      user_id: user?.id ?? null,
      organization_id: organizationId,
      path,
      page_label: kuerze(body?.page_label, MAX_TEXT) ?? path,
      user_agent: request.headers.get('user-agent')?.slice(0, MAX_TEXT) ?? null,
      referrer: kuerze(body?.referrer, MAX_TEXT),
      screen_width: Number.isFinite(breite) && breite > 0 && breite < 20000 ? Math.trunc(breite) : null,
      ip_address: ip !== 'unknown' ? ip : null,
      viewed_at: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
})
