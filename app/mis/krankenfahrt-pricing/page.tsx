'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import type { PricingTier, PricingSurcharge, PricingRegion, PricingConfig, PricingAuditEntry, PricingBreakdown } from '@/lib/types/pricing'

// ─── Inline MIS-style Components ───
function SH({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: BRAND.text, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 13, color: BRAND.muted, margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

function Tabs({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${BRAND.border}`, marginBottom: 24, overflowX: 'auto' }}>
      {tabs.map((t, i) => (
        <button key={t} onClick={() => onChange(i)} style={{
          padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active === i ? 700 : 400,
          color: active === i ? BRAND.gold : BRAND.muted,
          borderBottom: active === i ? `2px solid ${BRAND.gold}` : '2px solid transparent',
          whiteSpace: 'nowrap',
        }}>{t}</button>
      ))}
    </div>
  )
}

function Btn({ children, onClick, variant = 'primary', disabled, small }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean
}) {
  const bg = variant === 'primary' ? BRAND.gold : variant === 'danger' ? BRAND.error : 'transparent'
  const color = variant === 'ghost' ? BRAND.gold : '#1A1612'
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '6px 12px' : '8px 18px', borderRadius: 8,
      background: disabled ? `${bg}55` : bg, color, border: variant === 'ghost' ? `1px solid ${BRAND.border}` : 'none',
      fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12,
      padding: '16px 20px', flex: '1 1 180px',
    }}>
      <div style={{ fontSize: 11, color: BRAND.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.gold, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ─── Modal ───
function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 16,
        padding: 24, width: '100%', maxWidth: 500, maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: BRAND.text, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: BRAND.muted, cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

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

// ─── Main Page ───
export default function KrankenfahrtPricingPage() {
  const supabase = createClient()
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)

  // Data
  const [tiers, setTiers] = useState<PricingTier[]>([])
  const [surcharges, setSurcharges] = useState<PricingSurcharge[]>([])
  const [regions, setRegions] = useState<PricingRegion[]>([])
  const [config, setConfig] = useState<PricingConfig[]>([])
  const [audit, setAudit] = useState<PricingAuditEntry[]>([])

  // Modal state
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

  // CRUD helpers
  async function saveItem(entity: string, item: any) {
    setSaving(true)
    try {
      const isNew = !item.id
      const method = isNew ? 'POST' : 'PUT'
      const body = { entity, ...item }
      const res = await fetch('/api/admin/pricing', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Fehler'); return }
      await loadData()
      setEditModal(null)
    } catch (err) { alert('Fehler beim Speichern') }
    setSaving(false)
  }

  async function deleteItem(entity: string, id: string) {
    if (!confirm('Wirklich löschen?')) return
    try {
      const res = await fetch(`/api/admin/pricing?entity=${entity}&id=${id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Fehler'); return }
      await loadData()
    } catch (err) { alert('Fehler beim Löschen') }
  }

  const tabNames = ['Tarife', 'Zuschläge', 'Regionen', 'Einstellungen', 'Vorschau', 'Protokoll']

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>
        Preisdaten werden geladen...
      </div>
    )
  }

  return (
    <div>
      <SH title="Krankenfahrt — Preissystem" sub="Konfigurierbare Preise, Zuschläge, Regionen und Audit-Protokoll" />

      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiCard label="Tarife" value={tiers.filter(t => t.enabled).length} sub={`von ${tiers.length} gesamt`} />
        <KpiCard label="Zuschläge" value={surcharges.filter(s => s.enabled).length} sub="aktiv" />
        <KpiCard label="Regionen" value={regions.filter(r => r.enabled).length} sub="konfiguriert" />
        <KpiCard label="Änderungen" value={audit.length} sub="letzte 50" />
      </div>

      <Tabs tabs={tabNames} active={tab} onChange={setTab} />

      {/* ── Tab 0: Tarife ── */}
      {tab === 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn onClick={() => setEditModal({ entity: 'tiers', item: { name: '', slug: '', base_price: 0, per_km_rate: 0, min_price: 0, wait_per_min: 0, surcharge_amount: 0, icon: '', enabled: true, sort_order: tiers.length + 1 } })}>+ Neuer Tarif</Btn>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  {['', 'Name', 'Slug', 'Grundpreis', '€/km', 'Mindestpr.', 'Warte/Min', 'Zuschlag', 'Aktiv', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: BRAND.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tiers.map(t => (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 20 }}>{t.icon}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: BRAND.text }}>{t.name}</td>
                    <td style={{ padding: '10px 12px', color: BRAND.muted }}>{t.slug}</td>
                    <td style={{ padding: '10px 12px', color: BRAND.gold }}>{Number(t.base_price).toFixed(2)}€</td>
                    <td style={{ padding: '10px 12px' }}>{Number(t.per_km_rate).toFixed(2)}€</td>
                    <td style={{ padding: '10px 12px' }}>{Number(t.min_price).toFixed(2)}€</td>
                    <td style={{ padding: '10px 12px' }}>{Number(t.wait_per_min).toFixed(2)}€</td>
                    <td style={{ padding: '10px 12px' }}>{Number(t.surcharge_amount).toFixed(2)}€</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: t.enabled ? `${BRAND.success}20` : `${BRAND.error}20`, color: t.enabled ? BRAND.success : BRAND.error }}>
                        {t.enabled ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => setEditModal({ entity: 'tiers', item: { ...t } })}>Bearbeiten</Btn>
                      <Btn small variant="danger" onClick={() => deleteItem('tiers', t.id)}>✕</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 1: Zuschläge ── */}
      {tab === 1 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn onClick={() => setEditModal({ entity: 'surcharges', item: { name: '', slug: '', surcharge_type: 'fixed', value: 0, description: '', applies_to: [], enabled: true, sort_order: surcharges.length + 1 } })}>+ Neuer Zuschlag</Btn>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                {['Name', 'Slug', 'Typ', 'Wert', 'Beschreibung', 'Aktiv', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: BRAND.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {surcharges.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: BRAND.text }}>{s.name}</td>
                  <td style={{ padding: '10px 12px', color: BRAND.muted }}>{s.slug}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${BRAND.info}20`, color: BRAND.info }}>
                      {s.surcharge_type === 'fixed' ? 'Festbetrag' : 'Prozent'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: BRAND.gold }}>
                    {s.surcharge_type === 'fixed' ? `${Number(s.value).toFixed(2)}€` : `${Number(s.value).toFixed(0)}%`}
                  </td>
                  <td style={{ padding: '10px 12px', color: BRAND.muted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.enabled ? `${BRAND.success}20` : `${BRAND.error}20`, color: s.enabled ? BRAND.success : BRAND.error }}>
                      {s.enabled ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 6 }}>
                    <Btn small variant="ghost" onClick={() => setEditModal({ entity: 'surcharges', item: { ...s } })}>Bearbeiten</Btn>
                    <Btn small variant="danger" onClick={() => deleteItem('surcharges', s.id)}>✕</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab 2: Regionen ── */}
      {tab === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn onClick={() => setEditModal({ entity: 'regions', item: { region_code: '', region_name: '', tier_id: tiers[0]?.id || '', price_multiplier: 1.00, enabled: true } })}>+ Neue Region</Btn>
          </div>
          {regions.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: BRAND.muted, fontSize: 13 }}>
              Noch keine regionalen Anpassungen konfiguriert. Standardpreise gelten deutschlandweit.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  {['Code', 'Region', 'Tarif', 'Multiplikator', 'Aktiv', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: BRAND.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regions.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: BRAND.text }}>{r.region_code}</td>
                    <td style={{ padding: '10px 12px' }}>{r.region_name}</td>
                    <td style={{ padding: '10px 12px', color: BRAND.muted }}>{tiers.find(t => t.id === r.tier_id)?.name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: BRAND.gold }}>×{Number(r.price_multiplier).toFixed(2)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: r.enabled ? `${BRAND.success}20` : `${BRAND.error}20`, color: r.enabled ? BRAND.success : BRAND.error }}>
                        {r.enabled ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => setEditModal({ entity: 'regions', item: { ...r } })}>Bearbeiten</Btn>
                      <Btn small variant="danger" onClick={() => deleteItem('regions', r.id)}>✕</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab 3: Einstellungen ── */}
      {tab === 3 && (
        <div>
          <div style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
            {config.map(c => (
              <div key={c.id} style={{
                background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12,
                padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{c.key}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>{c.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: BRAND.gold }}>{String(c.value).replace(/"/g, '')}</span>
                  <Btn small variant="ghost" onClick={() => setEditModal({ entity: 'config', item: { ...c } })}>✎</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab 4: Vorschau (Pricing Preview) ── */}
      {tab === 4 && <PricingPreview tiers={tiers} surcharges={surcharges} />}

      {/* ── Tab 5: Protokoll (Audit) ── */}
      {tab === 5 && (
        <div>
          {audit.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: BRAND.muted, fontSize: 13 }}>Noch keine Änderungen protokolliert.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  {['Zeitpunkt', 'Entität', 'Aktion', 'Details'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: BRAND.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <td style={{ padding: '10px 12px', color: BRAND.muted, whiteSpace: 'nowrap' }}>
                      {new Date(a.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: BRAND.text }}>{a.entity_type}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: a.action === 'create' ? `${BRAND.success}20` : a.action === 'delete' ? `${BRAND.error}20` : `${BRAND.warning}20`,
                        color: a.action === 'create' ? BRAND.success : a.action === 'delete' ? BRAND.error : BRAND.warning,
                      }}>
                        {a.action === 'create' ? 'Erstellt' : a.action === 'delete' ? 'Gelöscht' : 'Geändert'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: BRAND.muted, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.new_values ? JSON.stringify(a.new_values).slice(0, 100) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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

// ─── Edit Modal Component ───
function EditModal({ entity, item, tiers, onSave, onClose, saving }: {
  entity: string; item: any; tiers: PricingTier[]; onSave: (item: any) => void; onClose: () => void; saving: boolean
}) {
  const [form, setForm] = useState({ ...item })
  const set = (key: string, val: any) => setForm((p: any) => ({ ...p, [key]: val }))

  const title = entity === 'tiers' ? 'Tarif' : entity === 'surcharges' ? 'Zuschlag' : entity === 'regions' ? 'Region' : 'Einstellung'

  return (
    <Modal open title={`${form.id ? '' : 'Neuer '}${title}`} onClose={onClose}>
      {entity === 'tiers' && (
        <>
          <Field label="Name"><Input value={form.name} onChange={v => set('name', v)} placeholder="z.B. Sitzend" /></Field>
          <Field label="Slug"><Input value={form.slug} onChange={v => set('slug', v)} placeholder="z.B. sitzend" /></Field>
          <Field label="Icon (Emoji)"><Input value={form.icon || ''} onChange={v => set('icon', v)} placeholder="z.B. 🪑" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Typ">
              <select value={form.surcharge_type} onChange={e => set('surcharge_type', e.target.value)} style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`,
                background: BRAND.light, color: BRAND.text, fontSize: 13,
              }}>
                <option value="fixed">Festbetrag (€)</option>
                <option value="percentage">Prozent (%)</option>
              </select>
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
            <select value={form.tier_id} onChange={e => set('tier_id', e.target.value)} style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`,
              background: BRAND.light, color: BRAND.text, fontSize: 13,
            }}>
              {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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
        <Btn variant="ghost" onClick={onClose}>Abbrechen</Btn>
        <Btn onClick={() => onSave(form)} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</Btn>
      </div>
    </Modal>
  )
}

// ─── Pricing Preview Component ───
function PricingPreview({ tiers, surcharges }: { tiers: PricingTier[]; surcharges: PricingSurcharge[] }) {
  const [tier, setTier] = useState(tiers[0]?.slug || 'sitzend')
  const [km, setKm] = useState(10)
  const [wait, setWait] = useState(15)
  const [returnTrip, setReturnTrip] = useState(false)
  const [night, setNight] = useState(false)
  const [holiday, setHoliday] = useState(false)
  const [extras, setExtras] = useState<string[]>([])
  const [result, setResult] = useState<PricingBreakdown | null>(null)
  const [loading, setLoading] = useState(false)

  const calculate = useCallback(async () => {
    setLoading(true)
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
    setLoading(false)
  }, [tier, km, wait, returnTrip, night, holiday, extras])

  useEffect(() => {
    const t = setTimeout(calculate, 300)
    return () => clearTimeout(t)
  }, [calculate])

  const selectableSurcharges = surcharges.filter(s => !['night_premium', 'holiday_premium'].includes(s.slug))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Left: Inputs */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 16 }}>Preiskalkulator</div>

        <Field label="Tarif">
          <select value={tier} onChange={e => setTier(e.target.value)} style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`,
            background: BRAND.light, color: BRAND.text, fontSize: 13,
          }}>
            {tiers.filter(t => t.enabled).map(t => <option key={t.slug} value={t.slug}>{t.icon} {t.name}</option>)}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
      </div>

      {/* Right: Result */}
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 16 }}>Ergebnis</div>
        {loading ? (
          <div style={{ color: BRAND.muted, fontSize: 13 }}>Berechne...</div>
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
              <div style={{ fontSize: 11, color: BRAND.warning, marginTop: 4, fontStyle: 'italic' }}>
                ⓘ Mindestpreis wurde angewendet
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: BRAND.muted, fontSize: 13 }}>Wählen Sie einen Tarif und Optionen.</div>
        )}
      </div>
    </div>
  )
}
