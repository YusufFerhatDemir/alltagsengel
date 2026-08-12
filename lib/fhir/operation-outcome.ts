// ═══════════════════════════════════════════════════════════════
// FHIR OperationOutcome — Fehlerantworten
//
// FHIR-Clients erwarten bei Fehlern eine OperationOutcome-Ressource
// statt eines generischen { error: string } — das ist Teil des
// Standards (http://hl7.org/fhir/R4/operationoutcome.html).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import type { FhirIssueCode, FhirIssueSeverity, FhirOperationOutcome } from './types'

export function buildOperationOutcome(
  severity: FhirIssueSeverity,
  code: FhirIssueCode,
  diagnostics: string,
): FhirOperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity, code, diagnostics }],
  }
}

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'

function outcomeResponse(status: number, outcome: FhirOperationOutcome): NextResponse {
  return new NextResponse(JSON.stringify(outcome), {
    status,
    headers: { 'Content-Type': FHIR_CONTENT_TYPE },
  })
}

/** 404 — Ressource nicht gefunden (existiert nicht oder gehört zu anderer Organisation). */
export function notFoundOutcome(resourceType: string, id: string): NextResponse {
  return outcomeResponse(404, buildOperationOutcome(
    'error', 'not-found', `${resourceType}/${id} wurde nicht gefunden.`,
  ))
}

/** 403 — kein Zugriff (fehlende Admin-Rolle oder Organisation). */
export function forbiddenOutcome(diagnostics = 'Kein Zugriff auf diese Ressource.'): NextResponse {
  return outcomeResponse(403, buildOperationOutcome('error', 'forbidden', diagnostics))
}

/** 401 — nicht authentifiziert. */
export function unauthorizedOutcome(diagnostics = 'Nicht autorisiert.'): NextResponse {
  return outcomeResponse(401, buildOperationOutcome('error', 'security', diagnostics))
}

/** 400 — ungültige Anfrage (fehlender Parameter, kaputtes Bundle, …). */
export function invalidOutcome(diagnostics: string): NextResponse {
  return outcomeResponse(400, buildOperationOutcome('error', 'invalid', diagnostics))
}

/** 500 — unerwarteter Serverfehler. */
export function exceptionOutcome(diagnostics: string): NextResponse {
  return outcomeResponse(500, buildOperationOutcome('fatal', 'exception', diagnostics))
}

/** Wandelt ein bereits vorhandenes NextResponse (z. B. aus requireOpsAdmin) in eine
 *  FHIR-OperationOutcome-Antwort um, wenn es sich um einen einfachen { error } JSON-Body handelt. */
export async function toFhirErrorResponse(response: NextResponse): Promise<NextResponse> {
  const status = response.status
  let message = 'Zugriff verweigert.'
  try {
    const body = await response.clone().json()
    if (body && typeof body.error === 'string') message = body.error
  } catch {
    // kein JSON-Body — Standardmeldung behalten
  }
  if (status === 401) return unauthorizedOutcome(message)
  if (status === 403) return forbiddenOutcome(message)
  return outcomeResponse(status, buildOperationOutcome('error', 'processing', message))
}
