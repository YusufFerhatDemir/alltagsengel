import { describe, it, expect } from 'vitest'
import { NextResponse } from 'next/server'
import {
  buildOperationOutcome,
  exceptionOutcome,
  forbiddenOutcome,
  invalidOutcome,
  notFoundOutcome,
  toFhirErrorResponse,
  unauthorizedOutcome,
} from '@/lib/fhir/operation-outcome'

describe('buildOperationOutcome', () => {
  it('baut eine gültige OperationOutcome-Ressource', () => {
    const outcome = buildOperationOutcome('error', 'not-found', 'Patient/abc wurde nicht gefunden.')
    expect(outcome).toEqual({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient/abc wurde nicht gefunden.' }],
    })
  })
})

describe('HTTP-Helfer liefern korrekten Status + FHIR-Content-Type', () => {
  it('notFoundOutcome liefert 404 mit resourceType/id in den diagnostics', async () => {
    const res = notFoundOutcome('Patient', 'abc-123')
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toContain('application/fhir+json')
    const body = await res.json()
    expect(body.resourceType).toBe('OperationOutcome')
    expect(body.issue[0].code).toBe('not-found')
    expect(body.issue[0].diagnostics).toContain('Patient/abc-123')
  })

  it('forbiddenOutcome liefert 403', async () => {
    const res = forbiddenOutcome()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.issue[0].code).toBe('forbidden')
  })

  it('unauthorizedOutcome liefert 401 mit code "security"', async () => {
    const res = unauthorizedOutcome()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.issue[0].code).toBe('security')
  })

  it('invalidOutcome liefert 400 mit code "invalid"', async () => {
    const res = invalidOutcome('Parameter "patient" fehlt.')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.issue[0].code).toBe('invalid')
    expect(body.issue[0].diagnostics).toBe('Parameter "patient" fehlt.')
  })

  it('exceptionOutcome liefert 500 mit severity "fatal"', async () => {
    const res = exceptionOutcome('Unerwarteter Fehler.')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.issue[0].severity).toBe('fatal')
  })
})

describe('toFhirErrorResponse', () => {
  it('wandelt eine 401-JSON-Antwort in eine OperationOutcome mit code "security" um', async () => {
    const original = NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    const res = await toFhirErrorResponse(original)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.resourceType).toBe('OperationOutcome')
    expect(body.issue[0].code).toBe('security')
    expect(body.issue[0].diagnostics).toBe('Nicht autorisiert.')
  })

  it('wandelt eine 403-JSON-Antwort in eine OperationOutcome mit code "forbidden" um', async () => {
    const original = NextResponse.json({ error: 'Nur fuer Administratoren.' }, { status: 403 })
    const res = await toFhirErrorResponse(original)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.issue[0].code).toBe('forbidden')
    expect(body.issue[0].diagnostics).toBe('Nur fuer Administratoren.')
  })
})
