/**
 * API Error Sanitizer
 *
 * Verhindert das Leaken von Stack-Traces, Datenbank-Details und internen
 * Fehlermeldungen an API-Clients. Jeder Fehler bekommt eine Korrelations-ID,
 * die serverseitig geloggt wird und dem Support-Team die Zuordnung ermoeglicht.
 *
 * Zwei Nutzungsarten:
 *
 * 1. `safeApiError(err, req)` — Drop-in-Ersatz fuer bestehende catch-Bloecke:
 *    ```ts
 *    } catch (err) {
 *      return safeApiError(err, request)
 *    }
 *    ```
 *
 * 2. `withErrorSanitizer(handler)` — HOF-Wrapper fuer neue Routen:
 *    ```ts
 *    async function _POST(req: NextRequest) { ... }
 *    export const POST = withErrorSanitizer(_POST)
 *    ```
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { logger } from '@/lib/logger'
import { UserFacingError } from '@/lib/api/user-facing-error'

const log = logger.child('api')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function extractPath(request?: Request | NextRequest): string | undefined {
  if (!request) return undefined
  try {
    return new URL(request.url).pathname
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// safeApiError — Drop-in fuer bestehende catch-Bloecke
// ---------------------------------------------------------------------------

/**
 * Erzeugt eine sanitisierte JSON-Fehlerantwort mit Korrelations-ID.
 *
 * - Server-Log: volle Fehlermeldung + Stack-Trace + Korrelations-ID
 * - Client-Antwort: generische Meldung + Korrelations-ID (kein Stack, kein Message)
 * - In Development wird die Fehlermeldung zusaetzlich mitgeliefert (debug_message)
 *
 * @param err       Das aufgefangene Error-Objekt (beliebiger Typ)
 * @param request   Optional: Request-Objekt fuer Pfad-/Methoden-Logging
 * @param statusCode HTTP-Statuscode (Default: 500)
 */
export function safeApiError(
  err: unknown,
  request?: Request | NextRequest,
  statusCode = 500,
): NextResponse {
  const correlationId = randomUUID()
  const error = err instanceof Error ? err : new Error(String(err))

  // Server-seitiges Logging — volle Details, nie nach aussen
  log.error('API-Fehler', {
    correlationId,
    path: extractPath(request),
    method: request?.method,
    errorName: error.name,
    errorMessage: error.message,
    ...(isProduction() ? {} : { stack: error.stack }),
  })

  // Client-Antwort — sanitisiert
  const body: Record<string, unknown> = {
    error: 'Interner Serverfehler',
    correlationId,
  }

  // In Development den Originalen Fehlertext als Debug-Hilfe mitgeben,
  // aber unter eigenem Key, damit Frontend-Code nicht versehentlich
  // `response.error` als User-Meldung anzeigt.
  if (!isProduction()) {
    body.debug_message = error.message
  }

  return NextResponse.json(body, { status: statusCode })
}

// ---------------------------------------------------------------------------
// withErrorSanitizer — HOF-Wrapper fuer Route-Handler
// ---------------------------------------------------------------------------

type RouteHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse | Response> | NextResponse | Response

/**
 * Wickelt einen API-Route-Handler in einen try/catch mit Error-Sanitizer.
 *
 * Unbehandelte Fehler werden abgefangen, geloggt und als sanitisierte
 * 500-Antwort zurueckgegeben. Bewusst geworfene NextResponse-Antworten
 * (z.B. 400/401/403) bleiben unberuehrt.
 *
 * ```ts
 * async function _POST(req: NextRequest) {
 *   // ... Business-Logik, throw bei Fehlern ...
 * }
 * export const POST = withErrorSanitizer(_POST)
 * ```
 */
export function withErrorSanitizer(handler: RouteHandler): RouteHandler {
  return async (
    req: NextRequest,
    context?: { params: Promise<Record<string, string>> },
  ) => {
    try {
      return await handler(req, context)
    } catch (err) {
      return safeApiError(err, req)
    }
  }
}

// ---------------------------------------------------------------------------
// UserFacingError — Re-Export aus abhaengigkeitsfreiem Modul
// ---------------------------------------------------------------------------

/**
 * Fehlerantwort fuer Routen, die sowohl Validierungsfehler (sichtbar) als
 * auch interne Fehler (sanitisiert) produzieren koennen.
 *
 * - `UserFacingError` → Original-Meldung + zugehoeriger Statuscode
 * - alles andere      → `safeApiError` (generische Meldung + Korrelations-ID, 500)
 *
 * Fail-closed: Was nicht ausdruecklich als `UserFacingError` markiert ist,
 * wird sanitisiert. Damit kann eine durchgereichte Postgres-Meldung nicht
 * versehentlich beim Client landen.
 *
 * @param err            Aufgefangener Fehler
 * @param request        Optional: Request fuer Pfad-/Methoden-Logging
 * @param fallbackStatus Status fuer `UserFacingError` ohne eigenen Status (Default: 400)
 */
export function apiErrorResponse(
  err: unknown,
  request?: Request | NextRequest,
  fallbackStatus = 400,
): NextResponse {
  if (err instanceof UserFacingError) {
    return NextResponse.json(
      { error: err.message },
      { status: err.status || fallbackStatus },
    )
  }
  return safeApiError(err, request, 500)
}

export { UserFacingError }
