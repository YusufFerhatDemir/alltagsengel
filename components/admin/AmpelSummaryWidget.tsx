'use client'
// ═══════════════════════════════════════════════════════════════
// AmpelSummaryWidget — kompakte Ampel-Zusammenfassung für den
// Monatsabschluss-Assistenten (🟢/🟡/🔴 Klienten-Anzahl im Monat)
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AMPEL_META, type Ampel } from '@/lib/admin/ops'

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

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10)

        const [closingsRes, recordsRes] = await Promise.all([
          supabase.from('monthly_closings').select('client_id, ampel').eq('year', year).eq('month', month),
          supabase.from('service_records').select('id, client_id, status').gte('date', monthStart).lte('date', monthEnd),
        ])

        const closingByClient = new Map<string, Ampel>()
        for (const c of closingsRes.data || []) closingByClient.set(c.client_id, c.ampel as Ampel)

        // Klienten mit Einsätzen in diesem Monat, aber (noch) ohne monthly_closings-Zeile
        const recordsByClient = new Map<string, { id: string; status: string }[]>()
        for (const r of (recordsRes.data || []) as any[]) {
          const arr = recordsByClient.get(r.client_id) || []
          arr.push({ id: r.id, status: r.status })
          recordsByClient.set(r.client_id, arr)
        }

        const clientIds = new Set<string>([...closingByClient.keys(), ...recordsByClient.keys()])

        const reviewErrorsByRecord = new Map<string, { severity: string }[]>()
        const recordIds = (recordsRes.data || []).map((r: any) => r.id)
        if (recordIds.length > 0) {
          const { data: errs } = await supabase
            .from('review_errors')
            .select('service_record_id, severity, resolved')
            .in('service_record_id', recordIds)
            .eq('resolved', false)
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
        console.error('AmpelSummaryWidget load error:', err)
        if (!cancelled) setCounts({ gruen: 0, gelb: 0, rot: 0 })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [year, month, refreshKey])

  return (
    <div className="admin-stats-grid" style={{ marginBottom: 20 }}>
      <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.gruen.color}` }}>
        <div className="admin-stat-value">{loading ? '…' : counts?.gruen ?? 0}</div>
        <div className="admin-stat-label">🟢 Im Rahmen</div>
      </div>
      <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.gelb.color}` }}>
        <div className="admin-stat-value">{loading ? '…' : counts?.gelb ?? 0}</div>
        <div className="admin-stat-label">🟡 Achtung</div>
      </div>
      <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.rot.color}` }}>
        <div className="admin-stat-value">{loading ? '…' : counts?.rot ?? 0}</div>
        <div className="admin-stat-label">🔴 Kritisch</div>
      </div>
    </div>
  )
}
