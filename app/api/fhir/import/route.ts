// ═══════════════════════════════════════════════════════════════
// POST /api/fhir/import — FHIR-Patient-Bundle-Import (Block 21)
//
// Zwei Modi (body.mode):
//   'preview' (Default) — parst + validiert das Bundle, gleicht gegen
//      bestehende Klienten ab, schreibt NICHTS. Für die Vorschau im Admin-UI.
//   'commit' — schreibt nur die vom Admin bestätigten Zeilen (body.decisions),
//      niemals blind das ganze Bundle. 'update' überschreibt nur Felder, die
//      im eingehenden Bundle gesetzt sind (siehe candidateToClientUpdate).
//
// Scope: NUR Patient-Ressourcen. Encounter/Observation/CarePlan-Import ist
// nicht umgesetzt (siehe lib/fhir/import.ts und docs/fhir-isip.md).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { berlinParts } from '@/lib/utils/timezone'
import {
  buildImportPreview,
  candidateToClientInsert,
  candidateToClientUpdate,
  parseImportBundle,
  type ExistingClientLookup,
} from '@/lib/fhir/import'
import { exceptionOutcome, invalidOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import { logFhirAuditEvent } from '@/lib/fhir/audit'

interface ImportDecision {
  index: number
  action: 'create' | 'update' | 'skip'
  clientId?: string
}

function generateCustomerNumber(): string {
  const p = berlinParts(new Date())
  const yy = p.year.slice(-2)
  const rand = String(Math.floor(1000 + Math.random() * 9000))
  return `KD-${yy}${p.month}-${rand}`
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return invalidOutcome('Body ist kein gültiges JSON.')
  }

  const mode = body.mode === 'commit' ? 'commit' : 'preview'
  const parsed = parseImportBundle(body.bundle)
  if (parsed.errors.length > 0 && parsed.patients.length === 0) {
    return invalidOutcome(parsed.errors.join(' '))
  }

  const orgId = auth.ctx.organizationId
  const admin = createAdminClient()

  const { data: existingRaw, error: existingErr } = await admin
    .from('clients')
    .select('id, customer_number, insurance_number, versichertennummer, first_name, last_name')
    .eq('organization_id', orgId)
  if (existingErr) return exceptionOutcome(existingErr.message)

  const preview = buildImportPreview(parsed.patients, (existingRaw as ExistingClientLookup[]) ?? [])

  if (mode === 'preview') {
    await logFhirAuditEvent({
      organizationId: orgId,
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      action: 'import_preview',
      resourceTypes: ['Patient'],
      resourceCount: preview.length,
      details: { bundleErrors: parsed.errors, neu: preview.filter(p => p.match === 'neu').length, bestehend: preview.filter(p => p.match === 'bestehend').length },
    })
    return NextResponse.json({ bundleErrors: parsed.errors, patients: preview })
  }

  // ── commit ───────────────────────────────────────────────────
  const decisions = Array.isArray(body.decisions) ? (body.decisions as ImportDecision[]) : []
  if (decisions.length === 0) {
    return invalidOutcome('mode=commit erfordert "decisions" (mind. ein Eintrag).')
  }

  const previewByIndex = new Map(preview.map(p => [p.index, p]))
  const results: Array<{ index: number; status: 'created' | 'updated' | 'skipped' | 'error'; clientId?: string; error?: string }> = []

  for (const decision of decisions) {
    const candidate = previewByIndex.get(decision.index)
    if (!candidate) {
      results.push({ index: decision.index, status: 'error', error: 'Kein Kandidat mit diesem Index im Bundle.' })
      continue
    }
    if (decision.action === 'skip') {
      results.push({ index: decision.index, status: 'skipped' })
      continue
    }
    if (candidate.errors.length > 0) {
      results.push({ index: decision.index, status: 'error', error: `Ungültiger Kandidat: ${candidate.errors.join(' ')}` })
      continue
    }

    if (decision.action === 'create') {
      const fields = candidateToClientInsert(candidate)
      if (!fields.first_name || !fields.last_name) {
        results.push({ index: decision.index, status: 'error', error: 'Vor- und Nachname sind Pflichtfelder.' })
        continue
      }
      const { data, error } = await admin
        .from('clients')
        .insert({ organization_id: orgId, customer_number: generateCustomerNumber(), ...fields })
        .select('id')
        .single()
      if (error || !data) {
        results.push({ index: decision.index, status: 'error', error: error?.message ?? 'Insert fehlgeschlagen.' })
        continue
      }
      results.push({ index: decision.index, status: 'created', clientId: data.id })
    } else if (decision.action === 'update') {
      const targetId = decision.clientId ?? candidate.matchedClientId
      if (!targetId) {
        results.push({ index: decision.index, status: 'error', error: 'Keine Ziel-Klienten-ID für Update angegeben.' })
        continue
      }
      const fields = candidateToClientUpdate(candidate)
      if (Object.keys(fields).length === 0) {
        results.push({ index: decision.index, status: 'skipped' })
        continue
      }
      const { error } = await admin
        .from('clients')
        .update(fields)
        .eq('id', targetId)
        .eq('organization_id', orgId)
      if (error) {
        results.push({ index: decision.index, status: 'error', error: error.message })
        continue
      }
      results.push({ index: decision.index, status: 'updated', clientId: targetId })
    } else {
      results.push({ index: decision.index, status: 'error', error: `Unbekannte Aktion "${decision.action}".` })
    }
  }

  const written = results.filter(r => r.status === 'created' || r.status === 'updated')
  await logFhirAuditEvent({
    organizationId: orgId,
    actorId: auth.ctx.userId,
    actorName: auth.ctx.name,
    action: 'import_commit',
    resourceTypes: ['Patient'],
    resourceCount: written.length,
    details: { results },
  })

  return NextResponse.json({ results })
}
