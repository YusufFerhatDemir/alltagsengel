import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logger } from '@/lib/logger'
import { pruefeObergrenze, pruefeObergrenzenStapel, meldungenAus } from '@/lib/billing/obergrenzen'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
const log = logger.child('api:billing')

/**
 * GET /api/billing/tariffs
 * Liste aller aktiven Tarife der eigenen Organisation. Nur für internes
 * Personal (admin/superadmin/pdl/buero) — Tarifpreise sind keine Kunden-
 * oder Engel-Information.
 */
export const GET = withTracking(async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }
    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'tarife.lesen')) {
      return NextResponse.json({ error: 'Nur für internes Personal' }, { status: 403 })
    }

    const orgId = await getActiveOrgId()
    // Fail-closed (Audit MITTEL-1)
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })
    const admin = createAdminClient()
    const { data: tariffs, error } = await admin
      .from('billing_tariffs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('ist_aktiv', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      log.errorWithException('Tarife laden fehlgeschlagen', error)
      return NextResponse.json({ error: 'Tarife konnten nicht geladen werden' }, { status: 500 })
    }

    const warnungen = (tariffs ?? [])
      .filter((t: Record<string, unknown>) => t.tarif_status !== 'verified' && t.rechtsgrundlage !== 'privat')
      .map((t: Record<string, unknown>) => {
        if (t.tarif_status === 'blocked') {
          return `Tarif "${t.leistungsart}" ist gesperrt: ${t.verifizierungs_quelle || 'kein Grund angegeben'}. Kassenabrechnung blockiert.`
        }
        return `Tarif "${t.leistungsart}" ist nicht verifiziert. Kassenabrechnung nicht moeglich.`
      })

    // T-9: Preise gegen die gesetzlichen Obergrenzen (PfluV) halten. Die
    // DB-Sperre greift nur bei bestaetigten Grenzen — der Seed steht auf
    // unbestaetigt, also ist diese Warnung fuer die hessischen 30/25-EUR-Saetze
    // derzeit die EINZIGE Stelle, an der eine Ueberschreitung sichtbar wird.
    const obergrenzenBefunde = await pruefeObergrenzenStapel(
      admin,
      (tariffs ?? []).map((t: Record<string, unknown>) => ({
        preisCent: Number(t.preis_cent),
        rechtsgrundlage: String(t.rechtsgrundlage ?? ''),
        verguetungsart: String(t.verguetungsart ?? ''),
        leistungsart: t.leistungsart ? String(t.leistungsart) : null,
        bundesland: t.bundesland ? String(t.bundesland) : null,
        gueltigAb: String(t.gueltig_ab ?? ''),
      })),
    )
    warnungen.push(
      ...obergrenzenBefunde.flatMap((b, i) => {
        if (!b.meldung) return []
        const t = (tariffs ?? [])[i] as Record<string, unknown>
        return [`Tarif "${t?.leistungsart ?? '?'}": ${b.meldung}`]
      }),
    )

    return NextResponse.json({ tariffs, warnungen })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/**
 * POST /api/billing/tariffs
 * Neuen Tarif anlegen. Nur für Administratoren.
 */
