import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCaregiverSession } from '@/lib/native-auth'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { uebernimmOderMelde, NACHWEIS_TABELLE } from '@/lib/signaturen/nachweis-uebernahme'
const log = logger.child('api/native/signatures')

// ═══════════════════════════════════════════════════════════════
// POST /api/native/signatures
// ═══════════════════════════════════════════════════════════════
// Bridge für die Expo-App: nimmt eine digitale Unterschrift (Klient
// oder Betreuungskraft) entgegen und legt sie serverseitig (service_role)
// in service_signatures an, inkl. Device-Info und optionaler GPS-Position
// (Einmal-Messung, kein Dauertracking). Direkter Insert aus der App ist
// laut RLS nicht erlaubt (service_signatures_service_all ist auf
// service_role beschränkt) — daher dieser dedizierte Server-Endpunkt.
//
// Body:
//   {
//     service_record_id: string
//     signer_role: 'client' | 'caregiver'
//     signer_name: string
//     signature_image: string   // base64 PNG (data:-Prefix optional)
//     device_info?: { platform: string; version: string | number }
//     gps_lat?: number
//     gps_lng?: number
//   }
// ═══════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireCaregiverSession(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const {
      service_record_id,
      signer_role,
      signer_name,
      signature_image,
      device_info,
      gps_lat,
      gps_lng,
    }: {
      service_record_id?: string
      signer_role?: 'client' | 'caregiver'
      signer_name?: string
      signature_image?: string
      device_info?: Record<string, unknown>
      gps_lat?: number
      gps_lng?: number
    } = body

    if (!service_record_id || !signer_role || !signer_name || !signature_image) {
      return NextResponse.json(
        { error: 'service_record_id, signer_role, signer_name und signature_image erforderlich' },
        { status: 400 }
      )
    }
    if (!['client', 'caregiver'].includes(signer_role)) {
      return NextResponse.json({ error: 'Ungültige signer_role' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: record, error: recErr } = await admin
      .from('service_records')
      .select('id, caregiver_id, organization_id')
      .eq('id', service_record_id)
      .single()

    if (recErr || !record) {
      return NextResponse.json({ error: 'Leistungsnachweis nicht gefunden' }, { status: 404 })
    }
    if (record.caregiver_id !== auth.caregiverId) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Leistungsnachweis' }, { status: 403 })
    }
    if (record.organization_id !== auth.organizationId) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Leistungsnachweis' }, { status: 403 })
    }

    const { data: existingSig } = await admin
      .from('service_signatures')
      .select('id')
      .eq('service_record_id', service_record_id)
      .eq('signer_role', signer_role)
      .maybeSingle()

    if (existingSig) {
      return NextResponse.json(
        { error: 'Unterschrift wurde bereits erfasst und kann nicht ueberschrieben werden.' },
        { status: 409 }
      )
    }

    const { data: signature, error: sigErr } = await admin
      .from('service_signatures')
      .insert({
        service_record_id,
        // Ohne diese Zeile greift der Spalten-Default current_org_id(). Der
        // liest auth.uid() — beim Dienstschluessel gibt es keinen angemeldeten
        // Nutzer, die Fallback-Kette laeuft ins Leere und endet in der fest
        // verdrahteten Stamm-Organisation. Die Unterschrift eines fremden
        // Mandanten laege dann dort, und der eigene Mandant saehe sie wegen
        // service_signatures_org_fence (RESTRICTIVE) gar nicht mehr.
        // Die Organisation steht schon fest: sie ist oben gegen
        // auth.organizationId geprueft worden.
        organization_id: record.organization_id,
        signer_role,
        signer_name,
        signature_image,
        device_info: device_info || {},
        gps_lat: gps_lat ?? null,
        gps_lng: gps_lng ?? null,
      })
      .select()
      .single()

    if (sigErr || !signature) {
      log.errorWithException('Insert-Fehler', sigErr)
      return NextResponse.json({ error: 'Unterschrift konnte nicht gespeichert werden' }, { status: 500 })
    }

    // ── Die Unterschrift erreicht den Leistungsnachweis ────────────────
    //
    // Bis zum 14.09.2026 endete dieser Weg mit dem Insert oben. Die
    // Unterschrift lag in `service_signatures`, und `service_records` blieb
    // auf `proof_status='ENTWURF'` ohne Hash — fuer den
    // Sammelrechnungslauf unabrechenbar (UNTERSCHRIFT_FEHLT). Die Kundin
    // hatte unterschrieben, und eine Rechnung entstand trotzdem nie.
    //
    // NUR bei `signer_role === 'client'`: `client_signed_at` und
    // `client_signature` sind die Felder des KUNDEN. Die Unterschrift der
    // Pflegekraft belegt, dass der Einsatz stattgefunden hat — sie belegt
    // nicht, dass der Kunde ihn bestaetigt. Beides gleichzusetzen waere
    // genau die Abkuerzung, gegen die `enforce_unterschrift_beleg` steht.
    if (signer_role === 'client') {
      await uebernimmOderMelde(admin, {
        referenzTabelle: NACHWEIS_TABELLE,
        referenzId: service_record_id,
        signiertAm: new Date().toISOString(),
        signatarName: signer_name,
        organizationId: record.organization_id,
      })
    }

    return NextResponse.json({ success: true, signature_id: signature.id })
  } catch (err) {
    return safeApiError(err, request)
  }
})
