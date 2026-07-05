'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal, ProgressBar } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'

// ===== Fahrzeug-Status =====
const VEHICLE_STATUS: Record<string, { label: string; color: string }> = {
  available: { label: 'Verfügbar', color: '#22C55E' },
  in_use: { label: 'Im Einsatz', color: '#3B82F6' },
  maintenance: { label: 'Wartung', color: '#F59E0B' },
  defect: { label: 'Defekt', color: '#EF4444' },
  decommissioned: { label: 'Ausgemustert', color: '#6B7280' },
}

interface Vehicle {
  id: string
  plate: string
  brand: string
  model: string
  year: number
  fuel_type: string
  status: string
  current_km: number
  next_tuev: string | null
  next_service_km: number | null
  insurance_until: string | null
  assigned_to: string | null
  notes: string
  created_at: string
  updated_at: string
}

// ===== FAHRZEUG-VERWALTUNG =====
export default function VehiclesPage() {
  const { isMobile } = useMis()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [form, setForm] = useState({
    plate: '', brand: '', model: '', year: String(new Date().getFullYear()),
    fuel_type: 'Benzin', status: 'available', current_km: '',
    next_tuev: '', next_service_km: '', insurance_until: '',
    assigned_to: '', notes: '',
  })

  useEffect(() => { loadVehicles() }, [])

  async function loadVehicles() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('mis_vehicles')
        .select('*')
        .order('plate', { ascending: true })
      if (error) console.error('Vehicles error:', error)
      setVehicles(data as Vehicle[] || [])
    } catch (err) {
      console.error('Vehicles load error:', err)
    }
    setLoading(false)
  }

  async function handleCreate() {
    const supabase = createClient()
    const { error } = await supabase.from('mis_vehicles').insert({
      plate: form.plate.toUpperCase(),
      brand: form.brand,
      model: form.model,
      year: parseInt(form.year),
      fuel_type: form.fuel_type,
      status: form.status,
      current_km: form.current_km ? parseInt(form.current_km) : 0,
      next_tuev: form.next_tuev || null,
      next_service_km: form.next_service_km ? parseInt(form.next_service_km) : null,
      insurance_until: form.insurance_until || null,
      assigned_to: form.assigned_to || null,
      notes: form.notes,
    })
    if (!error) {
      setCreateOpen(false)
      setForm({ plate: '', brand: '', model: '', year: String(new Date().getFullYear()), fuel_type: 'Benzin', status: 'available', current_km: '', next_tuev: '', next_service_km: '', insurance_until: '', assigned_to: '', notes: '' })
      loadVehicles()
    } else {
      alert('Fehler: ' + error.message)
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('mis_vehicles').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    loadVehicles()
  }

  async function handleUpdateKm(id: string, km: number) {
    const supabase = createClient()
    await supabase.from('mis_vehicles').update({ current_km: km, updated_at: new Date().toISOString() }).eq('id', id)
    loadVehicles()
  }

  async function handleDelete(id: string) {
    if (!confirm('Fahrzeug wirklich löschen?')) return
    const supabase = createClient()
    await supabase.from('mis_vehicles').delete().eq('id', id)
    setSelectedVehicle(null)
    loadVehicles()
  }

  // Filter
  const tabs = [
    { id: 'all', label: `Alle (${vehicles.length})` },
    { id: 'available', label: `Verfügbar (${vehicles.filter(v => v.status === 'available').length})` },
    { id: 'in_use', label: `Im Einsatz (${vehicles.filter(v => v.status === 'in_use').length})` },
    { id: 'maintenance', label: `Wartung (${vehicles.filter(v => v.status === 'maintenance' || v.status === 'defect').length})` },
  ]

  const filtered = vehicles.filter(v => {
    const matchesSearch = !search || v.plate.toLowerCase().includes(search.toLowerCase()) || v.brand.toLowerCase().includes(search.toLowerCase()) || v.model.toLowerCase().includes(search.toLowerCase())
    const matchesTab = activeTab === 'all' || v.status === activeTab || (activeTab === 'maintenance' && (v.status === 'maintenance' || v.status === 'defect'))
    return matchesSearch && matchesTab
  })

  // KPIs
  const available = vehicles.filter(v => v.status === 'available').length
  const inUse = vehicles.filter(v => v.status === 'in_use').length
  const tuevSoon = vehicles.filter(v => {
    if (!v.next_tuev) return false
    const diff = (new Date(v.next_tuev).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff <= 60
  }).length
  const totalKm = vehicles.reduce((s, v) => s + (v.current_km || 0), 0)

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE') : '—'
  const formatKm = (km: number) => `${km.toLocaleString('de-DE')} km`

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Fahrzeugverwaltung"
        subtitle="Fuhrpark, Kilometerstand, TÜV-Termine und Zuweisungen"
        icon="truck"
        actions={
          <MisButton icon="plus" onClick={() => setCreateOpen(true)}>
            Neues Fahrzeug
          </MisButton>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Fahrzeuge', value: vehicles.length, icon: 'truck', color: BRAND.gold },
          { label: 'Verfügbar', value: available, icon: 'check', color: BRAND.success },
          { label: 'Im Einsatz', value: inUse, icon: 'activity', color: BRAND.info },
          { label: 'TÜV bald fällig', value: tuevSoon, icon: 'shield', color: BRAND.warning },
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
      <SearchInput value={search} onChange={setSearch} placeholder="Kennzeichen, Marke oder Modell suchen..." />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Table */}
      {loading ? (
        <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Fahrzeuge...</div></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon="truck" title="Keine Fahrzeuge" description="Fügen Sie das erste Fahrzeug hinzu, um den Fuhrpark zu verwalten." />
      ) : (
        <Card noPad>
          <DataTable
            columns={[
              { key: 'plate', label: 'Kennzeichen', render: (r: Record<string, unknown>) => (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.gold, letterSpacing: '0.05em' }}>{String(r.plate)}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.brand)} {String(r.model)} ({String(r.year)})</div>
                </div>
              )},
              { key: 'fuel_type', label: 'Antrieb' },
              { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                const s = VEHICLE_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                return <Badge label={s.label} color={s.color} />
              }},
              { key: 'current_km', label: 'Km-Stand', render: (r: Record<string, unknown>) => formatKm(Number(r.current_km || 0)) },
              { key: 'next_tuev', label: 'Nächster TÜV', render: (r: Record<string, unknown>) => {
                const tuev = r.next_tuev as string | null
                if (!tuev) return <span style={{ color: BRAND.muted }}>—</span>
                const diff = (new Date(tuev).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                const color = diff <= 30 ? BRAND.error : diff <= 60 ? BRAND.warning : BRAND.text
                return <span style={{ color, fontWeight: diff <= 60 ? 700 : 400 }}>{formatDate(tuev)}</span>
              }},
              { key: 'assigned_to', label: 'Zugewiesen', render: (r: Record<string, unknown>) => String(r.assigned_to || '—') },
              { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                <MisButton variant="secondary" icon="eye" onClick={() => setSelectedVehicle(r as unknown as Vehicle)}>
                  {isMobile ? '' : 'Details'}
                </MisButton>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </Card>
      )}

      {/* Alerts - TÜV / Versicherung */}
      {vehicles.some(v => {
        if (!v.next_tuev) return false
        return (new Date(v.next_tuev).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 60
      }) && (
        <Card title="Fälligkeiten" icon="shield" style={{ borderLeft: `3px solid ${BRAND.warning}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vehicles.filter(v => {
              if (!v.next_tuev) return false
              const diff = (new Date(v.next_tuev).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              return diff > 0 && diff <= 60
            }).map(v => {
              const days = Math.ceil((new Date(v.next_tuev!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              return (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BRAND.border}` }}>
                  <div>
                    <span style={{ fontWeight: 700, color: BRAND.gold }}>{v.plate}</span>
                    <span style={{ color: BRAND.muted, marginLeft: 8 }}>{v.brand} {v.model}</span>
                  </div>
                  <Badge label={`TÜV in ${days} Tagen`} color={days <= 30 ? BRAND.error : BRAND.warning} />
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Create Modal */}
      {createOpen && (
        <Modal title="Neues Fahrzeug" onClose={() => setCreateOpen(false)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Kennzeichen *</label>
                <input style={inputStyle} value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder="F-AE 1234" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Baujahr</label>
                <input style={inputStyle} type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Marke *</label>
                <input style={inputStyle} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="z.B. Volkswagen" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Modell *</label>
                <input style={inputStyle} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="z.B. Caddy" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Antriebsart</label>
                <select style={inputStyle} value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })}>
                  {['Benzin', 'Diesel', 'Elektro', 'Hybrid', 'Erdgas'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Aktueller Km-Stand</label>
                <input style={inputStyle} type="number" value={form.current_km} onChange={e => setForm({ ...form, current_km: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Nächster TÜV</label>
                <input style={inputStyle} type="date" value={form.next_tuev} onChange={e => setForm({ ...form, next_tuev: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Versicherung bis</label>
                <input style={inputStyle} type="date" value={form.insurance_until} onChange={e => setForm({ ...form, insurance_until: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Nächster Service bei (km)</label>
                <input style={inputStyle} type="number" value={form.next_service_km} onChange={e => setForm({ ...form, next_service_km: e.target.value })} placeholder="z.B. 30000" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Zugewiesen an</label>
                <input style={inputStyle} value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} placeholder="Fahrer oder Engel" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Besonderheiten, Ausstattung..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreate} disabled={!form.plate || !form.brand || !form.model}>Fahrzeug anlegen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {selectedVehicle && (
        <Modal title={`${selectedVehicle.plate} — ${selectedVehicle.brand} ${selectedVehicle.model}`} onClose={() => setSelectedVehicle(null)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Baujahr</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedVehicle.year}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Antrieb</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedVehicle.fuel_type}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={VEHICLE_STATUS[selectedVehicle.status]?.label || selectedVehicle.status} color={VEHICLE_STATUS[selectedVehicle.status]?.color || BRAND.muted} />
              </div>
            </div>

            {/* Km & Service Progress */}
            <Card style={{ background: BRAND.light }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>Kilometerstand</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: BRAND.gold }}>{formatKm(selectedVehicle.current_km)}</span>
              </div>
              {selectedVehicle.next_service_km && (
                <ProgressBar
                  value={Math.min(100, Math.round((selectedVehicle.current_km / selectedVehicle.next_service_km) * 100))}
                  label={`Nächster Service bei ${formatKm(selectedVehicle.next_service_km)}`}
                  color={selectedVehicle.current_km >= selectedVehicle.next_service_km * 0.9 ? BRAND.warning : BRAND.success}
                />
              )}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Nächster TÜV</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDate(selectedVehicle.next_tuev)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Versicherung bis</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDate(selectedVehicle.insurance_until)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Zugewiesen an</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedVehicle.assigned_to || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Letzte Aktualisierung</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDate(selectedVehicle.updated_at)}</div>
              </div>
            </div>

            {selectedVehicle.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedVehicle.notes}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedVehicle.status === 'available' && <MisButton icon="activity" onClick={() => { handleStatusChange(selectedVehicle.id, 'in_use'); setSelectedVehicle(null) }}>In Einsatz setzen</MisButton>}
                {selectedVehicle.status === 'in_use' && <MisButton icon="check" onClick={() => { handleStatusChange(selectedVehicle.id, 'available'); setSelectedVehicle(null) }}>Freigeben</MisButton>}
                {selectedVehicle.status !== 'maintenance' && <MisButton variant="secondary" icon="settings" onClick={() => { handleStatusChange(selectedVehicle.id, 'maintenance'); setSelectedVehicle(null) }}>Zur Wartung</MisButton>}
              </div>
              <MisButton variant="secondary" icon="trash" onClick={() => handleDelete(selectedVehicle.id)} style={{ color: BRAND.error }}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
