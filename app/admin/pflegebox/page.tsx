'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const statusLabels: Record<string, string> = {
  draft: 'Entwurf',
  submitted: 'Eingereicht',
  sent: 'An Partner',
  accepted: 'Genehmigt',
  rejected: 'Abgelehnt',
  shipped: 'Versendet',
  delivered: 'Geliefert',
  cancelled: 'Storniert',
}

const allStatuses = ['submitted', 'sent', 'accepted', 'shipped', 'delivered', 'rejected', 'cancelled']

interface OrderWithProfile {
  id: string
  user_id: string
  delivery_name: string
  delivery_address: string
  delivery_phone: string | null
  consent_share_data: boolean
  status: string
  partner_reference: string | null
  audit_log: { action: string; timestamp: string; note?: string }[]
  created_at: string
  updated_at: string
  carebox_cart: {
    items: { item_id: string; qty: number }[]
    estimated_total: number
    month: string
  } | null
  profiles: {
    first_name: string
    last_name: string
    email: string
    phone: string | null
  } | null
}

export default function AdminPflegeboxPage() {
  const [orders, setOrders] = useState<OrderWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [catalogMap, setCatalogMap] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const [ordersRes, catalogRes] = await Promise.all([
      supabase
        .from('carebox_order_requests')
        .select('*, carebox_cart(*), profiles(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('carebox_catalog_items')
        .select('id, name'),
    ])

    setOrders(ordersRes.data || [])

    const map: Record<string, string> = {}
    for (const item of (catalogRes.data || [])) {
      map[item.id] = item.name
    }
    setCatalogMap(map)
    setLoading(false)
  }

  async function updateStatus(orderId: string, newStatus: string) {
    const supabase = createClient()
    const order = orders.find(o => o.id === orderId)
    if (!order) return

    const newLog = [...(order.audit_log || []), {
      action: newStatus,
      timestamp: new Date().toISOString(),
      note: `Status von Admin auf "${statusLabels[newStatus]}" gesetzt`,
    }]

    await supabase
      .from('carebox_order_requests')
      .update({ status: newStatus, audit_log: newLog, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status: newStatus, audit_log: newLog } : o
    ))
  }

  function exportCSV() {
    const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)
    const rows = [
      ['ID', 'Name', 'Adresse', 'Telefon', 'Status', 'Betrag', 'Monat', 'Erstellt'].join(';'),
      ...filtered.map(o => [
        o.id.slice(0, 8),
        o.delivery_name,
        o.delivery_address,
        o.delivery_phone || '',
        statusLabels[o.status] || o.status,
        o.carebox_cart?.estimated_total?.toFixed(2) || '0',
        o.carebox_cart?.month || '',
        new Date(o.created_at).toLocaleDateString('de-DE'),
      ].join(';'))
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pflegebox-orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const stats = {
    total: orders.length,
    submitted: orders.filter(o => o.status === 'submitted').length,
    sent: orders.filter(o => o.status === 'sent').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  }

  if (loading) return <div className="admin-page"><h1>Pflegebox-Bestellungen</h1><p>Laden...</p></div>

  return (
    <div className="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1>Pflegebox-Bestellungen</h1>
        <button className="admin-order-btn primary" onClick={exportCSV}>CSV Export</button>
      </div>
      <p className="admin-subtitle">Verwaltung aller Pflegebox-Bestellungen</p>

      {/* Stats */}
      <div className="admin-stats-grid" style={{ marginBottom: 20 }}>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats.total}</div>
          <div className="admin-stat-label">Gesamt</div>
        </div>
        <div className="admin-stat-card accent">
          <div className="admin-stat-value">{stats.submitted}</div>
          <div className="admin-stat-label">Eingereicht</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{stats.sent}</div>
          <div className="admin-stat-label">An Partner</div>
        </div>
        <div className="admin-stat-card success">
          <div className="admin-stat-value">{stats.delivered}</div>
          <div className="admin-stat-label">Geliefert</div>
        </div>
      </div>

      {/* Filters */}
      <div className="pb-filter-tabs">
        <button className={`pb-filter-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          Alle ({orders.length})
        </button>
        {allStatuses.map(s => {
          const count = orders.filter(o => o.status === s).length
          if (count === 0 && s !== 'submitted') return null
          return (
            <button key={s} className={`pb-filter-tab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
              {statusLabels[s]} ({count})
            </button>
          )
        })}
      </div>

      {/* Orders */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink4)' }}>Keine Bestellungen gefunden.</div>
      ) : (
        filtered.map(order => (
          <div key={order.id} className="admin-order-card">
            <div className="admin-order-header">
              <div>
                <div className="admin-order-name">{order.delivery_name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink4)' }}>
                  {order.profiles?.email || ''} · #{order.id.slice(0, 8)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`pb-status ${order.status}`}>{statusLabels[order.status]}</span>
                <div className="admin-order-date">{new Date(order.created_at).toLocaleDateString('de-DE')}</div>
              </div>
            </div>

            {/* Items Summary */}
            <div className="admin-order-items">
              {order.carebox_cart?.items?.map((item: { item_id: string; qty: number }, i: number) => (
                <span key={i}>
                  {item.qty}× {catalogMap[item.item_id] || item.item_id.slice(0, 8)}
                  {i < (order.carebox_cart?.items?.length || 0) - 1 ? ' · ' : ''}
                </span>
              ))}
            </div>

            <div className="admin-order-footer">
              <div className="admin-order-amount">~{order.carebox_cart?.estimated_total?.toFixed(2) || '0.00'} €</div>
              <div className="admin-order-actions">
                <button className="admin-order-btn ghost" onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                  {expandedId === order.id ? 'Weniger' : 'Details'}
                </button>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedId === order.id && (
              <div style={{ marginTop: 12, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.8, marginBottom: 12 }}>
                  <div><strong>Adresse:</strong> {order.delivery_address}</div>
                  <div><strong>Telefon:</strong> {order.delivery_phone || '–'}</div>
                  <div><strong>Monat:</strong> {order.carebox_cart?.month || '–'}</div>
                  <div><strong>DSGVO-Einwilligung:</strong> {order.consent_share_data ? 'Ja' : 'Nein'}</div>
                  {order.partner_reference && <div><strong>Partner-Ref:</strong> {order.partner_reference}</div>}
                </div>

                {/* Audit Log */}
                {order.audit_log && order.audit_log.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink4)', marginBottom: 4 }}>Verlauf</div>
                    {order.audit_log.map((log, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--ink4)', paddingLeft: 8, borderLeft: '2px solid var(--border)', marginBottom: 4 }}>
                        {new Date(log.timestamp).toLocaleString('de-DE')} — {log.note || log.action}
                      </div>
                    ))}
                  </div>
                )}

                {/* Status Actions */}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink4)', marginBottom: 6 }}>Status ändern</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {allStatuses.map(s => (
                    <button
                      key={s}
                      className={`admin-order-btn${order.status === s ? ' primary' : ' ghost'}`}
                      disabled={order.status === s}
                      onClick={() => updateStatus(order.id, s)}
                    >
                      {statusLabels[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
