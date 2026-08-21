/**
 * In-Memory Metriken — leichtgewichtiger Ring-Buffer fuer API-Performance.
 *
 * Speichert die letzten MAX_ENTRIES Requests mit Antwortzeit, Status und
 * Pfad. Berechnet p50/p95/p99 sowie Fehlerrate pro Endpunkt.
 *
 * ACHTUNG: In-Memory heisst pro Serverless-Instanz. Die Daten sind nicht
 * persistent und nicht instanzuebergreifend — fuer eine grobe Uebersicht
 * reicht das, fuer echtes APM nicht.
 */

export interface MetricEntry {
  path: string
  method: string
  statusCode: number
  durationMs: number
  timestamp: number
}

export interface EndpointStats {
  path: string
  count: number
  errors: number
  errorRate: number
  p50: number
  p95: number
  p99: number
}

export interface MetricsSummary {
  totalRequests: number
  totalErrors: number
  errorRate: number
  uptimeSecs: number
  endpoints: EndpointStats[]
  /** Wann diese Instanz gestartet wurde (ISO). */
  instanceStartedAt: string
}

// ---------------------------------------------------------------------------
// Ring-Buffer
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 1000
const buffer: MetricEntry[] = []
let writeIndex = 0
let totalRecorded = 0
const instanceStartedAt = new Date().toISOString()

export function recordMetric(entry: MetricEntry): void {
  if (buffer.length < MAX_ENTRIES) {
    buffer.push(entry)
  } else {
    buffer[writeIndex] = entry
  }
  writeIndex = (writeIndex + 1) % MAX_ENTRIES
  totalRecorded++
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export function getMetrics(): MetricsSummary {
  const entries = buffer.slice()

  // Gruppieren nach Pfad
  const byPath = new Map<string, MetricEntry[]>()
  for (const e of entries) {
    const existing = byPath.get(e.path)
    if (existing) {
      existing.push(e)
    } else {
      byPath.set(e.path, [e])
    }
  }

  const endpoints: EndpointStats[] = []
  let totalErrors = 0

  for (const [path, group] of byPath) {
    const durations = group.map(e => e.durationMs).sort((a, b) => a - b)
    const errors = group.filter(e => e.statusCode >= 500).length
    totalErrors += errors

    endpoints.push({
      path,
      count: group.length,
      errors,
      errorRate: group.length > 0 ? Math.round((errors / group.length) * 10000) / 100 : 0,
      p50: Math.round(percentile(durations, 50)),
      p95: Math.round(percentile(durations, 95)),
      p99: Math.round(percentile(durations, 99)),
    })
  }

  // Nach Anzahl sortieren, haeufigste zuerst
  endpoints.sort((a, b) => b.count - a.count)

  const startMs = new Date(instanceStartedAt).getTime()
  const uptimeSecs = Math.round((Date.now() - startMs) / 1000)

  return {
    totalRequests: entries.length,
    totalErrors,
    errorRate: entries.length > 0
      ? Math.round((totalErrors / entries.length) * 10000) / 100
      : 0,
    uptimeSecs,
    endpoints,
    instanceStartedAt,
  }
}

/**
 * Fuer Tests: Buffer leeren.
 */
export function resetMetrics(): void {
  buffer.length = 0
  writeIndex = 0
  totalRecorded = 0
}
