'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, formatTime, fullName, statusMeta,
  RECORD_STATUS, BUDGET_TYPE,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
const log = logger.child('admin:records')

interface RecordRow {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  service_type: string | null
  budget_type: string | null
  amount: number | null
  status: string
  has_signature: boolean
  client: string
  caregiver: string
}

function RecordsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focus = searchParams.get('focus')
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('service_records')
          .select('id, date, start_time, end_time, duration_minutes, service_type, budget_type, amount, status, client_signature, client:clients(first_name, last_name), caregiver:caregivers(first_name, last_name)')
          .order('date', { ascending: false })
          .limit(300)
        if (error) { log.errorWithException('Records load error', error); setLoading(false); return }
        setRecords((data || []).map((r: any) => ({
          id: r.id,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          duration_minutes: r.duration_minutes,
          service_type: r.service_type,
          budget_type: r.budget_type,
          amount: r.amount,
          status: r.status,
          has_signature: !!r.client_signature,
          client: fullName(r.client),
          caregiver: fullName(r.caregiver),
        })))
      } catch (err) {
        log.errorWithException('Records page error', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return r.client.toLowerCase().includes(q) || r.caregiver.toLowerCase().includes(q) || (r.service_type || '').toLowerCase().includes(q)
    })
  }, [records, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Leistungsnachweise</h1>
          <p className="admin-subtitle">{records.length} Nachweise insgesamt</p>
        </div>
        <button onClick={() => router.push('/admin/records/new')} style={primaryBtn}>+ Neuer Nachweis</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient, Kraft, Leistung…" />
      </div>

      <div className="admin-filters">
        {['all', 'draft', 'incomplete', 'complete', 'signed', 'invoiced'].map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : statusMeta(RECORD_STATUS, f).label}
            {f !== 'all' && ` (${records.filter(r => r.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Datum</th><th>Klient</th><th>Kraft</th><th>Leistung</th>
                <th>Dauer</th><th>Budget</th><th>Betrag</th><th>Unterschr.</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={9}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Nachweise erfasst'}</EmptyRow>
              ) : filtered.map(r => {
                const rm = statusMeta(RECORD_STATUS, r.status)
                return (
                  <tr key={r.id} style={focus === r.id ? { background: 'rgba(201,150,60,.10)' } : undefined}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                    <td style={{ fontWeight: 600 }}>{r.client}</td>
                    <td>{r.caregiver}</td>
                    <td>{r.service_type || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {r.duration_minutes ? `${r.duration_minutes} Min` : `${formatTime(r.start_time)}–${formatTime(r.end_time)}`}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.budget_type ? (BUDGET_TYPE[r.budget_type] || r.budget_type) : '—'}</td>
                    <td>{euro(r.amount)}</td>
                    <td style={{ textAlign: 'center' }}>{r.has_signature ? '✅' : '—'}</td>
                    <td><StatusBadge label={rm.label} color={rm.color} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AdminRecordsPage() {
  return (
    <Suspense fallback={<div className="admin-page"><h1>Leistungsnachweise</h1><p>Laden…</p></div>}>
      <RecordsInner />
    </Suspense>
  )
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
