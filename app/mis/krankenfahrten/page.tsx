'use client'
import { useState, useEffect, useCallback } from 'react'
import { BRAND } from '@/lib/mis/constants'
import {
  SectionHeader, Tabs, KpiCard, Card, DataTable, MisButton, Badge, Modal, EmptyState,
} from '@/components/mis/MisComponents'

interface Ride {
  id: string
  abholadresse: string
  zieladresse: string
  datum: string
  uhrzeit: string
  rueckfahrt: boolean
  rollstuhl_benoetig: boolean
  tragestuhl_benoetig: boolean
  liegend_transport: boolean
  total_amount: number
  status: string
  provider_id: string | null
  user_id: string
  created_at: string
  customer?: { first_name: string; last_name: string; email: string; phone: string }
}

interface Provider {
  id: string
  user_id: string
  company_name: string
  license_number: string
  tax_id: string
  address: string
  city: string
  phone: string
  email: string
  status: string
  is_verified: boolean
  created_at: string
  profile?: { first_name: string; last_name: string; email: string; phone: string }
}

interface Stats {
  totalRides: number
  pendingRides: number
  activeRides: number
  completedRides: number
  totalRevenue: number
  totalProviders: number
  verifiedProviders: number
}

export default function KrankenfahrtenAdminPage() {
  const [tab, setTab] = useState('auftraege')
  const [loading, setLoading] = useState(true)
  const [rides, setRides] = useState<Ride[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [stats, setStats] = useState<Stats>({
    totalRides: 0, pendingRides: 0, activeRides: 0, completedRides: 0,
    totalRevenue: 0, totalProviders: 0, verifiedProviders: 0,
  })
  const [rideFilter, setRideFilter] = useState('alle')
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [editProvider, setEditProvider] = useState<Partial<Provider>>({})
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/krankenfahrten')
      if (res.ok) {
        const data = await res.json()
        setRides(data.rides || [])
        setProviders(data.providers || [])
        setStats(data.stats || {})
      }
    } catch (err) {
      console.error('Failed to load data', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function updateRide(id: string, updates: Record<string, any>) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/krankenfahrten', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'ride', id, ...updates }),
      })
      if (res.ok) {
        await loadData()
        setSelectedRide(null)
      }
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  async function updateProvider(id: string, updates: Record<string, any>) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/krankenfahrten', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'provider', id, ...updates }),
      })
      if (res.ok) {
        await loadData()
        setSelectedProvider(null)
      }
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  const filteredRides = rideFilter === 'alle'
    ? rides
    : rides.filter(r => r.status === rideFilter)

  const statusColor = (s: string) => {
    switch (s) {
      case 'pending': return BRAND.warning
      case 'confirmed': return BRAND.info
      case 'in_progress': return '#FF9800'
      case 'completed': return BRAND.success
      case 'cancelled': return BRAND.error
      default: return BRAND.muted
    }
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return 'Offen'
      case 'confirmed': return 'Bestätigt'
      case 'in_progress': return 'Im Gange'
      case 'completed': return 'Abgeschlossen'
      case 'cancelled': return 'Storniert'
      default: return s
    }
  }

  return (
    <div>
      <SectionHeader
        title="Krankenfahrten"
        subtitle="Aufträge, Fahrer und Einnahmen verwalten"
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard title="Aufträge gesamt" value={stats.totalRides} />
        <KpiCard title="Offen" value={stats.pendingRides} color={BRAND.warning} />
        <KpiCard title="Aktiv" value={stats.activeRides} color={BRAND.info} />
        <KpiCard title="Abgeschlossen" value={stats.completedRides} color={BRAND.success} />
        <KpiCard title="Umsatz" value={`${stats.totalRevenue.toFixed(0)} €`} color={BRAND.gold} />
        <KpiCard title="Fahrer" value={`${stats.verifiedProviders}/${stats.totalProviders}`} />
      </div>

      <Tabs
        tabs={[
          { id: 'auftraege', label: 'Aufträge' },
          { id: 'fahrer', label: 'Fahrer' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>Laden...</div>
      ) : tab === 'auftraege' ? (
        <Card>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['alle', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map(f => (
              <button
                key={f}
                onClick={() => setRideFilter(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${rideFilter === f ? BRAND.gold : BRAND.border}`,
                  background: rideFilter === f ? 'rgba(201,150,60,0.15)' : 'transparent',
                  color: rideFilter === f ? BRAND.gold : BRAND.muted,
                }}
              >
                {f === 'alle' ? 'Alle' : statusLabel(f)} ({f === 'alle' ? rides.length : rides.filter(r => r.status === f).length})
              </button>
            ))}
          </div>

          <DataTable
            columns={[
              { key: 'datum', label: 'Datum', render: (r: any) => `${new Date(r.datum).toLocaleDateString('de-DE')} ${r.uhrzeit}` },
              { key: 'customer', label: 'Kunde', render: (r: any) => r.customer ? `${r.customer.first_name} ${(r.customer.last_name || '').charAt(0)}.` : '–' },
              { key: 'abholadresse', label: 'Von', render: (r: any) => r.abholadresse?.substring(0, 30) + (r.abholadresse?.length > 30 ? '…' : '') },
              { key: 'zieladresse', label: 'Nach', render: (r: any) => r.zieladresse?.substring(0, 30) + (r.zieladresse?.length > 30 ? '…' : '') },
              { key: 'total_amount', label: 'Betrag', render: (r: any) => `${(r.total_amount || 0).toFixed(2)} €` },
              { key: 'status', label: 'Status', render: (r: any) => (
                <Badge label={statusLabel(r.status)} color={statusColor(r.status)} />
              )},
              { key: 'provider_id', label: 'Fahrer', render: (r: any) => {
                if (!r.provider_id) return <span style={{ color: BRAND.warning, fontSize: 12 }}>Nicht zugewiesen</span>
                const p = providers.find(p => p.id === r.provider_id)
                return p ? (p.company_name || p.profile?.first_name || '–') : r.provider_id.substring(0, 8)
              }},
              { key: 'actions', label: '', render: (r: any) => (
                <MisButton size="sm" onClick={() => setSelectedRide(r)}>Details</MisButton>
              )},
            ]}
            data={filteredRides}
            emptyMessage="Keine Aufträge gefunden"
          />
        </Card>
      ) : (
        <Card>
          <DataTable
            columns={[
              { key: 'company', label: 'Firma', render: (p: any) => p.company_name || '–' },
              { key: 'name', label: 'Name', render: (p: any) => p.profile ? `${p.profile.first_name} ${(p.profile.last_name || '').charAt(0)}.` : '–' },
              { key: 'license', label: 'Lizenz', render: (p: any) => p.license_number || '–' },
              { key: 'city', label: 'Stadt', render: (p: any) => p.city || '–' },
              { key: 'phone', label: 'Telefon', render: (p: any) => p.phone || p.profile?.phone || '–' },
              { key: 'verified', label: 'Status', render: (p: any) => (
                <Badge
                  label={p.is_verified ? 'Verifiziert' : 'Prüfung'}
                  color={p.is_verified ? BRAND.success : BRAND.warning}
                />
              )},
              { key: 'actions', label: '', render: (p: any) => (
                <MisButton size="sm" onClick={() => { setSelectedProvider(p); setEditProvider({ company_name: p.company_name, license_number: p.license_number, tax_id: p.tax_id, city: p.city, phone: p.phone, email: p.email }) }}>Verwalten</MisButton>
              )},
            ]}
            data={providers}
            emptyMessage="Keine Fahrer registriert"
          />
        </Card>
      )}

      {/* Ride Detail Modal */}
      {selectedRide && (
        <Modal open={true} title="Auftragsdetails" onClose={() => setSelectedRide(null)}>
          <div style={{ display: 'grid', gap: 12, fontSize: 13, color: BRAND.text }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InfoField label="Datum" value={`${new Date(selectedRide.datum).toLocaleDateString('de-DE')} ${selectedRide.uhrzeit}`} />
              <InfoField label="Status" value={statusLabel(selectedRide.status)} />
              <InfoField label="Kunde" value={selectedRide.customer ? `${selectedRide.customer.first_name} ${(selectedRide.customer.last_name || '').charAt(0)}.` : '–'} />
              <InfoField label="Betrag" value={`${(selectedRide.total_amount || 0).toFixed(2)} €`} />
            </div>
            <InfoField label="Abholadresse" value={selectedRide.abholadresse} />
            <InfoField label="Zieladresse" value={selectedRide.zieladresse} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selectedRide.rollstuhl_benoetig && <Badge label="Rollstuhl" color={BRAND.info} />}
              {selectedRide.tragestuhl_benoetig && <Badge label="Tragestuhl" color={BRAND.info} />}
              {selectedRide.rueckfahrt && <Badge label="Rückfahrt" color={BRAND.gold} />}
            </div>

            {/* Fahrer assign */}
            {!selectedRide.provider_id && (
              <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 8 }}>Fahrer zuweisen</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {providers.filter(p => p.is_verified).map(p => (
                    <MisButton
                      key={p.id}
                      size="sm"
                      onClick={() => updateRide(selectedRide.id, { provider_id: p.id, status: 'confirmed' })}
                      disabled={saving}
                    >
                      {p.company_name || p.profile?.first_name || p.id.substring(0, 8)}
                    </MisButton>
                  ))}
                  {providers.filter(p => p.is_verified).length === 0 && (
                    <div style={{ color: BRAND.warning, fontSize: 12 }}>Keine verifizierten Fahrer</div>
                  )}
                </div>
              </div>
            )}

            {/* Status actions */}
            <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selectedRide.status === 'pending' && (
                <MisButton onClick={() => updateRide(selectedRide.id, { status: 'cancelled' })} disabled={saving} variant="danger">
                  Stornieren
                </MisButton>
              )}
              {selectedRide.status === 'confirmed' && (
                <>
                  <MisButton onClick={() => updateRide(selectedRide.id, { status: 'in_progress' })} disabled={saving}>
                    Fahrt starten
                  </MisButton>
                  <MisButton onClick={() => updateRide(selectedRide.id, { status: 'cancelled' })} disabled={saving} variant="danger">
                    Stornieren
                  </MisButton>
                </>
              )}
              {selectedRide.status === 'in_progress' && (
                <MisButton onClick={() => updateRide(selectedRide.id, { status: 'completed' })} disabled={saving}>
                  Abschließen
                </MisButton>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Provider Detail Modal */}
      {selectedProvider && (
        <Modal open={true} title="Fahrer verwalten" onClose={() => setSelectedProvider(null)}>
          <div style={{ display: 'grid', gap: 12, fontSize: 13, color: BRAND.text }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InfoField label="Name" value={selectedProvider.profile ? `${selectedProvider.profile.first_name} ${(selectedProvider.profile.last_name || '').charAt(0)}.` : '–'} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Firma</div>
                <input value={editProvider.company_name || ''} onChange={e => setEditProvider({...editProvider, company_name: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Lizenz</div>
                <input value={editProvider.license_number || ''} onChange={e => setEditProvider({...editProvider, license_number: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Steuer-ID</div>
                <input value={editProvider.tax_id || ''} onChange={e => setEditProvider({...editProvider, tax_id: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Stadt</div>
                <input value={editProvider.city || ''} onChange={e => setEditProvider({...editProvider, city: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Telefon</div>
                <input value={editProvider.phone || ''} onChange={e => setEditProvider({...editProvider, phone: e.target.value})} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>E-Mail</div>
                <input value={editProvider.email || ''} onChange={e => setEditProvider({...editProvider, email: e.target.value})} style={inputStyle} />
              </div>
            </div>

            {/* Stats for this provider */}
            <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 8 }}>Fahrten-Statistik</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <Stat label="Gesamt" value={rides.filter(r => r.provider_id === selectedProvider.id).length} />
                <Stat label="Aktiv" value={rides.filter(r => r.provider_id === selectedProvider.id && ['confirmed', 'in_progress'].includes(r.status)).length} />
                <Stat label="Abgeschlossen" value={rides.filter(r => r.provider_id === selectedProvider.id && r.status === 'completed').length} />
                <Stat label="Umsatz" value={`${rides.filter(r => r.provider_id === selectedProvider.id && r.status === 'completed').reduce((s, r) => s + (r.total_amount || 0), 0).toFixed(0)} €`} />
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 12, display: 'flex', gap: 8 }}>
              <MisButton onClick={() => updateProvider(selectedProvider.id, editProvider)} disabled={saving}>
                Änderungen speichern
              </MisButton>
              {!selectedProvider.is_verified ? (
                <MisButton onClick={() => updateProvider(selectedProvider.id, { is_verified: true })} disabled={saving}>
                  Verifizieren ✓
                </MisButton>
              ) : (
                <MisButton onClick={() => updateProvider(selectedProvider.id, { is_verified: false })} disabled={saving} variant="danger">
                  Verifizierung aufheben
                </MisButton>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: BRAND.text }}>{value}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.gold }}>{value}</div>
      <div style={{ fontSize: 10, color: BRAND.muted }}>{label}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: BRAND.light, color: BRAND.text, boxSizing: 'border-box' }
