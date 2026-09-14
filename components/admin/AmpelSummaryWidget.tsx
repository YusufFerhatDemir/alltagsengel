'use client'
import { datumBerlin } from '@/lib/utils/timezone';
// ═══════════════════════════════════════════════════════════════
// AmpelSummaryWidget — kompakte Ampel-Zusammenfassung für den
// Monatsabschluss-Assistenten (🟢/🟡/🔴 Klienten-Anzahl im Monat)
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AMPEL_META, type Ampel } from '@/lib/admin/ops'
import { logger } from '@/lib/logger';
const log = logger.child('ui:AmpelSummaryWidget');

interface AmpelCounts {
  gruen: number
  gelb: number
  rot: number
}

export default function AmpelSummaryWidget({ year, month, refreshKey }: {
  year: number
  month: number
  refreshKey?: number
}) {
  const [counts, setCounts] = useState<AmpelCounts | null>(null)
  const [loading, setLoading] = useState(true)
  /** Welche Quelle nicht lesbar war (Block 87) — null, wenn alles ging. */
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setFehler(null)
      try {
        const supabase = createClient()
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = datumBerlin(new Date(year, month, 0))

        const [closingsRes, recordsRes] = await Promise.all([
          supabase.from('monthly_closings').select('client_id, ampel').eq('year', year).eq('month', month),
          supabase.from('service_records').select('id, client_id, status').gte('date', monthStart).lte('date', monthEnd),
        ])

        // BEFUND (Block 87): beide Abfragen wurden ungeprueft
        // weiterverarbeitet. Die Pruefefehler werden wenige Zeilen
        // darunter ausdruecklich geprueft — mit dem Satz „Ihr Verlust
        // liess das Widget gruen melden, obwohl niemand nachgesehen hat".
        // Genau diese Pruefung wird UEBERSPRUNGEN, wenn `recordsRes`
        // ausfaellt: `recordIds` ist dann leer und die Abfrage laeuft gar
        // nicht erst.
        //
        // Und der catch darunter setzte alles auf null — drei Kacheln mit
        // „0", die sich lesen wie „nichts zu tun".
        const nichtLesbar = ([
          ['Monatsabschlüsse', closingsRes.error],
          ['Leistungsnachweise', recordsRes.error],
        ] as const).filter(([, fehler]) => fehler != null).map(([name]) => name)

        if (nichtLesbar.length > 0) {
          log.error('AmpelSummaryWidget: Abfragen fehlgeschlagen', {
            bereiche: nichtLesbar.join(', '),
          })
          if (!cancelled) { setCounts(null); setFehler(nichtLesbar.join(' und ')) }
          return
        }

        const closingByClient = new Map<string, Ampel>()
        for (const c of closingsRes.data || []) closingByClient.set(c.client_id, c.ampel as Ampel)

        // Klienten mit Einsätzen in diesem Monat, aber (noch) ohne monthly_closings-Zeile
        const recordsByClient = new Map<string, { id: string; status: string }[]>()
        for (const r of (recordsRes.data || [])) {
          const arr = recordsByClient.get(r.client_id) || []
          arr.push({ id: r.id, status: r.status })
          recordsByClient.set(r.client_id, arr)
        }

        const clientIds = new Set<string>([...closingByClient.keys(), ...recordsByClient.keys()])

        const reviewErrorsByRecord = new Map<string, { severity: string }[]>()
        const recordIds = (recordsRes.data || []).map((r: any) => r.id)
        if (recordIds.length > 0) {
          // Die offenen Pruefefehler faerben die Ampel gelb und rot. Ihr
          // Verlust liess das Widget gruen melden, obwohl niemand nachgesehen
          // hat — der Leerzustand ist hier eine Entwarnung.
          const { data: errs, error: errsErr } = await supabase
            .from('review_errors')
            .select('service_record_id, severity, resolved')
            .in('service_record_id', recordIds)
            .eq('resolved', false)
          if (errsErr) throw errsErr
          for (const e of errs || []) {
            const arr = reviewErrorsByRecord.get(e.service_record_id) || []
            arr.push({ severity: e.severity })
            reviewErrorsByRecord.set(e.service_record_id, arr)
          }
        }

        const result: AmpelCounts = { gruen: 0, gelb: 0, rot: 0 }
        for (const clientId of clientIds) {
          // Falls Monatsabschluss bereits existiert → dessen Ampel verwenden
          const existing = closingByClient.get(clientId)
          if (existing) {
            result[existing]++
            continue
          }
          // Sonst: virtuelle Ampel aus Leistungsnachweisen + Prüf-Fehlern berechnen
          const records = recordsByClient.get(clientId) || []
          let hasCritical = false
          let hasWarning = false
          let hasIncomplete = false
          for (const r of records) {
            if (r.status === 'incomplete' || r.status === 'draft') hasIncomplete = true
            const errs = reviewErrorsByRecord.get(r.id) || []
            for (const e of errs) {
              if (e.severity === 'critical') hasCritical = true
              else if (e.severity === 'warning') hasWarning = true
            }
          }
          const ampel: Ampel = hasCritical ? 'rot' : (hasWarning || hasIncomplete) ? 'gelb' : 'gruen'
          result[ampel]++
        }

        if (!cancelled) setCounts(result)
      } catch (err) {
        // Hierher fuehrt auch `throw errsErr`. Vorher endete das in drei
        // Nullen — der ruhigsten aller Anzeigen.
        log.errorWithException('AmpelSummaryWidget load error', err)
        if (!cancelled) { setCounts(null); setFehler('Prüfergebnisse') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [year, month, refreshKey])

  // Ohne Zahlen KEINE Nullen: drei Kacheln mit „0" lesen sich wie
  // „nichts zu tun" — und das ist die eine Aussage, die dieses Widget
  // nach einem Lesefehler nicht treffen darf.
  if (fehler) {
    return (
      <div className="admin-stats-grid" style={{ marginBottom: 20 }}>
        <div className="admin-stat-card" style={{ gridColumn: '1 / -1', borderLeft: '3px solid #D04B3B' }}>
          <div className="admin-stat-value">—</div>
          <div className="admin-stat-label">
            Ampel nicht ermittelbar ({fehler} nicht lesbar)
          </div>
        </div>
      </div>
    )
  }

  const zahl = (n: number | undefined) => loading ? '…' : n ?? '—'

  return (
    <div className="admin-stats-grid" style={{ marginBottom: 20 }}>
      <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.gruen.color}` }}>
        <div className="admin-stat-value">{zahl(counts?.gruen)}</div>
        <div className="admin-stat-label">🟢 Im Rahmen</div>
      </div>
      <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.gelb.color}` }}>
        <div className="admin-stat-value">{zahl(counts?.gelb)}</div>
        <div className="admin-stat-label">🟡 Achtung</div>
      </div>
      <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.rot.color}` }}>
        <div className="admin-stat-value">{zahl(counts?.rot)}</div>
        <div className="admin-stat-label">🔴 Kritisch</div>
      </div>
    </div>
  )
}
