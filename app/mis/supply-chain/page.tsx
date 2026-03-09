'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, DataTable, Tabs, MisButton, Badge, EmptyState, Modal, StatRow } from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'
import type { Supplier, PurchaseOrder } from '@/lib/mis/types'

export default function SupplyChainPage() {
  const { isMobile } = useMis()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [tab, setTab] = useState('suppliers')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', contact_person: '', email: '', phone: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const [{ data: s }, { data: o }] = await Promise.all([
      supabase.from('mis_suppliers').select('*').order('name'),
      supabase.from('mis_purchase_orders').select('*, supplier:mis_suppliers(name)').order('created_at', { ascending: false }),
    ])
    setSuppliers(s as Supplier[] || [])
    setOrders(o as PurchaseOrder[] || [])
  }

  async function handleAddSupplier() {
    const supabase = createClient()
    await supabase.from('mis_suppliers').insert(form)
    setAddOpen(false)
    setForm({ name: '', category: '', contact_person: '', email: '', phone: '' })
    loadData()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Lieferkette" subtitle="Lieferantenmanagement, Bestellungen & Beschaffung" icon="truck" />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <KpiCard title="Lieferanten" value={suppliers.length} icon="users" />
        <KpiCard title="Aktive Bestellungen" value={orders.filter(o => !['closed','cancelled'].includes(o.status)).length} icon="truck" color={BRAND.info} />
        <KpiCard title="ISO-zertifiziert" value={suppliers.filter(s => s.iso_certified).length} icon="award" color={BRAND.success} />
        <KpiCard title="Ø Bewertung" value={suppliers.length ? (suppliers.reduce((a,s) => a+s.rating, 0)/suppliers.length).toFixed(1) : '—'} unit="/5" icon="target" />
      </div>

      <Tabs tabs={[
        { id: 'suppliers', label: 'Lieferanten', icon: 'users', count: suppliers.length },
        { id: 'orders', label: 'Bestellungen', icon: 'truck', count: orders.length },
      ]} active={tab} onChange={setTab} />

      {tab === 'suppliers' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <MisButton icon="plus" onClick={() => setAddOpen(true)}>Lieferant hinzufügen</MisButton>
          </div>
          {suppliers.length === 0 ? (
            <Card><EmptyState icon="truck" title="Keine Lieferanten" description="Fügen Sie Lieferanten hinzu, um die Lieferkette zu verwalten." action={<MisButton icon="plus" onClick={() => setAddOpen(true)}>Ersten Lieferant anlegen</MisButton>} /></Card>
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'name', label: 'Name', render: (r) => <span style={{ fontWeight: 600 }}>{r.name as string}</span> },
                  { key: 'category', label: 'Kategorie' },
                  { key: 'contact_person', label: 'Kontakt' },
                  { key: 'status', label: 'Status', render: (r) => <Badge label={r.status === 'active' ? 'Aktiv' : String(r.status)} color={r.status === 'active' ? BRAND.success : BRAND.warning} size="sm" /> },
                  { key: 'iso_certified', label: 'ISO', render: (r) => r.iso_certified ? <Badge label="Zertifiziert" color={BRAND.success} size="sm" /> : <Badge label="Nein" color={BRAND.muted} size="sm" /> },
                  { key: 'rating', label: 'Bewertung', render: (r) => `${Number(r.rating).toFixed(1)}/5` },
                ]}
                data={suppliers as unknown as Record<string,unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {tab === 'orders' && (
        <>
          {orders.length === 0 ? (
            <Card><EmptyState icon="truck" title="Keine Bestellungen" description="Erstellen Sie Bestellungen für Ihre Lieferanten." /></Card>
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'po_number', label: 'PO-Nr.', render: (r) => <span style={{ fontWeight: 600 }}>{r.po_number as string}</span> },
                  { key: 'supplier', label: 'Lieferant', render: (r) => {
                    const s = r.supplier as Record<string,unknown> | null
                    return s?.name as string || '—'
                  }},
                  { key: 'status', label: 'Status', render: (r) => <Badge label={String(r.status)} color={r.status === 'received' ? BRAND.success : r.status === 'cancelled' ? BRAND.error : BRAND.info} size="sm" /> },
                  { key: 'total_amount', label: 'Betrag', render: (r) => `€${Number(r.total_amount).toLocaleString('de-DE')}` },
                  { key: 'order_date', label: 'Bestelldatum', render: (r) => r.order_date ? new Date(r.order_date as string).toLocaleDateString('de-DE') : '—' },
                ]}
                data={orders as unknown as Record<string,unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {/* Add Supplier Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Lieferant hinzufügen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Firmenname *" style={inputStyle} />
          <input value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Kategorie" style={inputStyle} />
          <input value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} placeholder="Kontaktperson" style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 12 }}>
            <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="E-Mail" style={inputStyle} />
            <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="Telefon" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <MisButton variant="secondary" onClick={() => setAddOpen(false)}>Abbrechen</MisButton>
            <MisButton onClick={handleAddSupplier} disabled={!form.name}>Speichern</MisButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: BRAND.light, boxSizing: 'border-box' }
