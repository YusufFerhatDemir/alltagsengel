import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCaregiverSession } from '@/lib/native-auth'

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

export async function POST(request: Request) {
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

    const { data: signature, error: sigErr } = await admin
      .from('service_signatures')
      .upsert(
        {
          service_record_id,
          signer_role,
          signer_name,
          signature_image,
          device_info: device_info || {},
          gps_lat: gps_lat ?? null,
          gps_lng: gps_lng ?? null,
        },
        { onConflict: 'service_record_id,signer_role' }
      )
      .select()
      .single()

    if (sigErr || !signature) {
      console.error('[api/native/signatures] Insert-Fehler:', sigErr)
      return NextResponse.json({ error: 'Unterschrift konnte nicht gespeichert werden' }, { status: 500 })
    }

    return NextResponse.json({ success: true, signature_id: signature.id })
  } catch (err) {
    console.error('[api/native/signatures] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
