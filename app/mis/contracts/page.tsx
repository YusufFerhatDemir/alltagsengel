'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'
import { createContract, updateContractStatus, deleteContract } from './actions'

// ===== Vertrags-Status-Labels =====
const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: '#8A8278' },
  pending: { label: 'In Prüfung', color: '#F59E0B' },
  active: { label: 'Aktiv', color: '#22C55E' },
  expiring: { label: 'Läuft ab', color: '#F97316' },
  expired: { label: 'Abgelaufen', color: '#EF4444' },
  terminated: { label: 'Gekündigt', color: '#6B7280' },
}

const CONTRACT_TYPES = ['Alle', 'Arbeitsvertrag', 'Kooperation', 'Dienstleistung', 'Mietvertrag', 'Versicherung', 'Sonstige']

interface Contract {
  id: string
  title: string
  partner: string
  type: string
  status: string
  start_date: string
  end_date: string | null
  value: number | null
  auto_renew: boolean
  notice_period_days: number
  notes: string
  created_at: string
  updated_at: string
}

// ===== VERTRAGSMANAGEMENT =====
export default function ContractsPage() {
  const { isMobile } = useMis()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('Alle')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [form, setForm] = useState({
    title: '', partner: '', type: 'Arbeitsvertrag', status: 'draft',
    start_date: '', end_date: '', value: '', auto_renew: false,
    notice_period_days: '30', notes: '',
  })

  useEffect(() => { loadContracts() }, [])

  async function loadContracts() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('mis_contracts')
        .select('*')
        .order('end_date', { ascending: true, nullsFirst: false })
      if (error) console.error('Contracts error:', error)
      setContracts(data as Contract[] || [])
    } catch (err) {
      console.error('Contracts load error:', err)
    }
    setLoading(false)
  }

  async function handleCreate() {
    const result = await createContract({
      title: form.title,
      partner: form.partner,
      type: form.type,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date,
      value: form.value,
      auto_renew: form.auto_renew,
      notice_period_days: form.notice_period_days,
      notes: form.notes,
    })
    if (result.ok) {
      setCreateOpen(false)
      setForm({ title: '', partner: '', type: 'Arbeitsvertrag', status: 'draft', start_date: '', end_date: '', value: '', auto_renew: false, notice_period_days: '30', notes: '' })
      loadContracts()
    } else {
      alert('Fehler: ' + result.error)
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    await updateContractStatus(id, newStatus)
    loadContracts()
  }

  async function handleDelete(id: string) {
    if (!confirm('Vertrag wirklich löschen?')) return
    await deleteContract(id)
    setSelectedContract(null)
    loadContracts()
  }

  // Filter
  const filtered = contracts.filter(c => {
    const matchesSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.partner.toLowerCase().includes(search.toLowerCase())
    const matchesType = activeTab === 'Alle' || c.type === activeTab
    return matchesSearch && matchesType
  })

  // KPIs
  const active = contracts.filter(c => c.status === 'active').length
  const expiringSoon = contracts.filter(c => {
    if (!c.end_date) return false
    const diff = (new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff <= 60 && c.status === 'active'
  }).length
  const totalValue = contracts.filter(c => c.status === 'active').reduce((s, c) => s + (c.value || 0), 0)

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'
  const formatCurrency = (v: number | null) => v != null ? `€${v.toLocaleString('de-DE', { minimumFractionDigits: 2 })}` : '—'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Vertragsmanagement"
        subtitle="Alle Verträge, Laufzeiten und Kündigungsfristen im Blick"
        icon="files"
        actions={
          <MisButton icon="plus" onClick={() => setCreateOpen(true)}>
            Neuer Vertrag
          </MisButton>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Gesamt', value: contracts.length, icon: 'files', color: BRAND.gold },
          { label: 'Aktiv', value: active, icon: 'check', color: BRAND.success },
          { label: 'Läuft bald ab', value: expiringSoon, icon: 'clock', color: BRAND.warning },
          { label: 'Aktiver Wert', value: formatCurrency(totalValue), icon: 'banknote', color: BRAND.info },
        ].map((kpi, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${kpi.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MIcon name={kpi.icon} size={18} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.text }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: BRAND.muted }}>{kpi.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Vertrag oder Partner suchen..." />
        </div>
      </div>

      <Tabs
        tabs={CONTRACT_TYPES.map(t => ({ id: t, label: t }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Contracts Table */}
      {loading ? (
        <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Verträge...</div></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon="files" title="Keine Verträge" description="Noch keine Verträge angelegt. Erstellen Sie den ersten Vertrag." />
      ) : (
        <Card noPad>
          <DataTable
            columns={[
              { key: 'title', label: 'Vertrag', render: (r: Record<string, unknown>) => (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.title)}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.partner)}</div>
                </div>
              )},
              { key: 'type', label: 'Typ' },
              { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                const s = CONTRACT_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                return <Badge label={s.label} color={s.color} />
              }},
              { key: 'start_date', label: 'Beginn', render: (r: Record<string, unknown>) => formatDate(r.start_date as string | null) },
              { key: 'end_date', label: 'Ende', render: (r: Record<string, unknown>) => {
                const end = r.end_date as string | null
                if (!end) return <span style={{ color: BRAND.muted }}>Unbefristet</span>
                const diff = (new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                const color = diff <= 30 ? BRAND.error : diff <= 60 ? BRAND.warning : BRAND.text
                return <span style={{ color, fontWeight: diff <= 60 ? 700 : 400 }}>{formatDate(end)}</span>
              }},
              { key: 'value', label: 'Wert', render: (r: Record<string, unknown>) => formatCurrency(r.value as number | null) },
              { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                <MisButton variant="secondary" icon="eye" onClick={() => setSelectedContract(r as unknown as Contract)}>
                  {isMobile ? '' : 'Details'}
                </MisButton>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </Card>
      )}

      {/* Create Modal */}
      {createOpen && (
        <Modal open title="Neuer Vertrag" onClose={() => setCreateOpen(false)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vertragsbezeichnung *</label>
              <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="z.B. Arbeitsvertrag Max Mustermann" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vertragspartner *</label>
              <input style={inputStyle} value={form.partner} onChange={e => setForm({ ...form, partner: e.target.value })} placeholder="Name oder Firma" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vertragsart</label>
                <select style={inputStyle} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {CONTRACT_TYPES.filter(t => t !== 'Alle').map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Status</label>
                <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vertragsbeginn</label>
                <input style={inputStyle} type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vertragsende</label>
                <input style={inputStyle} type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vertragswert (€)</label>
                <input style={inputStyle} type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="0,00" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Kündigungsfrist (Tage)</label>
                <input style={inputStyle} type="number" value={form.notice_period_days} onChange={e => setForm({ ...form, notice_period_days: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.auto_renew} onChange={e => setForm({ ...form, auto_renew: e.target.checked })} />
              <label style={{ fontSize: 13, color: BRAND.text }}>Automatische Verlängerung</label>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Zusätzliche Informationen..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreate} disabled={!form.title || !form.partner}>Vertrag anlegen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {selectedContract && (
        <Modal open title={selectedContract.title} onClose={() => setSelectedContract(null)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Partner</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{selectedContract.partner}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Typ</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedContract.type}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={CONTRACT_STATUS[selectedContract.status]?.label || selectedContract.status} color={CONTRACT_STATUS[selectedContract.status]?.color || BRAND.muted} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Wert</div>
                <div style={{ fontSize: 14, color: BRAND.gold, fontWeight: 700 }}>{formatCurrency(selectedContract.value)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Beginn</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDate(selectedContract.start_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Ende</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedContract.end_date ? formatDate(selectedContract.end_date) : 'Unbefristet'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Kündigungsfrist</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedContract.notice_period_days} Tage</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Auto-Verlängerung</div>
                <div style={{ fontSize: 14, color: selectedContract.auto_renew ? BRAND.success : BRAND.muted }}>{selectedContract.auto_renew ? 'Ja' : 'Nein'}</div>
              </div>
            </div>
            {selectedContract.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedContract.notes}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedContract.status === 'draft' && <MisButton icon="check" onClick={() => { handleStatusChange(selectedContract.id, 'active'); setSelectedContract(null) }}>Aktivieren</MisButton>}
                {selectedContract.status === 'active' && <MisButton icon="clock" variant="secondary" onClick={() => { handleStatusChange(selectedContract.id, 'terminated'); setSelectedContract(null) }}>Kündigen</MisButton>}
              </div>
              <MisButton variant="danger" icon="trash" onClick={() => handleDelete(selectedContract.id)}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
