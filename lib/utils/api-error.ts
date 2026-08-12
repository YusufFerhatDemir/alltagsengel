import { NextResponse } from 'next/server'

const PG_PATTERNS = [
  /violates? (?:check|foreign key|unique|not-null) constraint/i,
  /relation "[\w.]+" does not exist/i,
  /column "[\w.]+" (?:does not exist|of relation)/i,
  /duplicate key value violates unique constraint/i,
  /null value in column/i,
  /permission denied for (?:table|schema|function)/i,
  /row-level security/i,
  /syntax error at or near/i,
  /function [\w.]+\(.*\) does not exist/i,
  /could not serialize access/i,
]

function isSensitive(msg: string): boolean {
  return PG_PATTERNS.some(p => p.test(msg))
}

export function safeErrorResponse(
  error: unknown,
  status = 500,
  fallback = 'Ein interner Fehler ist aufgetreten.',
): NextResponse {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const message = isSensitive(raw) ? fallback : raw
  return NextResponse.json({ error: message }, { status })
}

export function safeDbError(
  dbError: { message: string; details?: string; hint?: string; code?: string } | null,
  status = 500,
  fallback = 'Datenbankfehler.',
): NextResponse {
  if (!dbError) return NextResponse.json({ error: fallback }, { status })
  const message = isSensitive(dbError.message) ? fallback : dbError.message
  return NextResponse.json({ error: message }, { status })
}
