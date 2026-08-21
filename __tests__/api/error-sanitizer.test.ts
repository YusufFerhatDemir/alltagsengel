import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { safeApiError, withErrorSanitizer, apiErrorResponse, UserFacingError } from '@/lib/api/error-sanitizer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path = '/api/test', method = 'POST'): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { method })
}

async function parseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json()
}

// ---------------------------------------------------------------------------
// safeApiError
// ---------------------------------------------------------------------------

describe('safeApiError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('gibt Status 500 zurueck (Default)', async () => {
    const res = safeApiError(new Error('db crashed'))
    expect(res.status).toBe(500)
  })

  it('gibt benutzerdefinierten Statuscode zurueck', async () => {
    const res = safeApiError(new Error('nope'), undefined, 503)
    expect(res.status).toBe(503)
  })

  it('enthaelt correlationId im Body', async () => {
    const body = await parseBody(safeApiError(new Error('x')))
    expect(body.correlationId).toBeDefined()
    expect(typeof body.correlationId).toBe('string')
    // UUID v4 Format
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('zeigt generischen Fehlertext (kein Original-Message)', async () => {
    const body = await parseBody(
      safeApiError(new Error('SELECT * FROM users WHERE password = ...')),
    )
    expect(body.error).toBe('Interner Serverfehler')
    // Originale Meldung darf NICHT im error-Feld stehen
    expect(body.error).not.toContain('SELECT')
  })

  it('loggt die volle Fehlermeldung serverseitig', () => {
    const req = makeRequest('/api/billing/create')
    safeApiError(new Error('Supabase RLS denied'), req)

    expect(consoleErrorSpy).toHaveBeenCalledOnce()
    // Structured logger gibt einen einzelnen formatierten String aus
    const ausgabe = String(consoleErrorSpy.mock.calls[0][0])
    expect(ausgabe).toContain('API-Fehler')
    expect(ausgabe).toContain('Supabase RLS denied')
    expect(ausgabe).toContain('/api/billing/create')
    expect(ausgabe).toContain('POST')
  })

  it('gibt debug_message in Development zurueck', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const body = await parseBody(safeApiError(new Error('debug info')))
    expect(body.debug_message).toBe('debug info')
  })

  it('enthaelt KEIN debug_message in Production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const body = await parseBody(safeApiError(new Error('secret info')))
    expect(body.debug_message).toBeUndefined()
  })

  it('loggt keinen Stack-Trace in Production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const req = makeRequest()
    safeApiError(new Error('prod error'), req)

    const ausgabe = String(consoleErrorSpy.mock.calls[0][0])
    expect(ausgabe).not.toContain('"stack":')
  })

  it('behandelt Non-Error-Objekte (string throw)', async () => {
    const body = await parseBody(safeApiError('something broke'))
    expect(body.error).toBe('Interner Serverfehler')
    expect(String(consoleErrorSpy.mock.calls[0][0])).toContain('something broke')
  })

  it('behandelt undefined/null Fehler', async () => {
    const body = await parseBody(safeApiError(undefined))
    expect(body.error).toBe('Interner Serverfehler')
    expect(body.correlationId).toBeDefined()
  })

  it('funktioniert ohne Request-Objekt', async () => {
    const body = await parseBody(safeApiError(new Error('no req')))
    expect(body.error).toBe('Interner Serverfehler')
    expect(body.correlationId).toBeDefined()
    const ausgabe = String(consoleErrorSpy.mock.calls[0][0])
    expect(ausgabe).not.toContain('"path":')
  })

  it('generiert einzigartige correlationIds', () => {
    const ids = Array.from({ length: 10 }, () => safeApiError(new Error('x')))
      .map(async (res) => {
        const body = await parseBody(res)
        return body.correlationId
      })
    return Promise.all(ids).then((resolved) => {
      const unique = new Set(resolved)
      expect(unique.size).toBe(10)
    })
  })
})

// ---------------------------------------------------------------------------
// withErrorSanitizer
// ---------------------------------------------------------------------------

