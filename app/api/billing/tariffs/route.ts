import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/billing/tariffs
 * Liste aller aktiven Tarife. Authentifizierung erforderlich, kein Admin nötig.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { data: tariffs, error } = await supabase
      .from('billing_tariffs')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Tarife laden fehlgeschlagen:', error)
      return NextResponse.json({ error: 'Tarife konnten nicht geladen werden' }, { status: 500 })
    }

    return NextResponse.json(tariffs)
  } catch (err) {
    console.error('Unerwarteter Fehler beim Laden der Tarife:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/**
 * POST /api/billing/tariffs
 * Neuen Tarif anlegen. Nur für Administratoren.
 */
export async function POST(request: Request) {
  try {
    // Auth-Prüfung
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
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

    // Admin-Client für den Insert verwenden (RLS erfordert Admin)
    const { data: tariff, error } = await admin
      .from('billing_tariffs')
      .insert(body)
      .select()
      .single()

    if (error) {
      console.error('Tarif anlegen fehlgeschlagen:', error)
      return NextResponse.json({ error: 'Tarif konnte nicht angelegt werden' }, { status: 500 })
    }

    return NextResponse.json(tariff, { status: 201 })
  } catch (err) {
    console.error('Unerwarteter Fehler beim Anlegen des Tarifs:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
