'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, statusMeta, summarizeBudget, CLIENT_STATUS, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, StatusBadge, SearchInput, EmptyRow } from '@/components/admin/OpsUI'

interface ClientRow {
  id: string
  customer_number: string | null
  first_name: string
  last_name: string
  city: string | null
  zip_code: string | null
  phone: string | null
  care_level: number | null
  insurance_name: string | null
  status: string
  budget: BudgetSummary | null
}

export default function AdminClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const year = new Date().getFullYear()
        const [clientsRes, budgetsRes] = await Promise.all([
          supabase.from('clients').select('*').order('last_name', { ascending: true }),
          supabase.from('client_budgets').select('*').eq('year', year),
        ])

        const budgetMap = new Map<string, any>()
        ;(budgetsRes.data || []).forEach((b: any) => budgetMap.set(b.client_id, b))

        const rows: ClientRow[] = (clientsRes.data || []).map((c: any) => {
          const b = budgetMap.get(c.id)
          return {
            id: c.id,
            customer_number: c.customer_number,
            first_name: c.first_name || '',
            last_name: c.last_name || '',
            city: c.city,
            zip_code: c.zip_code,
            phone: c.phone,
            care_level: c.care_level,
            insurance_name: c.insurance_name,
            status: c.status || 'active',
            budget: b ? summarizeBudget(b) : null,
          }
        })
        setClients(rows)
      } catch (err) {
        console.error('Clients load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      if (filter !== 'all' && c.status !== filter) return false
      if (!q) return true
      return (
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        (c.customer_number || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.zip_code || '').includes(q) ||
        (c.insurance_name || '').toLowerCase().includes(q)
      )
    })
  }, [clients, search, filter])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Klienten</h1>
          <p className="admin-subtitle">{clients.length} Klienten insgesamt</p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, Kundennr., Ort, Kasse…" />
      </div>

      <div className="admin-filters">
        {['all', 'active', 'new', 'paused', 'inactive'].map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : statusMeta(CLIENT_STATUS, f).label}
            {f !== 'all' && ` (${clients.filter(c => c.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Klient</th>
                <th>Kundennr.</th>
                <th>Pflegegrad</th>
                <th>Kasse</th>
                <th>Ort</th>
                <th>Status</th>
                <th>Budget</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Klienten angelegt'}</EmptyRow>
              ) : filtered.map(c => {
                const sm = statusMeta(CLIENT_STATUS, c.status)
                return (
                  <tr key={c.id} onClick={() => router.push(`/admin/clients/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                    <td style={{ fontSize: 13 }}>{c.customer_number || '—'}</td>
                    <td>{c.care_level ? `PG ${c.care_level}` : '—'}</td>
                    <td style={{ fontSize: 13 }}>{c.insurance_name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{c.zip_code ? `${c.zip_code} ` : ''}{c.city || '—'}</td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>
                      {c.budget ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AmpelDot ampel={c.budget.ampel} />
                          <BudgetBar summary={c.budget} compact />
                        </div>
                      ) : <span style={{ color: 'var(--ink5)', fontSize: 12 }}>kein Budget</span>}
                    </td>
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
