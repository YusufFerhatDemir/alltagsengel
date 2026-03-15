'use client'
import { useState, useEffect, useCallback } from 'react'
import { BRAND } from '@/lib/mis/constants'
import {
  SectionHeader, Tabs, KpiCard, Card, DataTable, MisButton, Badge, Modal, EmptyState,
} from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'
import type { PricingTier, PricingSurcharge, PricingRegion, PricingConfig, PricingAuditEntry, PricingBreakdown } from '@/lib/types/pricing'

// ─── Helpers ───
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }: { value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder} style={{
      width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`,
      background: BRAND.light, color: BRAND.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
    }} />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`,
      background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit',
    }}>
      {children}
    </select>
  )
}

// ─── Main Page ───
export default function KrankenfahrtPricingPage() {
  const [tab, setTab] = useState('tarife')
  const [loading, setLoading] = useState(true)

  const [tiers, setTiers] = useState<PricingTier[]>([])
  const [surcharges, setSurcharges] = useState<PricingSurcharge[]>([])
  const [regions, setRegions] = useState<PricingRegion[]>([])
  const [config, setConfig] = useState<PricingConfig[]>([])
  const [audit, setAudit] = useState<PricingAuditEntry[]>([])

  const [editModal, setEditModal] = useState<{ entity: string; item: any } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pricing')
      if (res.ok) {
        const data = await res.json()
        setTiers(data.tiers || [])
        setSurcharges(data.surcharges || [])
        setRegions(data.regions || [])
        setConfig(data.config || [])
        setAudit(data.audit || [])
      }
    } catch (err) {
      console.error('Failed to load pricing data', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function saveItem(entity: string, item: any) {
    setSaving(true)
    try {
      const method = !item.id ? 'POST' : 'PUT'
      const res = await fetch('/api/admin/pricing', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, ...item }),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Fehler'); setSaving(false); return }
      await loadData()
      setEditModal(null)
    } catch { alert('Fehler beim Speichern') }
    setSaving(false)
  }

  async function deleteItem(entity: string, id: string) {
    if (!confirm('Wirklich löschen?')) return
    try {
      const res = await fetch(`/api/admin/pricing?entity=${entity}&id=${id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Fehler'); return }
      await loadData()
    } catch { alert('Fehler beim Löschen') }
  }

  const tabDefs = [
    { id: 'tarife', label: 'Tarife', icon: 'truck', count: tiers.length },
    { id: 'zuschlaege', label: 'Zuschläge', icon: 'plus', count: surcharges.length },
    { id: 'regionen', label: 'Regionen', icon: 'map', count: regions.length },
    { id: 'settings', label: 'Einstellungen', icon: 'settings' },
    { id: 'vorschau', label: 'Vorschau', icon: 'eye' },
    { id: 'audit', label: 'Protokoll', icon: 'activity', count: audit.length },
  ]

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>Preisdaten werden geladen...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Krankenfahrt — Preissystem"
        subtitle="Konfigurierbare Preise, Zuschläge, Regionen und Audit-Protokoll"
        icon="truck"
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <KpiCard title="Aktive Tarife" value={tiers.filter(t => t.enabled).length} target={tiers.length} unit="gesamt" icon="truck" />
        <KpiCard title="Zuschläge" value={surcharges.filter(s => s.enabled).length} unit="aktiv" icon="plus" />
        <KpiCard title="Regionen" value={regions.filter(r => r.enabled).length} unit="konfiguriert" icon="map" />
        <KpiCard title="Änderungen" value={audit.length} unit="letzte 50" icon="activity" />
      </div>

      <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

      {/* ── Tarife ── */}
      {tab === 'tarife' && (
        <Card
          title="Preisstufen"
          icon="truck"
          actions={<MisButton icon="plus" onClick={() => setEditModal({ entity: 'tiers', item: { name: '', slug: '', base_price: 0, per_km_rate: 0, min_price: 0, wait_per_min: 0, surcharge_amount: 0, icon: '', enabled: true, sort_order: tiers.length + 1 } })}>Neuer Tarif</MisButton>}
          noPad
        >
          <DataTable
            columns={[
              { key: 'icon', label: '', width: '40px', render: (r) => <span style={{ fontSize: 20 }}>{String(r.icon || '🚐')}</span> },
              { key: 'name', label: 'Name', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.name)}</span> },
              { key: 'slug', label: 'Slug' },
              { key: 'base_price', label: 'Grundpreis', render: (r) => <span style={{ color: BRAND.gold }}>{Number(r.base_price).toFixed(2)}€</span> },
              { key: 'per_km_rate', label: '€/km', render: (r) => `${Number(r.per_km_rate).toFixed(2)}€` },
              { key: 'min_price', label: 'Mindestpr.', render: (r) => `${Number(r.min_price).toFixed(2)}€` },
              { key: 'wait_per_min', label: 'Warte/Min', render: (r) => `${Number(r.wait_per_min).toFixed(2)}€` },
              { key: 'surcharge_amount', label: 'Zuschlag', render: (r) => `${Number(r.surcharge_amount).toFixed(2)}€` },
              { key: 'enabled', label: 'Status', render: (r) => <Badge label={r.enabled ? 'Aktiv' : 'Inaktiv'} color={r.enabled ? BRAND.success : BRAND.error} /> },
              { key: 'actions', label: '', render: (r) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <MisButton size="sm" variant="ghost" onClick={() => setEditModal({ entity: 'tiers', item: { ...r } })}>Bearbeiten</MisButton>
                  <MisButton size="sm" variant="danger" onClick={() => deleteItem('tiers', String(r.id))}>✕</MisButton>
                </div>
              )},
            ]}
            data={tiers as unknown as Record<string, unknown>[]}
          />
        </Card>
      )}

      {/* ── Zuschläge ── */}
      {tab === 'zuschlaege' && (
        <Card
          title="Zuschläge"
          icon="plus"
          actions={<MisButton icon="plus" onClick={() => setEditModal({ entity: 'surcharges', item: { name: '', slug: '', surcharge_type: 'fixed', value: 0, description: '', applies_to: [], enabled: true, sort_order: surcharges.length + 1 } })}>Neuer Zuschlag</MisButton>}
          noPad
        >
          <DataTable
            columns={[
              { key: 'name', label: 'Name', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.name)}</span> },
              { key: 'slug', label: 'Slug' },
              { key: 'surcharge_type', label: 'Typ', render: (r) => <Badge label={r.surcharge_type === 'fixed' ? 'Festbetrag' : 'Prozent'} color={BRAND.info || '#3B82F6'} /> },
              { key: 'value', label: 'Wert', render: (r) => <span style={{ color: BRAND.gold }}>{r.surcharge_type === 'fixed' ? `${Number(r.value).toFixed(2)}€` : `${Number(r.value).toFixed(0)}%`}</span> },
              { key: 'description', label: 'Beschreibung' },
              { key: 'enabled', label: 'Status', render: (r) => <Badge label={r.enabled ? 'Aktiv' : 'Inaktiv'} color={r.enabled ? BRAND.success : BRAND.error} /> },
              { key: 'actions', label: '', render: (r) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <MisButton size="sm" variant="ghost" onClick={() => setEditModal({ entity: 'surcharges', item: { ...r } })}>Bearbeiten</MisButton>
                  <MisButton size="sm" variant="danger" onClick={() => deleteItem('surcharges', String(r.id))}>✕</MisButton>
                </div>
              )},
            ]}
            data={surcharges as unknown as Record<string, unknown>[]}
          />
        </Card>
      )}

      {/* ── Regionen ── */}
      {tab === 'regionen' && (
        <Card
          title="Regionale Preisanpassungen"
          icon="map"
          actions={<MisButton icon="plus" onClick={() => setEditModal({ entity: 'regions', item: { region_code: '', region_name: '', tier_id: tiers[0]?.id || '', price_multiplier: 1.00, enabled: true } })}>Neue Region</MisButton>}
          noPad
        >
          {regions.length === 0 ? (
            <EmptyState
              icon="map"
              title="Keine Regionen"
              description="Noch keine regionalen Anpassungen konfiguriert. Standardpreise gelten deutschlandweit."
            />
          ) : (
            <DataTable
              columns={[
                { key: 'region_code', label: 'Code', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.region_code)}</span> },
                { key: 'region_name', label: 'Region' },
                { key: 'tier_id', label: 'Tarif', render: (r) => tiers.find(t => t.id === r.tier_id)?.name || '—' },
                { key: 'price_multiplier', label: 'Multiplikator', render: (r) => <span style={{ color: BRAND.gold }}>×{Number(r.price_multiplier).toFixed(2)}</span> },
                { key: 'enabled', label: 'Status', render: (r) => <Badge label={r.enabled ? 'Aktiv' : 'Inaktiv'} color={r.enabled ? BRAND.success : BRAND.error} /> },
                { key: 'actions', label: '', render: (r) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <MisButton size="sm" variant="ghost" onClick={() => setEditModal({ entity: 'regions', item: { ...r } })}>Bearbeiten</MisButton>
                    <MisButton size="sm" variant="danger" onClick={() => deleteItem('regions', String(r.id))}>✕</MisButton>
                  </div>
                )},
              ]}
              data={regions as unknown as Record<string, unknown>[]}
            />
          )}
        </Card>
      )}

      {/* ── Einstellungen ── */}
      {tab === 'settings' && (
        <Card title="Systemeinstellungen" icon="settings">
          <div style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
            {config.map(c => (
              <div key={c.id} style={{
                background: BRAND.light, border: `1px solid ${BRAND.border}`, borderRadius: 10,
                padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{c.key}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>{c.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: BRAND.gold }}>{String(c.value).replace(/"/g, '')}</span>
                  <MisButton size="sm" variant="ghost" onClick={() => setEditModal({ entity: 'config', item: { ...c } })}>✎</MisButton>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Vorschau ── */}
      {tab === 'vorschau' && <PricingPreview tiers={tiers} surcharges={surcharges} />}

      {/* ── Protokoll ── */}
      {tab === 'audit' && (
        <Card title="Änderungsprotokoll" icon="activity" noPad>
          {audit.length === 0 ? (
            <EmptyState icon="activity" title="Keine Änderungen" description="Noch keine Änderungen protokolliert." />
          ) : (
            <DataTable
              columns={[
                { key: 'created_at', label: 'Zeitpunkt', render: (r) => (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {new Date(String(r.created_at)).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )},
                { key: 'entity_type', label: 'Entität', render: (r) => <span style={{ fontWeight: 600 }}>{String(r.entity_type)}</span> },
                { key: 'action', label: 'Aktion', render: (r) => {
                  const a = String(r.action)
                  const color = a === 'create' ? BRAND.success : a === 'delete' ? BRAND.error : BRAND.warning || '#F59E0B'
                  const label = a === 'create' ? 'Erstellt' : a === 'delete' ? 'Gelöscht' : 'Geändert'
                  return <Badge label={label} color={color} />
                }},
                { key: 'new_values', label: 'Details', render: (r) => (
                  <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {r.new_values ? JSON.stringify(r.new_values).slice(0, 100) : '—'}
                  </span>
                )},
              ]}
              data={audit as unknown as Record<string, unknown>[]}
            />
          )}
        </Card>
      )}

      {/* ── Edit Modal ── */}
      {editModal && (
        <EditModal
          entity={editModal.entity}
          item={editModal.item}
          tiers={tiers}
          onSave={(item) => saveItem(editModal.entity, item)}
          onClose={() => setEditModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

// ─── Edit Modal ───
function EditModal({ entity, item, tiers, onSave, onClose, saving }: {
  entity: string; item: any; tiers: PricingTier[]; onSave: (item: any) => void; onClose: () => void; saving: boolean
}) {
  const { isMobile } = useMis()
  const [form, setForm] = useState({ ...item })
  const set = (key: string, val: any) => setForm((p: any) => ({ ...p, [key]: val }))

  const title = entity === 'tiers' ? 'Tarif' : entity === 'surcharges' ? 'Zuschlag' : entity === 'regions' ? 'Region' : 'Einstellung'

  return (
    <Modal open onClose={onClose} title={`${form.id ? '' : 'Neuer '}${title}`}>
      {entity === 'tiers' && (
        <>
          <Field label="Name"><Input value={form.name} onChange={v => set('name', v)} placeholder="z.B. Sitzend" /></Field>
          <Field label="Slug"><Input value={form.slug} onChange={v => set('slug', v)} placeholder="z.B. sitzend" /></Field>
          <Field label="Icon (Emoji)"><Input value={form.icon || ''} onChange={v => set('icon', v)} placeholder="z.B. 🪑" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
            <Field label="Grundpreis (€)"><Input type="number" value={form.base_price} onChange={v => set('base_price', Number(v))} /></Field>
            <Field label="€/km"><Input type="number" value={form.per_km_rate} onChange={v => set('per_km_rate', Number(v))} /></Field>
            <Field label="Mindestpreis (€)"><Input type="number" value={form.min_price} onChange={v => set('min_price', Number(v))} /></Field>
            <Field label="Wartezeit/Min (€)"><Input type="number" value={form.wait_per_min} onChange={v => set('wait_per_min', Number(v))} /></Field>
            <Field label="Transportzuschlag (€)"><Input type="number" value={form.surcharge_amount} onChange={v => set('surcharge_amount', Number(v))} /></Field>
            <Field label="Sortierung"><Input type="number" value={form.sort_order} onChange={v => set('sort_order', Number(v))} /></Field>
          </div>
          <Field label="Aktiv">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              <span style={{ fontSize: 13, color: BRAND.text }}>{form.enabled ? 'Aktiv' : 'Inaktiv'}</span>
            </label>
          </Field>
        </>
      )}

      {entity === 'surcharges' && (
        <>
          <Field label="Name"><Input value={form.name} onChange={v => set('name', v)} /></Field>
          <Field label="Slug"><Input value={form.slug} onChange={v => set('slug', v)} /></Field>
          <Field label="Beschreibung"><Input value={form.description || ''} onChange={v => set('description', v)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
            <Field label="Typ">
              <Select value={form.surcharge_type} onChange={v => set('surcharge_type', v)}>
                <option value="fixed">Festbetrag (€)</option>
                <option value="percentage">Prozent (%)</option>
              </Select>
            </Field>
            <Field label="Wert"><Input type="number" value={form.value} onChange={v => set('value', Number(v))} /></Field>
          </div>
          <Field label="Aktiv">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              <span style={{ fontSize: 13, color: BRAND.text }}>{form.enabled ? 'Aktiv' : 'Inaktiv'}</span>
            </label>
          </Field>
        </>
      )}

      {entity === 'regions' && (
        <>
          <Field label="Region Code"><Input value={form.region_code} onChange={v => set('region_code', v)} placeholder="z.B. BY, NRW, HH" /></Field>
          <Field label="Region Name"><Input value={form.region_name} onChange={v => set('region_name', v)} placeholder="z.B. Bayern" /></Field>
          <Field label="Tarif">
            <Select value={form.tier_id} onChange={v => set('tier_id', v)}>
              {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Preismultiplikator"><Input type="number" value={form.price_multiplier} onChange={v => set('price_multiplier', Number(v))} /></Field>
          <Field label="Aktiv">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              <span style={{ fontSize: 13, color: BRAND.text }}>{form.enabled ? 'Aktiv' : 'Inaktiv'}</span>
            </label>
          </Field>
        </>
      )}

      {entity === 'config' && (
        <>
          <Field label="Schlüssel"><Input value={form.key} onChange={v => set('key', v)} /></Field>
          <Field label="Wert"><Input value={typeof form.value === 'string' ? form.value.replace(/"/g, '') : form.value} onChange={v => set('value', JSON.stringify(v))} /></Field>
          <Field label="Beschreibung"><Input value={form.description || ''} onChange={v => set('description', v)} /></Field>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <MisButton variant="ghost" onClick={onClose}>Abbrechen</MisButton>
        <MisButton onClick={() => onSave(form)} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</MisButton>
      </div>
    </Modal>
  )
}

// ─── Pricing Preview ───
function PricingPreview({ tiers, surcharges }: { tiers: PricingTier[]; surcharges: PricingSurcharge[] }) {
  const { isMobile } = useMis()
  const [tier, setTier] = useState(tiers[0]?.slug || 'sitzend')
  const [km, setKm] = useState(10)
  const [wait, setWait] = useState(15)
  const [returnTrip, setReturnTrip] = useState(false)
  const [night, setNight] = useState(false)
  const [holiday, setHoliday] = useState(false)
  const [extras, setExtras] = useState<string[]>([])
  const [result, setResult] = useState<PricingBreakdown | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)

  const calculate = useCallback(async () => {
    setCalcLoading(true)
    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier_slug: tier, estimated_km: km, estimated_wait_minutes: wait,
          is_return_trip: returnTrip, is_night: night, is_holiday: holiday, extra_surcharges: extras,
        }),
      })
      if (res.ok) setResult(await res.json())
    } catch {}
    setCalcLoading(false)
  }, [tier, km, wait, returnTrip, night, holiday, extras])

  useEffect(() => {
    const t = setTimeout(calculate, 300)
    return () => clearTimeout(t)
  }, [calculate])

  const selectableSurcharges = surcharges.filter(s => !['night_premium', 'holiday_premium'].includes(s.slug))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      <Card title="Preiskalkulator" icon="calculator">
        <Field label="Tarif">
          <Select value={tier} onChange={setTier}>
            {tiers.filter(t => t.enabled).map(t => <option key={t.slug} value={t.slug}>{t.icon} {t.name}</option>)}
          </Select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
          <Field label="Kilometer"><Input type="number" value={km} onChange={v => setKm(Number(v))} /></Field>
          <Field label="Wartezeit (Min)"><Input type="number" value={wait} onChange={v => setWait(Number(v))} /></Field>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {[
            { label: 'Hin- und Rückfahrt', checked: returnTrip, onChange: setReturnTrip },
            { label: 'Nachtfahrt (20–06 Uhr)', checked: night, onChange: setNight },
            { label: 'Feiertag', checked: holiday, onChange: setHoliday },
          ].map(opt => (
            <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: BRAND.text }}>
              <input type="checkbox" checked={opt.checked} onChange={e => opt.onChange(e.target.checked)} />
              {opt.label}
            </label>
          ))}
        </div>

        {selectableSurcharges.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 6 }}>Zusatzleistungen</div>
            {selectableSurcharges.map(sc => (
              <label key={sc.slug} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: BRAND.text, marginBottom: 4 }}>
                <input type="checkbox" checked={extras.includes(sc.slug)} onChange={() => setExtras(prev => prev.includes(sc.slug) ? prev.filter(s => s !== sc.slug) : [...prev, sc.slug])} />
                {sc.name} ({sc.surcharge_type === 'fixed' ? `${Number(sc.value).toFixed(0)}€` : `${Number(sc.value).toFixed(0)}%`})
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card title="Ergebnis" icon="eye">
        {calcLoading ? (
          <div style={{ color: BRAND.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>Berechne...</div>
        ) : result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.display_lines.map((line, i) => {
              const isTotal = line.startsWith('Gesamt')
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: isTotal ? 16 : 13,
                  fontWeight: isTotal ? 700 : 400,
                  color: isTotal ? BRAND.gold : BRAND.text,
                  borderTop: isTotal ? `1px solid ${BRAND.border}` : 'none',
                  paddingTop: isTotal ? 8 : 0,
                }}>
                  <span>{line.split(':')[0]}</span>
                  <span>{line.split(':').slice(1).join(':')}</span>
                </div>
              )
            })}
            {result.is_min_price_applied && (
              <div style={{ fontSize: 11, color: BRAND.warning || '#F59E0B', marginTop: 4, fontStyle: 'italic' }}>
                Mindestpreis wurde angewendet
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="eye" title="Vorschau" description="Wählen Sie einen Tarif und Optionen zur Berechnung." />
        )}
      </Card>
    </div>
  )
}
