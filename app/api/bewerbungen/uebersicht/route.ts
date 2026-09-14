// ═══════════════════════════════════════════════════════════════════
// GET /api/bewerbungen/uebersicht — wie viele Website-Bewerbungen offen sind
// ═══════════════════════════════════════════════════════════════════
//
// Nur ZAHLEN, nie Namen oder Kontakte. Die Route existiert, damit
// /mis/recruiting keine stille Null mehr zeigt (siehe Kopf von
// lib/bewerbung/quellen.ts).
//
// ── DIE BERECHTIGUNGSGRENZE BLEIBT, WO SIE IST ────────────────────
// Zugang hat, wer /mis/recruiting oeffnen darf (`personal.lesen`, also
// auch die PDL). Die ZAHL bekommt aber nur, wer die Bewerbungen auch
// selbst ansehen duerfte (`marketing.verwalten`, live admin/superadmin).
// Alle anderen bekommen `darfSehen: false` und damit den Hinweis ohne
// Zahl — das ist die ehrliche Auskunft, ohne die bestehende Grenze
// aufzuweichen.
//
// Warum die Grenze so liegt: auf `lead_inquiries` steht live genau eine
// verwaltende Policy, „Admin full access" mit is_admin(). Eine PDL
// bekaeme mit dem RLS-Client ohnehin eine leere Antwort — und genau
// diese stille Leere ist der Fehler, den die Route behebt. Deshalb wird
// hier mit dem Dienstschluessel gezaehlt und der Riegel in der Route
// gesetzt.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBerechtigung } from '@/lib/auth/guard'
import { rolleDarf } from '@/lib/auth/rollen'
import { BEWERBUNG_FILTER } from '@/lib/admin/ops'
import { withTracking } from '@/lib/monitoring/tracker'
import { stufeFuerBewerbung, BEWERBER_ENDZUSTAENDE } from '@/lib/bewerbung/pipeline'
import {
  BEWERBUNG_SICHT_BERECHTIGUNG, tageSeit,
  type BewerbungUebersicht,
} from '@/lib/bewerbung/quellen'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requireBerechtigung('personal.lesen')
    if (!auth.ok) return auth.response
    const { organizationId, rolle } = auth.ctx

    const darfSehen = rolleDarf(rolle, BEWERBUNG_SICHT_BERECHTIGUNG)
    if (!darfSehen) {
      const leer: BewerbungUebersicht = { offen: null, aeltesteTage: null, darfSehen: false }
      return NextResponse.json(leer)
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('lead_inquiries')
      .select('created_at, eingereicht_am, status, bewerbung_daten')
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)

    if (error) {
      // Fail-closed in der Aussage, nicht im Betrieb: lieber „keine Zahl"
      // als eine falsche. Der Hinweistext steht dann ohne Zahl da.
      const unbekannt: BewerbungUebersicht = { offen: null, aeltesteTage: null, darfSehen: true }
      return NextResponse.json(unbekannt)
    }

    // Endzustaende zaehlen nicht als offen — dieselbe Regel wie im
    // Posteingang (lib/leads/posteingang.ts::ausBewerbung).
    const offeneZeilen = (data ?? []).filter(z => {
      const { stufe } = stufeFuerBewerbung(z.bewerbung_daten, z.status)
      return !BEWERBER_ENDZUSTAENDE.includes(stufe)
    })

    const eingaenge = offeneZeilen
      .map(z => (z.eingereicht_am ?? z.created_at) as string | null)
      .filter((s): s is string => Boolean(s))
      .sort()

    const ergebnis: BewerbungUebersicht = {
      offen: offeneZeilen.length,
      aeltesteTage: eingaenge.length > 0 ? tageSeit(eingaenge[0]) : null,
      darfSehen: true,
    }
    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