export const POST = withTracking(async function POST(request: Request) {
  try {
    // Auth-Prüfung
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }
    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'tarife.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    // Tarif-Daten aus dem Request-Body lesen
    const body = await request.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
    }

    // ═══ NEU: Katalog-Validierung ═══
    const admin = createAdminClient()

    // Leistungsart pruefen
    if (body.leistungsart) {
      const { data: la } = await admin
        .from('billing_leistungsarten')
        .select('code, ist_aktiv')
        .eq('code', body.leistungsart)
        .single()
      if (!la) {
        return NextResponse.json(
          { error: `Unbekannte Leistungsart: "${body.leistungsart}". Erlaubte Werte siehe Katalog (billing_leistungsarten).` },
          { status: 400 }
        )
      }
      if (!la.ist_aktiv) {
        return NextResponse.json(
          { error: `Leistungsart "${body.leistungsart}" ist deaktiviert.` },
          { status: 400 }
        )
      }
    }

    // Rechtsgrundlage pruefen
    if (body.rechtsgrundlage) {
      const { data: rg } = await admin
        .from('billing_rechtsgrundlagen')
        .select('code, ist_aktiv')
        .eq('code', body.rechtsgrundlage)
        .single()
      if (!rg) {
        return NextResponse.json(
          { error: `Unbekannte Rechtsgrundlage: "${body.rechtsgrundlage}". Erlaubte Werte siehe Katalog (billing_rechtsgrundlagen).` },
          { status: 400 }
        )
      }
      if (!rg.ist_aktiv) {
        return NextResponse.json(
          { error: `Rechtsgrundlage "${body.rechtsgrundlage}" ist deaktiviert.` },
          { status: 400 }
        )
      }
    }

    // P4: Tarifquelle pruefen
    if (body.tarifquelle) {
      const { data: tq } = await admin
        .from('billing_tarifquellen')
        .select('code, ist_aktiv')
        .eq('code', body.tarifquelle)
        .single()
      if (!tq) {
        return NextResponse.json(
          { error: `Unbekannte Tarifquelle: "${body.tarifquelle}". Erlaubte Werte: PRIVATE_PREISLISTE, ANERKENNUNGSBESCHEID, VERGUETUNGSVEREINBARUNG, KASSENVEREINBARUNG, MANUELL_FREIGEGEBEN.` },
          { status: 400 }
        )
      }
      if (!tq.ist_aktiv) {
        return NextResponse.json(
          { error: `Tarifquelle "${body.tarifquelle}" ist deaktiviert.` },
          { status: 400 }
        )
      }
    }

    // P7: Privat/Kasse-Trennung auf API-Ebene prüfen
    if (body.rechtsgrundlage && body.tarifquelle) {
      if (body.rechtsgrundlage === 'privat' && !['PRIVATE_PREISLISTE', 'MANUELL_FREIGEGEBEN'].includes(body.tarifquelle)) {
        return NextResponse.json(
          { error: `Privattarife (rechtsgrundlage="privat") erlauben nur tarifquelle PRIVATE_PREISLISTE oder MANUELL_FREIGEGEBEN, nicht "${body.tarifquelle}".` },
          { status: 400 }
        )
      }
      if (body.rechtsgrundlage !== 'privat' && body.tarifquelle === 'PRIVATE_PREISLISTE') {
        return NextResponse.json(
          { error: `Kassentarife (rechtsgrundlage="${body.rechtsgrundlage}") dürfen nicht tarifquelle=PRIVATE_PREISLISTE haben.` },
          { status: 400 }
        )
      }
    }

    // IK-Format pruefen (Application-Level, DB-Constraint als Backup)
    if (body.kostentraeger_ik) {
      const ikCleaned = body.kostentraeger_ik.replace(/\s/g, '')
      if (!/^\d{9}$/.test(ikCleaned)) {
        return NextResponse.json(
          { error: `Kostentraeger-IK "${body.kostentraeger_ik}" muss aus exakt 9 Ziffern bestehen.` },
          { status: 400 }
        )
      }
    }

    // Verifizierungsfelder gehoeren NICHT in den freien Request-Body: sie duerfen
    // nur ueber PATCH /api/billing/tariffs/[id]/verifizierung gesetzt werden,
    // dort mit eigenem Admin-Gate und Pflichtangabe der Quelle. Ein im Body
    // mitgeschicktes tarif_status='verified' waere sonst die Kasse-Freigabe-
    // Sperre der Rechnungs-RPC ohne jede Pruefung wert.
    const {
      tarif_status: _ignoredTarifStatus,
      verifiziert_am: _ignoredVerifiziertAm,
      verifiziert_von: _ignoredVerifiziertVon,
      verifizierungs_quelle: _ignoredVerifizierungsQuelle,
      ...tarifDaten
    } = body as Record<string, unknown>

    // T-9: Obergrenzen-Vorpruefung. Bewusst VOR dem Insert, damit die Meldung
    // auch dann entsteht, wenn der DB-Trigger (bestaetigte Grenze) das
    // Speichern gleich abweist — dann ist der Befund die einzige Erklaerung,
    // die der Aufrufer bekommt.
    const obergrenzeBefund = await pruefeObergrenze(admin, {
      preisCent: Number((body as Record<string, unknown>).preis_cent),
      rechtsgrundlage: String(body.rechtsgrundlage ?? ''),
      verguetungsart: String((body as Record<string, unknown>).verguetungsart ?? ''),
      leistungsart: body.leistungsart ? String(body.leistungsart) : null,
      bundesland: (body as Record<string, unknown>).bundesland
        ? String((body as Record<string, unknown>).bundesland)
        : null,
      gueltigAb: String((body as Record<string, unknown>).gueltig_ab ?? ''),
    })
    if (obergrenzeBefund.meldung) {
      log.warn('Tarifpreis gegen gesetzliche Obergrenze auffaellig', {
        organizationId,
        leistungsart: body.leistungsart,
        rechtsgrundlage: body.rechtsgrundlage,
        preisCent: obergrenzeBefund.preisCent,
        obergrenzeCent: obergrenzeBefund.obergrenzeCent,
        obergrenzeStatus: obergrenzeBefund.status,
      })
    }

    // Admin-Client für den Insert verwenden (RLS erfordert Admin).
    // Org-Fence: organization_id kommt aus der Auth, NICHT aus dem Body — der
    // Spread steht davor, damit ein mitgeschicktes Feld ueberschrieben wird.
    const { data: tariff, error } = await admin
      .from('billing_tariffs')
      .insert({ ...tarifDaten, organization_id: organizationId, tarif_status: 'unverified' })
      .select()
      .single()

    if (error) {
      log.errorWithException('Tarif anlegen fehlgeschlagen', error)
      return NextResponse.json({ error: 'Tarif konnte nicht angelegt werden' }, { status: 500 })
    }

    return NextResponse.json(
      { ...tariff, warnungen: meldungenAus([obergrenzeBefund]) },
      { status: 201 },
    )
  } catch (err) {
    return safeApiError(err, request)
  }
})
