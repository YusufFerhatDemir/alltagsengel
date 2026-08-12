// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/export?patient=<clientId>
//
// Standardisierter FHIR-Export eines einzelnen Klienten für
// Anbieterwechsel/Portabilität (Block 21): Patient + alle zugehörigen
// Encounter/Observation/CarePlan-Ressourcen als Bundle (type=collection).
// Jeder Export wird in fhir_audit_log protokolliert (ISiP-Maßnahme).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  buildCollectionBundle,
  clientToFhirPatient,
  massnahmenplanToFhirCarePlan,
  serviceRecordToFhirEncounter,
  vitalSignToFhirObservation,
} from '@/lib/fhir/mappers'
import { exceptionOutcome, invalidOutcome, notFoundOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import { logFhirAuditEvent } from '@/lib/fhir/audit'
import type { ClientFhirRow, FhirResource, ServiceRecordFhirRow } from '@/lib/fhir/types'
import type { VitalSign } from '@/lib/vitals/types'
import type { PflegeMassnahme, PflegeMassnahmenplan } from '@/lib/pflege/types'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  const url = new URL(request.url)
  const patientId = url.searchParams.get('patient')
  if (!patientId) return invalidOutcome('Parameter "patient" ist erforderlich, z. B. ?patient=<Klienten-ID>.')

  try {
    const admin = createAdminClient()
    const orgId = auth.ctx.organizationId

    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, organization_id, customer_number, first_name, last_name, date_of_birth, geburtsdatum, address, city, zip_code, phone, email, insurance_number, versichertennummer, care_level, pflegegrad, status')
      .eq('id', patientId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (clientErr) return exceptionOutcome(clientErr.message)
    if (!client) return notFoundOutcome('Patient', patientId)

    const [recordsRes, vitalsRes, plaeneRes] = await Promise.all([
      admin.from('service_records')
        .select('id, organization_id, client_id, caregiver_id, date, start_time, end_time, duration_minutes, service_type, status')
        .eq('organization_id', orgId).eq('client_id', patientId).order('date', { ascending: false }),
      admin.from('vital_signs').select('*').eq('organization_id', orgId).eq('client_id', patientId).order('measured_at', { ascending: false }),
      admin.from('pflege_massnahmenplaene').select('*').eq('organization_id', orgId).eq('client_id', patientId).order('gueltig_von', { ascending: false }),
    ])
    if (recordsRes.error) return exceptionOutcome(recordsRes.error.message)
    if (vitalsRes.error) return exceptionOutcome(vitalsRes.error.message)
    if (plaeneRes.error) return exceptionOutcome(plaeneRes.error.message)

    const planRows = (plaeneRes.data as PflegeMassnahmenplan[]) ?? []
    const massnahmenByPlan = new Map<string, PflegeMassnahme[]>()
    if (planRows.length > 0) {
      const { data: massnahmen, error: mErr } = await admin
        .from('pflege_massnahmen').select('*').eq('organization_id', orgId)
        .in('plan_id', planRows.map(p => p.id)).order('sortierung', { ascending: true })
      if (mErr) return exceptionOutcome(mErr.message)
      for (const m of (massnahmen as PflegeMassnahme[]) ?? []) {
        const list = massnahmenByPlan.get(m.plan_id) ?? []
        list.push(m)
        massnahmenByPlan.set(m.plan_id, list)
      }
    }

    const resources: FhirResource[] = [
      clientToFhirPatient(client as ClientFhirRow),
      ...((recordsRes.data as ServiceRecordFhirRow[]) ?? []).map(serviceRecordToFhirEncounter),
      ...((vitalsRes.data as VitalSign[]) ?? []).map(vitalSignToFhirObservation),
      ...planRows.map(p => massnahmenplanToFhirCarePlan(p, massnahmenByPlan.get(p.id) ?? [])),
    ]

    const bundle = buildCollectionBundle(resources)

    await logFhirAuditEvent({
      organizationId: orgId,
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      action: 'export',
      resourceTypes: ['Patient', 'Encounter', 'Observation', 'CarePlan'],
      clientId: patientId,
      resourceCount: resources.length,
      details: { customer_number: (client as ClientFhirRow).customer_number },
    })

    const dateStamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'Content-Disposition': `attachment; filename="fhir-export-${(client as ClientFhirRow).customer_number}-${dateStamp}.json"`,
      },
    })
  } catch (err) {
    return exceptionOutcome((err as Error).message)
  }
}
