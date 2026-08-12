// ═══════════════════════════════════════════════════════════════
// FHIR-Audit-Log — ISiP-Sicherheitsmaßnahme (Block 21)
//
// "ISiP-Konformität" wird hier NICHT als Zertifizierung verstanden
// (dafür gibt es keine öffentlich einheitliche, sicher bekannte
// technische Spezifikation) — sondern pragmatisch als Bündel von
// Informationssicherheits-Maßnahmen rund um den Datenexport/-import:
// lückenloser Audit-Trail (diese Datei), Zugriffskontrolle
// (requireOpsAdmin + org_fence), Verschlüsselung (TLS + Supabase at
// rest) und Datensparsamkeit (Export nur die tatsächlich vorhandenen
// Felder, kein Vollabzug fremder Organisationen).
//
// Separates Log von mis_audit_log: FHIR-Operationen betreffen
// Gesundheitsdaten und sollen unabhängig von den generischen
// Admin-Events auswertbar sein (wer hat wann welchen Klienten wie
// exportiert/importiert).
// ═══════════════════════════════════════════════════════════════

import { createAdminClient } from '@/lib/supabase/admin'

export type FhirAuditAction = 'export' | 'import_preview' | 'import_commit'

export interface FhirAuditLogInput {
  organizationId: string
  actorId: string
  actorName: string
  action: FhirAuditAction
  /** z. B. ['Patient','Encounter','Observation','CarePlan'] */
  resourceTypes: string[]
  clientId?: string | null
  resourceCount: number
  details?: Record<string, unknown>
}

/**
 * Loggt fail-soft (wie logAuditEvent in lib/audit-log.ts): ein
 * Logging-Fehler darf einen erfolgreichen Export/Import nicht blockieren,
 * wird aber in der Konsole sichtbar gemacht.
 */
export async function logFhirAuditEvent(input: FhirAuditLogInput): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('fhir_audit_log').insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      actor_name: input.actorName,
      action: input.action,
      resource_types: input.resourceTypes,
      client_id: input.clientId ?? null,
      resource_count: input.resourceCount,
      details: input.details ?? {},
    })
    if (error) {
      console.error('[fhir-audit-log] insert failed:', { code: (error as { code?: string }).code, message: error.message })
      return false
    }
    return true
  } catch (err) {
    console.error('[fhir-audit-log] unexpected error:', { message: (err as Error).message })
    return false
  }
}
