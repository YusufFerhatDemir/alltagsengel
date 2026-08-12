'use client'
import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'

// ===== Unterschrift-Status =====
const SIG_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: '#F59E0B' },
  sent: { label: 'Gesendet', color: '#3B82F6' },
  signed: { label: 'Unterschrieben', color: '#22C55E' },
  declined: { label: 'Abgelehnt', color: '#EF4444' },
  expired: { label: 'Abgelaufen', color: '#6B7280' },
}

interface SignatureRequest {
  id: string
  document_title: string
  document_type: string
  signer_name: string
  signer_email: string
  status: string
  sent_at: string | null
  signed_at: string | null
  expires_at: string | null
  notes: string
  file_url: string | null
  created_at: string
}

// ===== UNTERSCHRIFTEN-MANAGEMENT =====
export default function SignaturesPage() {
  const { isMobile } = useMis()
  const [requests, setRequests] = useState<SignatureRequest[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedReq, setSelectedReq] = useState<SignatureRequest | null>(null)
  const [form, setForm] = useState({
    document_title: '', document_type: 'Vertrag', signer_name: '', signer_email: '',
    expires_at: '', notes: '',
  })

  useEffect(() => { loadRequests() }, [])

  async function loadRequests() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('mis_signature_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) console.error('Signatures error:', error)
      setRequests(data as SignatureRequest[] || [])
    } catch (err) {
      console.error('Signatures load error:', err)
    }
    setLoading(false)
  }

  async function handleCreate() {
    const supabase = createClient()
    const { error } = await supabase.from('mis_signature_requests').insert({
      document_title: form.document_title,
      document_type: form.document_type,
      signer_name: form.signer_name,
      signer_email: form.signer_email,
      status: 'pending',
      expires_at: form.expires_at || null,
      notes: form.notes,
    })
    if (!error) {
      setCreateOpen(false)
      setForm({ document_title: '', document_type: 'Vertrag', signer_name: '', signer_email: '', expires_at: '', notes: '' })
      loadRequests()
    } else {
      alert('Fehler: ' + error.message)
    }
  }

  async function handleStatusUpdate(id: string, status: string, extras?: Record<string, unknown>) {
    const supabase = createClient()
    await supabase.from('mis_signature_requests').update({
      status,
      ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
      ...(status === 'signed' ? { signed_at: new Date().toISOString() } : {}),
      ...extras,
    }).eq('id', id)
    setSelectedReq(null)
    loadRequests()
  }

  async function handleDelete(id: string) {
    if (!confirm('Unterschriftsanfrage wirklich löschen?')) return
    const supabase = createClient()
    await supabase.from('mis_signature_requests').delete().eq('id', id)
    setSelectedReq(null)
    loadRequests()
  }

  // Filter
  const tabs = [
    { id: 'all', label: `Alle (${requests.length})` },
    { id: 'pending', label: `Ausstehend (${requests.filter(r => r.status === 'pending').length})` },
    { id: 'sent', label: `Gesendet (${requests.filter(r => r.status === 'sent').length})` },
    { id: 'signed', label: `Unterschrieben (${requests.filter(r => r.status === 'signed').length})` },
  ]

  const filtered = requests.filter(r => {
    const matchesSearch = !search || r.document_title.toLowerCase().includes(search.toLowerCase()) || r.signer_name.toLowerCase().includes(search.toLowerCase())
    const matchesTab = activeTab === 'all' || r.status === activeTab
    return matchesSearch && matchesTab
  })

  // KPIs
  const pending = requests.filter(r => r.status === 'pending' || r.status === 'sent').length
  const signed = requests.filter(r => r.status === 'signed').length
  const declined = requests.filter(r => r.status === 'declined').length
  const signRate = requests.length > 0 ? Math.round((signed / requests.length) * 100) : 0

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'
  const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Unterschriften"
        subtitle="Digitale Unterschriftsanfragen verwalten und nachverfolgen"
        icon="pen"
        actions={
          <MisButton icon="plus" onClick={() => setCreateOpen(true)}>
            Neue Anfrage
          </MisButton>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Gesamt', value: requests.length, icon: 'files', color: BRAND.gold },
          { label: 'Ausstehend', value: pending, icon: 'clock', color: BRAND.warning },
          { label: 'Unterschrieben', value: signed, icon: 'check', color: BRAND.success },
          { label: 'Signierrate', value: `${signRate}%`, icon: 'trending', color: BRAND.info },
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

      {/* Search */}
      <SearchInput value={search} onChange={setSearch} placeholder="Dokument oder Unterzeichner suchen..." />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Table */}
      {loading ? (
        <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Anfragen...</div></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon="pen" title="Keine Unterschriftsanfragen" description="Erstellen Sie eine neue Anfrage, um ein Dokument zur Unterschrift zu versenden." />
      ) : (
        <Card noPad>
          <DataTable
            columns={[
              { key: 'document_title', label: 'Dokument', render: (r: Record<string, unknown>) => (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.document_title)}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.document_type)}</div>
                </div>
              )},
              { key: 'signer_name', label: 'Unterzeichner', render: (r: Record<string, unknown>) => (
                <div>
                  <div style={{ fontSize: 13, color: BRAND.text }}>{String(r.signer_name)}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.signer_email)}</div>
                </div>
              )},
              { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                const s = SIG_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                return <Badge label={s.label} color={s.color} />
              }},
              { key: 'sent_at', label: 'Gesendet', render: (r: Record<string, unknown>) => formatDate(r.sent_at as string | null) },
              { key: 'signed_at', label: 'Signiert', render: (r: Record<string, unknown>) => formatDate(r.signed_at as string | null) },
              { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                <MisButton variant="secondary" icon="eye" onClick={() => setSelectedReq(r as unknown as SignatureRequest)}>
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
        <Modal open title="Neue Unterschriftsanfrage" onClose={() => setCreateOpen(false)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Dokumentbezeichnung *</label>
              <input style={inputStyle} value={form.document_title} onChange={e => setForm({ ...form, document_title: e.target.value })} placeholder="z.B. Arbeitsvertrag Max Mustermann" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Dokumenttyp</label>
              <select style={inputStyle} value={form.document_type} onChange={e => setForm({ ...form, document_type: e.target.value })}>
                {['Vertrag', 'Vollmacht', 'Datenschutzerklärung', 'Einverständniserklärung', 'Kündigung', 'Sonstiges'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Unterzeichner Name *</label>
                <input style={inputStyle} value={form.signer_name} onChange={e => setForm({ ...form, signer_name: e.target.value })} placeholder="Vor- und Nachname" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>E-Mail *</label>
                <input style={inputStyle} type="email" value={form.signer_email} onChange={e => setForm({ ...form, signer_email: e.target.value })} placeholder="email@beispiel.de" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Ablaufdatum</label>
              <input style={inputStyle} type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Zusätzliche Hinweise..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="send" onClick={handleCreate} disabled={!form.document_title || !form.signer_name || !form.signer_email}>Anfrage erstellen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {selectedReq && (
        <Modal open title={selectedReq.document_title} onClose={() => setSelectedReq(null)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Typ</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedReq.document_type}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={SIG_STATUS[selectedReq.status]?.label || selectedReq.status} color={SIG_STATUS[selectedReq.status]?.color || BRAND.muted} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Unterzeichner</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{selectedReq.signer_name}</div>
                <div style={{ fontSize: 12, color: BRAND.muted }}>{selectedReq.signer_email}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Erstellt am</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDateTime(selectedReq.created_at)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Gesendet</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDateTime(selectedReq.sent_at)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Signiert</div>
                <div style={{ fontSize: 14, color: selectedReq.signed_at ? BRAND.success : BRAND.muted, fontWeight: selectedReq.signed_at ? 700 : 400 }}>
                  {formatDateTime(selectedReq.signed_at)}
                </div>
              </div>
            </div>
            {selectedReq.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedReq.notes}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedReq.status === 'pending' && <MisButton icon="send" onClick={() => handleStatusUpdate(selectedReq.id, 'sent')}>Versenden</MisButton>}
                {selectedReq.status === 'sent' && <MisButton icon="check" onClick={() => handleStatusUpdate(selectedReq.id, 'signed')}>Als signiert markieren</MisButton>}
                {(selectedReq.status === 'pending' || selectedReq.status === 'sent') && (
                  <MisButton variant="secondary" icon="x" onClick={() => handleStatusUpdate(selectedReq.id, 'declined')}>Ablehnen</MisButton>
                )}
              </div>
              <MisButton variant="danger" icon="trash" onClick={() => handleDelete(selectedReq.id)}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