describe('withErrorSanitizer', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('laesst erfolgreiche Responses durch', async () => {
    const handler = vi.fn().mockResolvedValue(
      Response.json({ ok: true }, { status: 200 }),
    )
    const wrapped = withErrorSanitizer(handler)
    const req = makeRequest()
    const res = await wrapped(req)

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledWith(req, undefined)
  })

  it('faengt geworfene Fehler ab und sanitisiert', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const handler = vi.fn().mockRejectedValue(
      new Error('FATAL: connection pool exhausted'),
    )
    const wrapped = withErrorSanitizer(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(500)
    const body = await parseBody(res)
    expect(body.error).toBe('Interner Serverfehler')
    expect(body.correlationId).toBeDefined()
    // In Production darf die Original-Fehlermeldung nirgends im Body stehen
    expect(JSON.stringify(body)).not.toContain('connection pool')
    expect(body.debug_message).toBeUndefined()
  })

  it('laesst 400/401/403 Responses unberuehrt', async () => {
    const handler = vi.fn().mockResolvedValue(
      Response.json({ error: 'Nicht autorisiert' }, { status: 401 }),
    )
    const wrapped = withErrorSanitizer(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    const body = await parseBody(res)
    expect(body.error).toBe('Nicht autorisiert')
    // Kein correlationId bei absichtlichen Fehlern
    expect(body.correlationId).toBeUndefined()
  })

  it('gibt context/params an den Handler weiter', async () => {
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    const wrapped = withErrorSanitizer(handler)
    const req = makeRequest()
    const ctx = { params: Promise.resolve({ id: '123' }) }

    await wrapped(req, ctx)
    expect(handler).toHaveBeenCalledWith(req, ctx)
  })

  it('faengt synchrone Fehler ab', async () => {
    const handler = vi.fn().mockImplementation(() => {
      throw new Error('sync error')
    })
    const wrapped = withErrorSanitizer(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(500)
    const body = await parseBody(res)
    expect(body.error).toBe('Interner Serverfehler')
  })

  it('Stack-Trace wird nie an den Client gesendet', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const handler = vi.fn().mockRejectedValue(new Error('oops'))
    const wrapped = withErrorSanitizer(handler)
    const res = await wrapped(makeRequest())
    const text = await res.clone().text()

    expect(text).not.toContain('at ')
    expect(text).not.toContain('.ts:')
    expect(text).not.toContain('.js:')
  })
})

// ---------------------------------------------------------------------------
// apiErrorResponse / UserFacingError
// ---------------------------------------------------------------------------

describe('apiErrorResponse', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('liefert die Meldung eines UserFacingError im Klartext aus', async () => {
    const res = apiErrorResponse(new UserFacingError('Titel ist ein Pflichtfeld.'))
    expect(res.status).toBe(400)
    expect(await parseBody(res)).toEqual({ error: 'Titel ist ein Pflichtfeld.' })
  })

  it('uebernimmt den Statuscode des UserFacingError', async () => {
    const res = apiErrorResponse(new UserFacingError('Bereits gesperrt.', 409))
    expect(res.status).toBe(409)
    expect((await parseBody(res)).error).toBe('Bereits gesperrt.')
  })

  it('sanitisiert einen gewoehnlichen Error und antwortet mit 500', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = apiErrorResponse(
      new Error('Aufgaben konnten nicht geladen werden: relation "ops_aufgaben" does not exist'),
      makeRequest(),
    )
    expect(res.status).toBe(500)
    const body = await parseBody(res)
    expect(body.error).toBe('Interner Serverfehler')
    expect(body.correlationId).toEqual(expect.any(String))
    expect(JSON.stringify(body)).not.toContain('ops_aufgaben')
  })

  it('leakt keine Postgres-Details, auch wenn ein 400 erwartet wurde', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const dbErr = new Error('new row violates row-level security policy for table "ops_aufgaben"')
    const res = apiErrorResponse(dbErr, makeRequest(), 400)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await parseBody(res))).not.toContain('row-level security')
  })

  it('behandelt Nicht-Error-Werte fail-closed', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = apiErrorResponse('irgendein string', makeRequest())
    expect(res.status).toBe(500)
    expect((await parseBody(res)).error).toBe('Interner Serverfehler')
  })
})

describe('UserFacingError', () => {
  it('nutzt 400 als Standard-Status', () => {
    expect(new UserFacingError('x').status).toBe(400)
  })

  it('ist eine Error-Instanz mit eigenem Namen', () => {
    const err = new UserFacingError('x')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('UserFacingError')
  })
})
